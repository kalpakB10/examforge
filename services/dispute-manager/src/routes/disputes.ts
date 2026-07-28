import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient, DisputeStatus, ExamStatus, CorrectOption } from "@prisma/client";
import { Queue } from "bullmq";
import { requireUser, getCallerRole, getCallerUserId } from "../lib/authz";

/**
 * Sends 404 (no leak) if the caller isn't the teacher who owns the exam.
 */
async function requireExamOwner(
  prisma: PrismaClient,
  examId: string,
  userId: string,
  reply: import("fastify").FastifyReply,
): Promise<boolean> {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { createdBy: true } });
  if (!exam || exam.createdBy !== userId) {
    reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
    return false;
  }
  return true;
}

interface DisputeRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
  resultQueue: Queue;
}

export async function disputeRoutes(
  app: FastifyInstance,
  opts: DisputeRouteOptions
) {
  const { prisma, resultQueue } = opts;

  // POST /disputes — student raises dispute
  app.post("/", async (req, reply) => {
    // studentId comes from the authenticated caller, NOT the request body
    const callerId = getCallerUserId(req);
    if (!callerId) {
      return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
    const body = req.body as {
      examSessionId: string;
      questionId: string;
      studentReason: string;
    };

    const session = await prisma.examSession.findUnique({
      where: { id: body.examSessionId },
      include: { exam: true },
    });

    if (!session) {
      return reply.code(404).send({
        success: false,
        error: { code: "SESSION_NOT_FOUND", message: "Exam session not found" },
      });
    }

    if (session.studentId !== callerId) {
      return reply.code(404).send({
        success: false,
        error: { code: "NOT_FOUND", message: "Resource not found" },
      });
    }

    if (session.exam.status !== ExamStatus.COMPLETED) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "EXAM_NOT_COMPLETED",
          message: "Disputes can only be raised after the exam is completed",
        },
      });
    }

    // Verify question belongs to this exam
    const examQuestion = await prisma.examQuestion.findFirst({
      where: { examId: session.examId, questionId: body.questionId },
    });

    if (!examQuestion) {
      return reply.code(400).send({
        success: false,
        error: {
          code: "INVALID_QUESTION",
          message: "This question does not belong to the exam",
        },
      });
    }

    const dispute = await prisma.dispute.create({
      data: {
        examSessionId: body.examSessionId,
        studentId: callerId,
        examId: session.examId,
        questionId: body.questionId,
        studentReason: body.studentReason,
        status: DisputeStatus.OPEN,
      },
    });

    return reply.code(201).send({ success: true, data: dispute });
  });

  // GET /disputes/exam/:exam_id — teacher sees all disputes for an exam they own
  app.get("/exam/:exam_id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { exam_id } = req.params as { exam_id: string };
    if (!(await requireExamOwner(prisma, exam_id, userId, reply))) return;

    const disputes = await prisma.dispute.findMany({
      where: { examId: exam_id },
      include: { question: true, examSession: true },
      orderBy: { raisedAt: "desc" },
    });

    return reply.send({ success: true, data: disputes });
  });

  // GET /disputes/student — student sees their own disputes
  app.get("/student", async (req, reply) => {
    const callerId = getCallerUserId(req);
    if (!callerId) {
      return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
    // Always scope to the authenticated caller; query.student_id is ignored
    const disputes = await prisma.dispute.findMany({
      where: { studentId: callerId },
      include: { question: true },
      orderBy: { raisedAt: "desc" },
    });

    return reply.send({ success: true, data: disputes });
  });

  // GET /disputes/:id — caller must be the exam owner or the raising student
  app.get("/:id", async (req, reply) => {
    const callerId = getCallerUserId(req);
    const role = getCallerRole(req);
    if (!callerId) {
      return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
    const { id } = req.params as { id: string };

    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: { question: true, examSession: true, exam: { select: { createdBy: true } } },
    });

    if (!dispute) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
    }
    const isTeacherOwner = role === "TEACHER" && dispute.exam?.createdBy === callerId;
    const isRaisingStudent = dispute.studentId === callerId;
    if (!isTeacherOwner && !isRaisingStudent) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
    }

    return reply.send({ success: true, data: dispute });
  });

  // PATCH /disputes/:id/resolve — teacher who owns the exam resolves the dispute
  app.patch("/:id/resolve", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const body = req.body as {
      status: "ACCEPTED" | "REJECTED";
      teacherNote?: string;
      newCorrectOption?: CorrectOption;
    };

    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: { exam: { select: { createdBy: true } } },
    });
    if (!dispute || dispute.exam.createdBy !== userId) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
    }

    if (dispute.status !== DisputeStatus.OPEN && dispute.status !== DisputeStatus.UNDER_REVIEW) {
      return reply.code(400).send({
        success: false,
        error: { code: "ALREADY_RESOLVED", message: "Dispute is already resolved" },
      });
    }

    const resolvedStatus =
      body.status === "ACCEPTED" ? DisputeStatus.ACCEPTED : DisputeStatus.REJECTED;

    await prisma.dispute.update({
      where: { id },
      data: {
        status: resolvedStatus,
        teacherNote: body.teacherNote,
        resolvedBy: userId,
        resolvedAt: new Date(),
      },
    });

    if (body.status === "ACCEPTED") {
      // Update the question's correct option if provided
      if (body.newCorrectOption) {
        await prisma.question.update({
          where: { id: dispute.questionId },
          data: { correctOption: body.newCorrectOption },
        });
      }

      // Trigger full exam result recalculation
      const sessions = await prisma.examSession.findMany({
        where: {
          examId: dispute.examId,
          status: { in: ["SUBMITTED", "EXPIRED"] },
        },
      });

      for (const session of sessions) {
        await resultQueue.add("calculate-result", {
          sessionId: session.id,
          examId: dispute.examId,
          studentId: session.studentId,
        });
      }
    }

    return reply.send({
      success: true,
      data: { message: `Dispute ${body.status.toLowerCase()}` },
    });
  });

  // PATCH /disputes/:id/status — update to UNDER_REVIEW (teacher-owner only)
  app.patch("/:id/status", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const body = req.body as { status: DisputeStatus };

    const existing = await prisma.dispute.findUnique({
      where: { id },
      include: { exam: { select: { createdBy: true } } },
    });
    if (!existing || existing.exam.createdBy !== userId) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
    }

    const dispute = await prisma.dispute.update({
      where: { id },
      data: { status: body.status },
    });

    return reply.send({ success: true, data: dispute });
  });
}
