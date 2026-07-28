import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient, ExamStatus, TimerMode, Prisma } from "@prisma/client";
import * as fs from "fs";
import { Queue } from "bullmq";
import { RenderJobData } from "../pdfWorker";
import { sampleComposition, SectionSpec } from "../selector/sampler";
import { requireUser, requireOwnership } from "../lib/authz";

interface ExamRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
  pdfQueue: Queue<RenderJobData>;
}

function genExamCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return suffix;
}

async function uniqueExamCode(prisma: PrismaClient): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = genExamCode();
    const exists = await prisma.exam.findUnique({ where: { examCode: code } });
    if (!exists) return code;
  }
  throw new Error("Could not generate unique exam code");
}

interface Section {
  title?: string;
  type: "MCQ" | "SUBJECTIVE";
  marksPerQuestion: number;
  numQuestions: number;
  blankLines?: number;
  scope: { subjectIds?: string[]; chapterIds?: string[] };
  shuffle?: boolean;
  distributeAcrossChapters?: boolean;
  difficulty?: { easy?: number; medium?: number; hard?: number };
}

interface CreateBody {
  // Basics
  title: string;
  subjectId?: string;
  cohortId?: string;
  examCode?: string;
  expiresAt?: string;
  scheduledAt?: string;

  // Composition
  composition: Section[];
  templateId?: string;
  paperTitle?: string;
  date?: string;
  totalTime?: number;
  instructions?: string[];
  org: {
    orgName: string;
    address?: string;
    logoText?: string;
    examTitle?: string;
  };
  seed?: number;                   // if omitted, generated + persisted
  footerText?: string;             // teacher-editable footer text (single line)

  // Interactive-exam-only settings
  marksPerQuestion?: number;
  totalMarks?: number;
  timerMode?: TimerMode;
  durationMinutes?: number;
  negativeMarking?: boolean;
  negativeMarksValue?: number;

  // Delivery
  deliverInteractive?: boolean;
  deliverPdf?: boolean;
}

// Interactive delivery uses only MCQ sections — filter them and sample with the shared engine.
async function sampleForInteractive(
  prisma: PrismaClient,
  composition: Section[],
  seed: number
): Promise<{ ids: string[]; errors: string[] }> {
  const mcqSpecs: SectionSpec[] = composition
    .filter((s) => s.type === "MCQ")
    .map((s, i) => ({
      title: s.title || `Section ${String.fromCharCode(65 + i)}`,
      type: "MCQ",
      marksPerQuestion: s.marksPerQuestion,
      numQuestions: s.numQuestions,
      scope: s.scope,
      shuffle: s.shuffle,
      distributeAcrossChapters: s.distributeAcrossChapters,
      difficulty: s.difficulty,
    }));
  const result = await sampleComposition(prisma, mcqSpecs, seed);
  const ids: string[] = [];
  for (const s of result.sections) for (const q of s.questions) ids.push(q.id);
  return { ids, errors: result.errors };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function examRoutes(app: FastifyInstance, opts: ExamRouteOptions) {
  const { prisma, pdfQueue } = opts;

  // ── PUBLIC: GET /exams/join/:exam_code — no auth needed ─────────────────
  app.get("/join/:exam_code", async (req, reply) => {
    const { exam_code } = req.params as { exam_code: string };

    const exam = await prisma.exam.findUnique({
      where: { examCode: exam_code.toUpperCase() },
      include: { subject: true },
    });

    if (!exam) {
      return reply.code(404).send({
        success: false,
        error: { code: "NOT_FOUND", message: "No exam found with this code. Check the code and try again." },
      });
    }
    if (exam.deletedAt) {
      // Same 404 as "no exam with this code" — don't leak that it once existed.
      return reply.code(404).send({
        success: false,
        error: { code: "NOT_FOUND", message: "No exam found with this code. Check the code and try again." },
      });
    }
    if (exam.status !== ExamStatus.ACTIVE) {
      return reply.code(403).send({
        success: false,
        error: { code: "EXAM_NOT_ACTIVE", message: "This exam is not currently accepting submissions." },
      });
    }
    // Expiry enforcement
    if (exam.expiresAt && exam.expiresAt.getTime() <= Date.now()) {
      return reply.code(410).send({
        success: false,
        error: { code: "EXAM_EXPIRED", message: "This exam has expired and no longer accepts new sessions." },
      });
    }
    // Interactive delivery gate
    if (!exam.deliverInteractive) {
      return reply.code(403).send({
        success: false,
        error: { code: "INTERACTIVE_DISABLED", message: "This exam is print-only. Online sessions are not available." },
      });
    }

    return reply.send({
      success: true,
      data: {
        examId: exam.id,
        examCode: exam.examCode,
        title: exam.title,
        subject: exam.subject?.name ?? null,
        totalQuestions: exam.totalQuestions,
        totalMarks: exam.totalMarks,
        durationMinutes: exam.durationMinutes,
        timerMode: exam.timerMode,
        negativeMarking: exam.negativeMarking,
        negativeMarksValue: exam.negativeMarksValue,
        expiresAt: exam.expiresAt,
        status: exam.status,
      },
    });
  });

  // ── POST /exams — unified create: compose + interactive + pdf ────────────
  app.post("/", async (req, reply) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    const userRole = req.headers["x-user-role"] as string | undefined;
    if (!userId) {
      return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
    const body = req.body as CreateBody;

    if (!body.title?.trim()) {
      return reply.code(400).send({ success: false, error: { code: "MISSING_TITLE", message: "Title is required" } });
    }
    if (!Array.isArray(body.composition) || body.composition.length === 0) {
      return reply.code(400).send({ success: false, error: { code: "NO_SECTIONS", message: "At least one section is required" } });
    }
    if (!body.org?.orgName?.trim()) {
      return reply.code(400).send({ success: false, error: { code: "MISSING_ORG", message: "org.orgName is required" } });
    }
    const deliverInteractive = body.deliverInteractive !== false;
    const deliverPdf = body.deliverPdf !== false;
    if (!deliverInteractive && !deliverPdf) {
      return reply.code(400).send({ success: false, error: { code: "NO_DELIVERY", message: "Pick at least one delivery mode (interactive or PDF)." } });
    }

    // Derive interactive-exam settings from composition (MCQ only)
    const mcqSections = body.composition.filter((s) => s.type === "MCQ");
    const totalMcq = mcqSections.reduce((a, s) => a + s.numQuestions, 0);
    const mcqMarks = mcqSections.reduce((a, s) => a + s.numQuestions * s.marksPerQuestion, 0);

    if (deliverInteractive && totalMcq === 0) {
      return reply.code(400).send({
        success: false,
        error: { code: "NO_MCQ", message: "Interactive delivery requires at least one MCQ section. Add MCQ sections or turn off interactive delivery." },
      });
    }

    // Total across all sections (for display in exam list)
    const totalQuestions = body.composition.reduce((a, s) => a + s.numQuestions, 0);
    const totalMarks = body.composition.reduce((a, s) => a + s.numQuestions * s.marksPerQuestion, 0);

    // Fields used by interactive-exam auto-grading — use MCQ-derived values
    const marksPerQuestion = body.marksPerQuestion ?? (mcqSections[0]?.marksPerQuestion ?? 1);
    const durationMinutes = body.durationMinutes ?? Math.max(30, Math.ceil(totalMarks * 1.2));
    const timerMode = body.timerMode ?? TimerMode.FIXED_DURATION;
    const subjectId = body.subjectId ?? (mcqSections[0]?.scope?.subjectIds?.[0] ?? mcqSections[0]?.scope?.chapterIds?.[0]);
    if (!subjectId) {
      return reply.code(400).send({
        success: false,
        error: { code: "MISSING_SUBJECT", message: "Cannot derive a subject for this exam. Set subjectId or include a section scoped to a subject." },
      });
    }
    // Resolve subject in case only a chapter id was given
    let actualSubjectId = subjectId;
    if (!body.subjectId && mcqSections[0]?.scope?.chapterIds?.length) {
      const chId = mcqSections[0].scope.chapterIds[0];
      const ch = await prisma.chapter.findUnique({ where: { id: chId }, select: { subjectId: true } });
      if (ch) actualSubjectId = ch.subjectId;
    }

    // Code
    let examCode: string;
    if (body.examCode) {
      examCode = body.examCode.toUpperCase().replace(/[^A-Z0-9-]/g, "");
      const existing = await prisma.exam.findUnique({ where: { examCode } });
      if (existing) {
        return reply.code(409).send({ success: false, error: { code: "CODE_TAKEN", message: `Exam code "${examCode}" is already in use.` } });
      }
    } else {
      examCode = await uniqueExamCode(prisma);
    }

    // Generate seed if none supplied — persisted with composition for reproducibility
    const seed = body.seed ?? Math.floor(Math.random() * 0xFFFFFFFF);

    // Sample questions for interactive delivery (before create, so we can bail if scope is thin)
    let sampledIds: string[] | null = null;
    if (deliverInteractive) {
      const s = await sampleForInteractive(prisma, body.composition, seed);
      if (s.errors.length > 0) {
        return reply.code(422).send({
          success: false,
          error: { code: "INSUFFICIENT_QUESTIONS", message: s.errors.join(" • ") },
        });
      }
      sampledIds = s.ids;
    }

    // Snapshot: store the whole composition + seed + sampled IDs so a paper is reproducible
    const compositionSnapshot = {
      sections: body.composition,
      seed,
      sampledQuestionIds: sampledIds ?? undefined,
    };

    // Create the exam + interactive questions + history atomically
    const exam = await prisma.$transaction(async (tx) => {
      const created = await tx.exam.create({
        data: {
          subjectId: actualSubjectId,
          cohortId: body.cohortId || "default",
          title: body.title.trim(),
          examCode,
          marksPerQuestion,
          totalMarks: deliverInteractive ? mcqMarks : totalMarks,
          totalQuestions: deliverInteractive ? totalMcq : totalQuestions,
          timerMode,
          durationMinutes,
          negativeMarking: body.negativeMarking ?? false,
          negativeMarksValue: body.negativeMarksValue ?? 0,
          createdBy: userId,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          status: deliverInteractive ? ExamStatus.ACTIVE : ExamStatus.DRAFT,
          deliverInteractive,
          deliverPdf,
          templateId: body.templateId,
          paperTitle: body.paperTitle || body.title,
          composition: compositionSnapshot as unknown as Prisma.InputJsonValue,
          orgSnapshot: { ...body.org, footerText: body.footerText ?? null } as unknown as Prisma.InputJsonValue,
          pdfStatus: deliverPdf ? "PENDING" : "NOT_REQUESTED",
        },
      });

      if (deliverInteractive && sampledIds && sampledIds.length > 0) {
        await tx.examQuestion.createMany({
          data: sampledIds.map((qid, idx) => ({ examId: created.id, questionId: qid, questionOrder: idx + 1 })),
        });
        await tx.examHistory.createMany({
          data: sampledIds.map((qid) => ({
            subjectId: created.subjectId,
            cohortId: created.cohortId,
            questionId: qid,
            usedInExamId: created.id,
          })),
        });
      }

      return created;
    });

    // Kick off PDF render fire-and-forget
    if (deliverPdf) {
      await pdfQueue.add("render", {
        examId: exam.id,
        userId,
        userRole: userRole || "TEACHER",
        templateId: body.templateId,
        composition: body.composition,
        seed,
        org: body.org,
        paperTitle: body.paperTitle || body.title,
        date: body.date,
        totalTime: body.totalTime,
        instructions: body.instructions,
        footerText: body.footerText,
      }, { jobId: `exam-${exam.id}` });
    }

    return reply.code(201).send({
      success: true,
      data: {
        exam,
        interactive: deliverInteractive ? {
          examCode: exam.examCode,
          joinUrl: `/exam/${exam.examCode}`,
        } : null,
        pdf: deliverPdf ? { status: "PENDING", statusUrl: `/exams/${exam.id}/pdf-status` } : null,
      },
    });
  });

  // ── GET /exams/:id/pdf-status — poll for PDF readiness ──────────────────
  app.get("/:id/pdf-status", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const exam = await prisma.exam.findUnique({
      where: { id },
      select: { pdfStatus: true, pdfError: true, paperPath: true, answerKeyPath: true, createdBy: true },
    });
    if (!requireOwnership(exam, userId, reply)) return;
    return reply.send({
      success: true,
      data: {
        status: exam.pdfStatus,
        error: exam.pdfError,
        paperReady: !!exam.paperPath,
        answerKeyReady: !!exam.answerKeyPath,
        paperUrl: exam.paperPath ? `/exams/${id}/paper.pdf` : null,
        answerKeyUrl: exam.answerKeyPath ? `/exams/${id}/answer-key.pdf` : null,
      },
    });
  });

  // ── GET /exams/:id/paper.pdf — stream stored blob (owner only) ──────────
  app.get("/:id/paper.pdf", async (req, reply) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    const { id } = req.params as { id: string };
    const exam = await prisma.exam.findUnique({ where: { id }, select: { paperPath: true, createdBy: true, paperTitle: true, title: true } });
    if (!exam || !exam.paperPath) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Paper not available yet" } });
    }
    if (userId && exam.createdBy !== userId) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Paper not available yet" } });
    }
    try {
      const buf = fs.readFileSync(exam.paperPath);
      const filename = `${(exam.paperTitle || exam.title || "paper").replace(/\s+/g, "_")}.pdf`;
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(buf);
    } catch (err) {
      return reply.code(500).send({ success: false, error: { code: "READ_FAILED", message: "Could not read paper file" } });
    }
  });

  // ── GET /exams/:id/answer-key.pdf ────────────────────────────────────────
  app.get("/:id/answer-key.pdf", async (req, reply) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    const { id } = req.params as { id: string };
    const exam = await prisma.exam.findUnique({ where: { id }, select: { answerKeyPath: true, createdBy: true, paperTitle: true, title: true } });
    if (!exam || !exam.answerKeyPath) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Answer key not available" } });
    }
    if (userId && exam.createdBy !== userId) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Answer key not available" } });
    }
    try {
      const buf = fs.readFileSync(exam.answerKeyPath);
      const filename = `${(exam.paperTitle || exam.title || "paper").replace(/\s+/g, "_")}_AnswerKey.pdf`;
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(buf);
    } catch (err) {
      return reply.code(500).send({ success: false, error: { code: "READ_FAILED", message: "Could not read answer key file" } });
    }
  });

  // ── POST /exams/:id/regenerate-pdf — re-render PDFs (owner only) ────────
  app.post("/:id/regenerate-pdf", async (req, reply) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    const userRole = req.headers["x-user-role"] as string | undefined;
    const { id } = req.params as { id: string };
    if (!userId) {
      return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
    const exam = await prisma.exam.findUnique({ where: { id } });
    if (!requireOwnership(exam, userId, reply)) return;
    if (!exam.composition || !exam.orgSnapshot) {
      return reply.code(400).send({ success: false, error: { code: "NO_COMPOSITION", message: "This exam has no stored composition (was created via legacy flow)." } });
    }

    // Pull the composition snapshot: { sections, seed, sampledQuestionIds? }
    const snap = exam.composition as any;
    const sections = snap?.sections ?? snap;
    const seed = snap?.seed;
    const orgSnap = (exam.orgSnapshot ?? {}) as any;

    // Use a distinct jobId per regeneration so BullMQ doesn't dedupe with the
    // original create-time job (which stays in "completed" for 24h).
    await pdfQueue.add("render", {
      examId: exam.id,
      userId,
      userRole: userRole || "TEACHER",
      templateId: exam.templateId ?? undefined,
      composition: sections,
      seed,
      org: {
        orgName: orgSnap.orgName,
        address: orgSnap.address,
        logoText: orgSnap.logoText,
        examTitle: orgSnap.examTitle,
      },
      paperTitle: exam.paperTitle || exam.title,
      footerText: orgSnap.footerText ?? undefined,
    }, { jobId: `exam-${exam.id}-regen-${Date.now()}` });

    return reply.send({ success: true, data: { status: "PENDING", message: "Regeneration started" } });
  });

  // ── GET /exams/:id — get exam details ────────────────────────────────────
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { role?: string };
    const userId = (req.headers["x-user-id"] as string | undefined) ?? "";
    const userRole = (req.headers["x-user-role"] as string | undefined) ?? "";
    // Teacher intent comes from the JWT-derived header, not the query string
    // (the ?role= query controls only whether the correct answer is redacted).
    const isTeacher = userRole === "TEACHER" || query.role === "TEACHER";

    const exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        subject: true,
        examQuestions: { orderBy: { questionOrder: "asc" }, include: { question: true } },
      },
    });
    if (!exam) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Exam not found" } });
    }
    // Teachers may only view their own exams; hide existence otherwise.
    if (userRole === "TEACHER" && exam.createdBy !== userId) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
    }
    const examData = {
      ...exam,
      examQuestions: exam.examQuestions.map((eq) => ({
        ...eq,
        question: isTeacher ? eq.question : { ...eq.question, correctOption: undefined },
      })),
    };
    return reply.send({ success: true, data: examData });
  });

  // ── GET /exams — list exams, scoped ──────────────────────────────────────
  // By default excludes soft-deleted rows. Teachers can pass `?trash=1` to
  // see their trash (recoverable via /:id/restore).
  app.get("/", async (req, reply) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    const userRole = req.headers["x-user-role"] as string | undefined;
    const query = req.query as { cohort_id?: string; status?: ExamStatus; trash?: string };
    const isTeacher = userRole === "TEACHER";
    const showTrash = isTeacher && query.trash === "1";

    const where: Prisma.ExamWhereInput = {};
    if (!isTeacher) {
      where.status = ExamStatus.ACTIVE;
      where.deletedAt = null;
      if (query.cohort_id) where.cohortId = query.cohort_id;
    } else {
      if (query.status) where.status = query.status;
      if (userId) where.createdBy = userId;
      where.deletedAt = showTrash ? { not: null } : null;
    }
    const exams = await prisma.exam.findMany({
      where,
      include: { subject: true, _count: { select: { examSessions: true, results: true } } },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ success: true, data: exams });
  });

  // ── PATCH /exams/:id/status ──────────────────────────────────────────────
  app.patch("/:id/status", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const body = req.body as { status: ExamStatus };
    const validTransitions: Record<string, ExamStatus[]> = {
      DRAFT: [ExamStatus.ACTIVE],
      ACTIVE: [ExamStatus.COMPLETED],
      COMPLETED: [],
    };
    const exam = await prisma.exam.findUnique({ where: { id } });
    if (!requireOwnership(exam, userId, reply)) return;
    const allowed = validTransitions[exam.status];
    if (!allowed.includes(body.status)) {
      return reply.code(400).send({ success: false, error: { code: "INVALID_TRANSITION", message: `Cannot transition from ${exam.status} to ${body.status}` } });
    }
    const updated = await prisma.exam.update({ where: { id }, data: { status: body.status } });
    return reply.send({ success: true, data: updated });
  });

  // ── PATCH /exams/:id — update title/code/expiry ──────────────────────────
  app.patch("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const body = req.body as { title?: string; examCode?: string; scheduledAt?: string; expiresAt?: string | null };
    const exam = await prisma.exam.findUnique({ where: { id } });
    if (!requireOwnership(exam, userId, reply)) return;

    const data: Prisma.ExamUpdateInput = {};
    if (body.title) data.title = body.title;
    if (body.examCode) {
      const code = body.examCode.toUpperCase().replace(/[^A-Z0-9-]/g, "");
      const conflict = await prisma.exam.findFirst({ where: { examCode: code, NOT: { id } } });
      if (conflict) return reply.code(409).send({ success: false, error: { code: "CODE_TAKEN", message: `Code "${code}" already in use` } });
      data.examCode = code;
    }
    if (body.scheduledAt !== undefined) data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    const updated = await prisma.exam.update({ where: { id }, data });
    return reply.send({ success: true, data: updated });
  });

  // ── DELETE /exams/:id — SOFT delete (sets deletedAt, keeps PDFs) ─────────
  // Recoverable via POST /exams/:id/restore. A background purge script will
  // hard-delete rows past a retention window (see scripts/purge-old-exams.sh).
  app.delete("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const exam = await prisma.exam.findUnique({ where: { id } });
    if (!requireOwnership(exam, userId, reply)) return;
    if (exam.deletedAt) {
      return reply.code(400).send({ success: false, error: { code: "ALREADY_DELETED", message: "Exam is already in trash" } });
    }
    await prisma.exam.update({ where: { id }, data: { deletedAt: new Date() } });
    return reply.send({ success: true, data: { message: "Exam moved to trash", restorable: true } });
  });

  // ── POST /exams/:id/restore — undo a soft delete ─────────────────────────
  app.post("/:id/restore", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const exam = await prisma.exam.findUnique({ where: { id } });
    if (!requireOwnership(exam, userId, reply)) return;
    if (!exam.deletedAt) {
      return reply.code(400).send({ success: false, error: { code: "NOT_DELETED", message: "Exam is not deleted" } });
    }
    const restored = await prisma.exam.update({ where: { id }, data: { deletedAt: null } });
    return reply.send({ success: true, data: restored });
  });
}
