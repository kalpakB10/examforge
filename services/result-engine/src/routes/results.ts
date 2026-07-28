import { FastifyInstance, FastifyPluginOptions, FastifyReply } from "fastify";
import { PrismaClient } from "@prisma/client";
import { requireUser, getCallerUserId, getCallerRole } from "../lib/authz";

interface ResultRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

async function requireExamOwner(
  prisma: PrismaClient,
  examId: string,
  userId: string,
  reply: FastifyReply,
): Promise<boolean> {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { createdBy: true } });
  if (!exam || exam.createdBy !== userId) {
    reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
    return false;
  }
  return true;
}

export async function resultRoutes(app: FastifyInstance, opts: ResultRouteOptions) {
  const { prisma } = opts;

  // GET /results/session/:session_id — student gets their own result;
  // teacher gets any session under an exam they own.
  app.get("/session/:session_id", async (req, reply) => {
    const callerId = getCallerUserId(req);
    const role = getCallerRole(req);
    if (!callerId) {
      return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
    const { session_id } = req.params as { session_id: string };
    const sessionAuth = await prisma.examSession.findUnique({
      where: { id: session_id },
      select: { studentId: true, exam: { select: { createdBy: true } } },
    });
    if (!sessionAuth) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
    }
    const isStudentOwner = sessionAuth.studentId === callerId;
    const isTeacherOwner = role === "TEACHER" && sessionAuth.exam.createdBy === callerId;
    if (!isStudentOwner && !isTeacherOwner) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
    }

    const result = await prisma.result.findUnique({
      where: { examSessionId: session_id },
      include: { exam: { select: { title: true, totalMarks: true, totalQuestions: true, examCode: true } } },
    });

    if (!result) {
      // Check if session exists and is still processing
      const session = await prisma.examSession.findUnique({ where: { id: session_id } });
      if (session && (session.status === "SUBMITTED" || session.status === "EXPIRED")) {
        return reply.code(202).send({
          success: true,
          data: { status: "PROCESSING", message: "Your result is being calculated, check back in a moment." },
        });
      }
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Result not found" } });
    }

    const session = await prisma.examSession.findUnique({ where: { id: session_id } });

    return reply.send({
      success: true,
      data: {
        student: {
          name: result.studentName ?? session?.studentName ?? "Unknown",
          rollNumber: result.rollNumber ?? session?.rollNumber ?? "—",
        },
        exam: {
          title: result.exam.title,
          totalMarks: result.exam.totalMarks,
          totalQuestions: result.exam.totalQuestions,
          examCode: result.exam.examCode,
        },
        result: {
          correctCount: result.correctCount,
          wrongCount: result.wrongCount,
          skippedCount: result.skippedCount,
          rawScore: result.rawScore,
          negativeDeduction: result.negativeDeduction,
          finalScore: result.finalScore,
          percentage: result.percentage,
          rank: result.rank,
        },
        answerKeyUrl: result.answerKeyUrl,
        isAutoSubmitted: session?.isAutoSubmitted ?? false,
        submittedAt: session?.submittedAt,
        calculatedAt: result.calculatedAt,
      },
    });
  });

  // GET /results/exam/:exam_id — teacher gets ALL results for an exam they own
  app.get("/exam/:exam_id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { exam_id } = req.params as { exam_id: string };
    if (!(await requireExamOwner(prisma, exam_id, userId, reply))) return;

    const exam = await prisma.exam.findUnique({
      where: { id: exam_id },
      select: { title: true, totalMarks: true, totalQuestions: true, examCode: true, status: true },
    });
    if (!exam) return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Exam not found" } });

    const results = await prisma.result.findMany({
      where: { examId: exam_id },
      orderBy: [{ rank: "asc" }, { finalScore: "desc" }],
      include: { examSession: { select: { studentName: true, rollNumber: true, isAutoSubmitted: true, submittedAt: true } } },
    });

    // Also pull in-progress sessions for the summary
    const allSessions = await prisma.examSession.findMany({
      where: { examId: exam_id },
      select: { status: true, studentName: true, rollNumber: true },
    });

    const submitted = allSessions.filter(s => s.status === "SUBMITTED" || s.status === "EXPIRED").length;
    const inProgress = allSessions.filter(s => s.status === "IN_PROGRESS").length;
    const scores = results.map(r => r.finalScore);
    const avgScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0;

    const rankedResults = results.map((r, idx) => ({
      rank: r.rank ?? idx + 1,
      studentName: r.studentName ?? r.examSession?.studentName ?? "Unknown",
      rollNumber: r.rollNumber ?? r.examSession?.rollNumber ?? "—",
      correctCount: r.correctCount,
      wrongCount: r.wrongCount,
      skippedCount: r.skippedCount,
      rawScore: r.rawScore,
      negativeDeduction: r.negativeDeduction,
      finalScore: r.finalScore,
      percentage: r.percentage,
      isAutoSubmitted: r.examSession?.isAutoSubmitted ?? false,
      submittedAt: r.examSession?.submittedAt,
      answerKeyUrl: r.answerKeyUrl,
    }));

    return reply.send({
      success: true,
      data: {
        exam,
        summary: {
          totalStudents: allSessions.length,
          submitted,
          inProgress,
          resultsCalculated: results.length,
          averageScore: avgScore,
          highestScore: scores.length ? Math.max(...scores) : 0,
          lowestScore: scores.length ? Math.min(...scores) : 0,
        },
        results: rankedResults,
      },
    });
  });

  // POST /results/exam/:exam_id/finalize — assign ranks across all submitted results
  app.post("/exam/:exam_id/finalize", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { exam_id } = req.params as { exam_id: string };
    if (!(await requireExamOwner(prisma, exam_id, userId, reply))) return;

    const results = await prisma.result.findMany({
      where: { examId: exam_id },
      orderBy: { finalScore: "desc" },
    });

    if (results.length === 0) {
      return reply.code(404).send({ success: false, error: { code: "NO_RESULTS", message: "No results to finalize" } });
    }

    let rank = 1;
    for (let i = 0; i < results.length; i++) {
      if (i > 0 && results[i].finalScore < results[i - 1].finalScore) rank = i + 1;
      await prisma.result.update({ where: { id: results[i].id }, data: { rank } });
    }

    return reply.send({
      success: true,
      data: { message: `Ranks assigned for ${results.length} results`, totalRanked: results.length },
    });
  });

  // POST /results/exam/:exam_id/recalculate — requeue all results
  app.post("/exam/:exam_id/recalculate", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { exam_id } = req.params as { exam_id: string };
    if (!(await requireExamOwner(prisma, exam_id, userId, reply))) return;

    const sessions = await prisma.examSession.findMany({
      where: { examId: exam_id, status: { in: ["SUBMITTED", "EXPIRED"] } },
    });

    const { Queue } = await import("bullmq");
    const Redis = (await import("ioredis")).default;
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const queue = new Queue("result-calculation", {
      connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
    });

    for (const session of sessions) {
      await queue.add("calculate-result", {
        sessionId: session.id, examId: exam_id, studentId: session.studentId,
      });
    }

    return reply.send({ success: true, data: { message: `Queued ${sessions.length} recalculations` } });
  });
}
