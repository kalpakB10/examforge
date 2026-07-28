import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient } from "@prisma/client";

interface QuickTestOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

function genCode(): string {
  // 6-char alphanumeric, easy to read/type — no O/0/I/l
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function uniqueCode(prisma: PrismaClient): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = genCode();
    const exists = await prisma.quickTest.findUnique({ where: { code } });
    if (!exists) return code;
  }
  throw new Error("Could not generate unique code");
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

import { requireUser, requireOwnership } from "../lib/authz";

export async function quickTestRoutes(app: FastifyInstance, opts: QuickTestOptions) {
  const { prisma } = opts;

  // ── Teacher: Create a quick test ──────────────────────────────────────────
  // POST /quick-tests
  app.post("/", async (req, reply) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    const body = req.body as {
      title: string;
      chapterIds: string[];
      timeMinutes?: number;
      totalMarks?: number;
      shuffleQ?: boolean;
      expiresAt?: string;
    };

    if (!body.title || !body.chapterIds?.length) {
      return reply.code(400).send({
        success: false,
        error: { code: "MISSING_FIELDS", message: "title and chapterIds are required" },
      });
    }
    if (!userId) {
      return reply.code(401).send({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }

    // Derive defaults from chapters — must all belong to caller's classes
    const chapters = await prisma.chapter.findMany({
      where: { id: { in: body.chapterIds }, isActive: true },
      include: { subject: { select: { class: { select: { createdBy: true } } } } },
    });

    if (chapters.length === 0) {
      return reply.code(400).send({
        success: false,
        error: { code: "NO_CHAPTERS", message: "No active chapters found" },
      });
    }
    const notOwned = chapters.some((c) => !c.subject?.class || c.subject.class.createdBy !== userId);
    if (notOwned || chapters.length !== body.chapterIds.length) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
    }

    // Ensure at least one MCQ exists across the picked chapters — quick tests are MCQ-only
    const mcqCount = await prisma.question.count({
      where: { chapterId: { in: body.chapterIds }, isActive: true, type: "MCQ" },
    });
    if (mcqCount === 0) {
      return reply.code(400).send({
        success: false,
        error: { code: "NO_MCQ", message: "Selected chapters have no MCQ questions. Quick tests are MCQ-only." },
      });
    }

    const timeMinutes = body.timeMinutes ?? chapters.reduce((a, c) => a + c.timeMinutes, 0);
    const totalMarks = body.totalMarks ?? chapters.reduce((a, c) => a + c.totalMarks, 0);
    const code = await uniqueCode(prisma);

    const test = await prisma.quickTest.create({
      data: {
        code,
        title: body.title,
        chapterIds: body.chapterIds,
        timeMinutes,
        totalMarks,
        shuffleQ: body.shuffleQ ?? false,
        createdBy: userId,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    return reply.code(201).send({ success: true, data: test });
  });

  // ── Teacher: list own tests ───────────────────────────────────────────────
  // GET /quick-tests — scoped to the authenticated teacher
  app.get("/", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const tests = await prisma.quickTest.findMany({
      where: { createdBy: userId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { attempts: true } } },
    });
    return reply.send({ success: true, data: { tests } });
  });

  // ── Teacher: get one test + all attempts ─────────────────────────────────
  // GET /quick-tests/:id/results
  app.get("/:id/results", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const test = await prisma.quickTest.findUnique({
      where: { id },
      include: {
        attempts: {
          orderBy: { submittedAt: "desc" },
          select: {
            id: true,
            studentName: true,
            score: true,
            totalQ: true,
            correct: true,
            wrong: true,
            skipped: true,
            timeTaken: true,
            submittedAt: true,
            startedAt: true,
          },
        },
      },
    });
    if (!requireOwnership(test, userId, reply)) return;

    return reply.send({ success: true, data: test });
  });

  // ── Teacher: deactivate test ──────────────────────────────────────────────
  // DELETE /quick-tests/:id
  app.delete("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const t = await prisma.quickTest.findUnique({ where: { id }, select: { createdBy: true } });
    if (!requireOwnership(t, userId, reply)) return;
    await prisma.quickTest.update({ where: { id }, data: { isActive: false } });
    return reply.send({ success: true, data: { message: "Test deactivated" } });
  });

  // ── Student: resolve test by code ─────────────────────────────────────────
  // GET /quick-tests/code/:code  — returns test metadata + questions (no answers)
  app.get("/code/:code", async (req, reply) => {
    const { code } = req.params as { code: string };

    const test = await prisma.quickTest.findUnique({ where: { code: code.toUpperCase() } });

    if (!test || !test.isActive) {
      return reply.code(404).send({
        success: false,
        error: { code: "NOT_FOUND", message: "Test not found or no longer active. Check the code and try again." },
      });
    }

    if (test.expiresAt && new Date() > test.expiresAt) {
      return reply.code(410).send({
        success: false,
        error: { code: "EXPIRED", message: "This test has expired." },
      });
    }

    // Load questions from all chapters
    let questions = await prisma.question.findMany({
      where: { chapterId: { in: test.chapterIds }, isActive: true, type: "MCQ" },
      select: {
        id: true,
        text: true,
        optionA: true,
        optionB: true,
        optionC: true,
        optionD: true,
        optionAImageUrl: true,
        optionBImageUrl: true,
        optionCImageUrl: true,
        optionDImageUrl: true,
        questionImageUrl: true,
        difficulty: true,
        marksWeight: true,
        yearTag: true,
        chapterId: true,
        // correctOption intentionally EXCLUDED
      },
      orderBy: { createdAt: "asc" },
    });

    if (test.shuffleQ) questions = shuffle(questions);

    return reply.send({
      success: true,
      data: {
        testId: test.id,
        code: test.code,
        title: test.title,
        timeMinutes: test.timeMinutes,
        totalMarks: test.totalMarks,
        totalQuestions: questions.length,
        questions,
      },
    });
  });

  // ── Student: start attempt ────────────────────────────────────────────────
  // POST /quick-tests/attempts
  app.post("/attempts", async (req, reply) => {
    const body = req.body as { testId: string; studentName: string };

    if (!body.testId || !body.studentName?.trim()) {
      return reply.code(400).send({
        success: false,
        error: { code: "MISSING_FIELDS", message: "testId and studentName are required" },
      });
    }

    const test = await prisma.quickTest.findUnique({ where: { id: body.testId } });
    if (!test || !test.isActive) {
      return reply.code(404).send({
        success: false,
        error: { code: "NOT_FOUND", message: "Test not found" },
      });
    }

    const attempt = await prisma.quickTestAttempt.create({
      data: {
        testId: body.testId,
        studentName: body.studentName.trim(),
        answers: {},
      },
    });

    return reply.code(201).send({ success: true, data: { attemptId: attempt.id } });
  });

  // ── Student: save answer (auto-save) ─────────────────────────────────────
  // PUT /quick-tests/attempts/:attemptId/answer
  app.put("/attempts/:attemptId/answer", async (req, reply) => {
    const { attemptId } = req.params as { attemptId: string };
    const body = req.body as { questionId: string; answer: string };

    const attempt = await prisma.quickTestAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.submittedAt) {
      return reply.code(400).send({
        success: false,
        error: { code: "INVALID", message: "Attempt not found or already submitted" },
      });
    }

    const current = (attempt.answers as Record<string, string>) ?? {};
    current[body.questionId] = body.answer;

    await prisma.quickTestAttempt.update({
      where: { id: attemptId },
      data: { answers: current },
    });

    return reply.send({ success: true, data: { saved: true } });
  });

  // ── Student: submit + get result immediately ──────────────────────────────
  // POST /quick-tests/attempts/:attemptId/submit
  app.post("/attempts/:attemptId/submit", async (req, reply) => {
    const { attemptId } = req.params as { attemptId: string };
    const body = req.body as { timeTaken?: number; answers?: Record<string, string> };

    const attempt = await prisma.quickTestAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Attempt not found" } });
    }
    if (attempt.submittedAt) {
      // Already submitted — return stored result
      return reply.send({ success: true, data: attempt });
    }

    // Final answers override (client may send full map on submit)
    const finalAnswers: Record<string, string> = body.answers ?? (attempt.answers as Record<string, string>) ?? {};

    const test = await prisma.quickTest.findUnique({ where: { id: attempt.testId } });
    if (!test) return reply.code(500).send({ success: false, error: { code: "SERVER_ERROR", message: "Test not found" } });

    // Load questions with correct answers for scoring
    const questions = await prisma.question.findMany({
      where: { chapterId: { in: test.chapterIds }, isActive: true, type: "MCQ" },
      select: { id: true, correctOption: true, marksWeight: true },
    });

    let score = 0;
    let correct = 0;
    let wrong = 0;
    let skipped = 0;

    const answerDetail: Record<string, { given: string | null; correct: string; isCorrect: boolean }> = {};

    for (const q of questions) {
      const given = finalAnswers[q.id] ?? null;
      const correctOpt = q.correctOption as string;
      const isCorrect = given === correctOpt;
      answerDetail[q.id] = { given, correct: correctOpt, isCorrect };
      if (!given) {
        skipped++;
      } else if (isCorrect) {
        correct++;
        score += q.marksWeight;
      } else {
        wrong++;
      }
    }

    const updated = await prisma.quickTestAttempt.update({
      where: { id: attemptId },
      data: {
        answers: finalAnswers,
        score,
        totalQ: questions.length,
        correct,
        wrong,
        skipped,
        timeTaken: body.timeTaken ?? null,
        submittedAt: new Date(),
      },
    });

    return reply.send({
      success: true,
      data: {
        ...updated,
        answerDetail,
        percentage: questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0,
      },
    });
  });

  // ── Student: get attempt result ───────────────────────────────────────────
  // GET /quick-tests/attempts/:attemptId/result
  app.get("/attempts/:attemptId/result", async (req, reply) => {
    const { attemptId } = req.params as { attemptId: string };
    const attempt = await prisma.quickTestAttempt.findUnique({ where: { id: attemptId } });

    if (!attempt || !attempt.submittedAt) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Result not found yet" } });
    }

    const test = await prisma.quickTest.findUnique({ where: { id: attempt.testId } });
    const questions = await prisma.question.findMany({
      where: { chapterId: { in: test?.chapterIds ?? [] }, isActive: true },
      select: { id: true, text: true, correctOption: true, optionA: true, optionB: true, optionC: true, optionD: true },
    });

    const givenAnswers = (attempt.answers as Record<string, string>) ?? {};
    const review = questions.map((q) => ({
      id: q.id,
      text: q.text,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      correctOption: q.correctOption,
      givenAnswer: givenAnswers[q.id] ?? null,
      isCorrect: givenAnswers[q.id] === (q.correctOption as string),
    }));

    return reply.send({
      success: true,
      data: {
        attempt,
        test: { id: test?.id, title: test?.title, totalMarks: test?.totalMarks },
        review,
        percentage: attempt.totalQ ? Math.round(((attempt.correct ?? 0) / attempt.totalQ) * 100) : 0,
      },
    });
  });
}
