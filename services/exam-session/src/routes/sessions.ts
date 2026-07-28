import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient, ExamStatus, SessionStatus } from "@prisma/client";
import Redis from "ioredis";
import { Queue } from "bullmq";
import jwt from "jsonwebtoken";
import { env } from "../lib/env";

interface SessionRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
  redis: Redis;
  resultQueue: Queue;
}

interface SessionJwtPayload {
  sessionId: string;
  studentId: string;
  examId: string;
  examCode: string | null;
  rollNumber: string;
}

function signSessionToken(payload: SessionJwtPayload, durationMinutes: number): string {
  // Generous expiry: exam duration + 2 hours buffer
  const expiresIn = Math.max(durationMinutes * 60 + 7200, 14400);
  return jwt.sign(payload, env.SESSION_JWT_SECRET, { expiresIn });
}

function verifySessionToken(token: string): SessionJwtPayload | null {
  try {
    return jwt.verify(token, env.SESSION_JWT_SECRET) as SessionJwtPayload;
  } catch {
    return null;
  }
}

export async function sessionRoutes(app: FastifyInstance, opts: SessionRouteOptions) {
  const { prisma, redis, resultQueue } = opts;

  // ── PUBLIC: POST /sessions/join ──────────────────────────────────────────
  // Student identifies themselves + starts (or resumes) a session.
  // Rate-limited to slow enumeration of exam codes and roll numbers.
  app.post("/join", {
    config: {
      rateLimit: { max: 10, timeWindow: "5 minutes" },
    },
  }, async (req, reply) => {
    const body = req.body as {
      examCode: string;
      studentName: string;
      rollNumber: string;
      email?: string;
    };

    if (!body.examCode || !body.studentName?.trim() || !body.rollNumber?.trim()) {
      return reply.code(400).send({
        success: false,
        error: { code: "MISSING_FIELDS", message: "examCode, studentName and rollNumber are required" },
      });
    }

    const examCode = body.examCode.toUpperCase().trim();

    // 1. Look up exam
    const exam = await prisma.exam.findUnique({
      where: { examCode },
      include: {
        subject: true,
        examQuestions: {
          orderBy: { questionOrder: "asc" },
          include: { question: true },
        },
      },
    });

    if (!exam) {
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

    // 2. Determine the studentId for this session.
    // Logged-in students (x-user-id header from the gateway) get their real
    // user id, so their sessions link back to their account for /results/mine.
    // Anonymous students fall back to a stable virtual id derived from
    // (cohort, roll number) so the same roll on the same exam always
    // resumes the same session.
    const authedUserId = req.headers["x-user-id"] as string | undefined;
    const authedRole = req.headers["x-user-role"] as string | undefined;
    const virtualStudentId = authedUserId && authedRole === "STUDENT"
      ? authedUserId
      : `${exam.cohortId}::${body.rollNumber.trim().toUpperCase()}`;

    // 3. Check for existing session
    const existing = await prisma.examSession.findUnique({
      where: { examId_studentId: { examId: exam.id, studentId: virtualStudentId } },
    });

    if (existing) {
      if (existing.status === SessionStatus.SUBMITTED || existing.status === SessionStatus.EXPIRED) {
        return reply.code(409).send({
          success: false,
          error: { code: "ALREADY_SUBMITTED", message: "You have already submitted this exam." },
        });
      }

      // Resume existing IN_PROGRESS session
      const timerKey = `session:${existing.id}:timer`;
      const ttl = await redis.ttl(timerKey);
      const timeRemaining = Math.max(0, ttl);

      if (ttl <= 0) {
        // Timer expired but session not auto-submitted yet — trigger it
        await prisma.examSession.update({
          where: { id: existing.id },
          data: { status: SessionStatus.EXPIRED, submittedAt: new Date(), isAutoSubmitted: true },
        });
        await resultQueue.add("calculate-result", {
          sessionId: existing.id, examId: exam.id, studentId: virtualStudentId,
        });
        return reply.code(410).send({
          success: false,
          error: { code: "TIME_EXPIRED", message: "Your exam time expired. Your answers have been auto-submitted." },
        });
      }

      const sessionToken = signSessionToken(
        { sessionId: existing.id, studentId: virtualStudentId, examId: exam.id, examCode: exam.examCode, rollNumber: body.rollNumber.trim().toUpperCase() },
        exam.durationMinutes
      );

      const questions = buildQuestionsPayload(exam.examQuestions);

      return reply.send({
        success: true,
        data: {
          resumed: true,
          sessionToken,
          sessionId: existing.id,
          student: { id: virtualStudentId, name: existing.studentName ?? body.studentName.trim(), rollNumber: body.rollNumber.trim().toUpperCase() },
          exam: { title: exam.title, totalQuestions: exam.totalQuestions, durationMinutes: exam.durationMinutes, timerMode: exam.timerMode, negativeMarking: exam.negativeMarking },
          questions,
          alreadyAnswered: (existing.answers as Record<string, string>) ?? {},
          timer: { timeRemainingSeconds: timeRemaining },
        },
      });
    }

    // 4. Create new session (handle race condition via unique constraint)
    let session: { id: string; answers: unknown };
    try {
      session = await prisma.examSession.create({
        data: {
          examId: exam.id,
          studentId: virtualStudentId,
          studentName: body.studentName.trim(),
          rollNumber: body.rollNumber.trim().toUpperCase(),
          status: SessionStatus.IN_PROGRESS,
          answers: {},
        },
      });
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === "P2002") {
        // Race: another request won; fetch and resume that session
        const raceSession = await prisma.examSession.findUnique({
          where: { examId_studentId: { examId: exam.id, studentId: virtualStudentId } },
        });
        if (!raceSession) throw e;
        const timerKey = `session:${raceSession.id}:timer`;
        const ttl = await redis.ttl(timerKey);
        const sessionToken = signSessionToken(
          { sessionId: raceSession.id, studentId: virtualStudentId, examId: exam.id, examCode: exam.examCode, rollNumber: body.rollNumber.trim().toUpperCase() },
          exam.durationMinutes
        );
        return reply.send({
          success: true,
          data: {
            resumed: true,
            sessionToken,
            sessionId: raceSession.id,
            student: { id: virtualStudentId, name: raceSession.studentName ?? body.studentName.trim(), rollNumber: body.rollNumber.trim().toUpperCase() },
            exam: { title: exam.title, totalQuestions: exam.totalQuestions, durationMinutes: exam.durationMinutes, timerMode: exam.timerMode, negativeMarking: exam.negativeMarking },
            questions: buildQuestionsPayload(exam.examQuestions),
            alreadyAnswered: (raceSession.answers as Record<string, string>) ?? {},
            timer: { timeRemainingSeconds: Math.max(0, ttl) },
          },
        });
      }
      throw e;
    }

    // 5. Set Redis timer
    let durationSeconds: number;
    if (exam.timerMode === "PER_QUESTION") {
      durationSeconds = exam.durationMinutes * 60 * exam.totalQuestions;
    } else {
      durationSeconds = exam.durationMinutes * 60;
    }
    const timerKey = `session:${session.id}:timer`;
    await redis.set(timerKey, durationSeconds, "EX", durationSeconds);

    // 6. Issue session JWT
    const sessionToken = signSessionToken(
      { sessionId: session.id, studentId: virtualStudentId, examId: exam.id, examCode: exam.examCode, rollNumber: body.rollNumber.trim().toUpperCase() },
      exam.durationMinutes
    );

    const questions = buildQuestionsPayload(exam.examQuestions);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationSeconds * 1000);

    return reply.code(201).send({
      success: true,
      data: {
        resumed: false,
        sessionToken,
        sessionId: session.id,
        student: { id: virtualStudentId, name: body.studentName.trim(), rollNumber: body.rollNumber.trim().toUpperCase() },
        exam: {
          title: exam.title,
          totalQuestions: exam.totalQuestions,
          durationMinutes: exam.durationMinutes,
          timerMode: exam.timerMode,
          negativeMarking: exam.negativeMarking,
          negativeMarksValue: exam.negativeMarksValue,
        },
        questions,
        alreadyAnswered: {},
        timer: {
          startedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          timeRemainingSeconds: durationSeconds,
        },
      },
    });
  });

  // ── LEGACY: POST /sessions/start (kept for backward compat) ──────────────
  app.post("/start", async (req, reply) => {
    const body = req.body as { examId: string; studentId: string };

    const exam = await prisma.exam.findUnique({
      where: { id: body.examId },
      include: {
        examQuestions: { orderBy: { questionOrder: "asc" }, include: { question: true } },
      },
    });

    if (!exam) return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Exam not found" } });
    if (exam.status !== ExamStatus.ACTIVE) return reply.code(400).send({ success: false, error: { code: "EXAM_NOT_ACTIVE", message: "Exam is not active" } });

    const existing = await prisma.examSession.findUnique({
      where: { examId_studentId: { examId: body.examId, studentId: body.studentId } },
    });
    if (existing) return reply.code(409).send({ success: false, error: { code: "ALREADY_STARTED", message: "Student already started this exam" } });

    const session = await prisma.examSession.create({
      data: { examId: body.examId, studentId: body.studentId, status: SessionStatus.IN_PROGRESS, answers: {} },
    });

    let durationSeconds = exam.timerMode === "PER_QUESTION"
      ? exam.durationMinutes * 60 * exam.totalQuestions
      : exam.durationMinutes * 60;

    await redis.set(`session:${session.id}:timer`, durationSeconds, "EX", durationSeconds);

    return reply.code(201).send({
      success: true,
      data: { sessionId: session.id, examId: body.examId, timeRemaining: durationSeconds, questions: buildQuestionsPayload(exam.examQuestions) },
    });
  });

  // PUT /sessions/:id/answer
  app.put("/:id/answer", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { questionOrder: number; selectedOption: string | null };

    const session = await prisma.examSession.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Session not found" } });
    if (session.status !== SessionStatus.IN_PROGRESS) {
      return reply.code(400).send({ success: false, error: { code: "SESSION_NOT_ACTIVE", message: "Session is not in progress" } });
    }

    const timerKey = `session:${id}:timer`;
    const ttl = await redis.ttl(timerKey);
    if (ttl <= 0) {
      // Auto-submit
      await prisma.examSession.update({ where: { id }, data: { status: SessionStatus.EXPIRED, submittedAt: new Date(), isAutoSubmitted: true } });
      await resultQueue.add("calculate-result", { sessionId: id, examId: session.examId, studentId: session.studentId });
      return reply.code(410).send({
        success: false,
        error: { code: "TIME_EXPIRED", message: "Your exam time has expired. Your answers have been auto-submitted." },
      });
    }

    const currentAnswers = (session.answers as Record<string, string>) ?? {};
    if (body.selectedOption === null || body.selectedOption === "") {
      delete currentAnswers[String(body.questionOrder)];
    } else {
      currentAnswers[String(body.questionOrder)] = body.selectedOption;
    }

    await prisma.examSession.update({ where: { id }, data: { answers: currentAnswers } });

    const answeredCount = Object.keys(currentAnswers).length;
    return reply.send({ success: true, data: { saved: true, answeredCount, timeRemainingSeconds: ttl } });
  });

  // POST /sessions/:id/submit
  app.post("/:id/submit", async (req, reply) => {
    const { id } = req.params as { id: string };

    const session = await prisma.examSession.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Session not found" } });
    if (session.status !== SessionStatus.IN_PROGRESS) {
      return reply.code(400).send({ success: false, error: { code: "ALREADY_SUBMITTED", message: "Session already submitted" } });
    }

    await prisma.examSession.update({
      where: { id },
      data: { status: SessionStatus.SUBMITTED, submittedAt: new Date(), isAutoSubmitted: false },
    });

    await redis.del(`session:${id}:timer`);

    await resultQueue.add("calculate-result", {
      sessionId: id, examId: session.examId, studentId: session.studentId,
    });

    return reply.send({
      success: true,
      data: {
        message: "Exam submitted successfully",
        sessionId: id,
        resultAvailableAt: "Results will be available shortly",
      },
    });
  });

  // GET /sessions/:id/timer
  app.get("/:id/timer", async (req, reply) => {
    const { id } = req.params as { id: string };

    const session = await prisma.examSession.findUnique({ where: { id }, include: { exam: true } });
    if (!session) return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Session not found" } });

    const timerKey = `session:${id}:timer`;
    const ttl = await redis.ttl(timerKey);

    let totalDuration: number;
    if (session.exam.timerMode === "PER_QUESTION") {
      totalDuration = session.exam.durationMinutes * 60 * session.exam.totalQuestions;
    } else {
      totalDuration = session.exam.durationMinutes * 60;
    }

    const timeRemaining = Math.max(0, ttl);
    const percentageUsed = totalDuration > 0 ? Math.round(((totalDuration - timeRemaining) / totalDuration) * 100) : 100;

    return reply.send({
      success: true,
      data: { timeRemainingSeconds: timeRemaining, percentageUsed, expired: ttl <= 0 },
    });
  });

  // GET /sessions/:id/progress — student sync
  app.get("/:id/progress", async (req, reply) => {
    const { id } = req.params as { id: string };

    const session = await prisma.examSession.findUnique({
      where: { id },
      include: { exam: { select: { totalQuestions: true } } },
    });
    if (!session) return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Session not found" } });

    const timerKey = `session:${id}:timer`;
    const ttl = await redis.ttl(timerKey);
    const answers = (session.answers as Record<string, string>) ?? {};

    return reply.send({
      success: true,
      data: {
        sessionId: id,
        status: session.status,
        answers,
        answeredCount: Object.keys(answers).length,
        totalQuestions: session.exam.totalQuestions,
        timeRemainingSeconds: Math.max(0, ttl),
      },
    });
  });

  // GET /sessions/:id
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await prisma.examSession.findUnique({ where: { id }, include: { exam: true } });
    if (!session) return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Session not found" } });
    return reply.send({ success: true, data: session });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────

function buildQuestionsPayload(examQuestions: Array<{
  questionOrder: number;
  questionId: string;
  question: {
    text: string;
    questionImageUrl: string | null;
    optionA: string | null;
    optionAImageUrl: string | null;
    optionB: string | null;
    optionBImageUrl: string | null;
    optionC: string | null;
    optionCImageUrl: string | null;
    optionD: string | null;
    optionDImageUrl: string | null;
    difficulty: string;
    tags: string[];
  };
}>) {
  return examQuestions.map((eq) => ({
    order: eq.questionOrder,
    id: eq.questionId,
    text: eq.question.text,
    questionImageUrl: eq.question.questionImageUrl,
    optionA: eq.question.optionA,
    optionAImageUrl: eq.question.optionAImageUrl,
    optionB: eq.question.optionB,
    optionBImageUrl: eq.question.optionBImageUrl,
    optionC: eq.question.optionC,
    optionCImageUrl: eq.question.optionCImageUrl,
    optionD: eq.question.optionD,
    optionDImageUrl: eq.question.optionDImageUrl,
    difficulty: eq.question.difficulty,
    tags: eq.question.tags,
    // correctOption intentionally EXCLUDED
  }));
}
