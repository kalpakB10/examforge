import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient } from "@prisma/client";

interface StatsOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function teacherStatsRoutes(app: FastifyInstance, opts: StatsOptions) {
  const { prisma } = opts;

  // GET /teacher/stats — aggregate counts + recent chapters, scoped to the authenticated teacher
  app.get("/stats", async (req, reply) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) {
      return reply.code(401).send({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }

    // Class scope for this teacher
    const classes = await prisma.class.findMany({ where: { createdBy: userId }, select: { id: true } });
    const classIds = classes.map((c) => c.id);

    const subjects = await prisma.subject.findMany({ where: { classId: { in: classIds } }, select: { id: true } });
    const subjectIds = subjects.map((s) => s.id);

    // Parallel counts
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const [
      classCount,
      subjectCount,
      chapterCount,
      questionCount,
      mcqCount,
      subjectiveCount,
      examDraft,
      examActive,
      examCompleted,
      examExpiringSoon,
      recentChapters,
    ] = await Promise.all([
      prisma.class.count({ where: { createdBy: userId } }),
      prisma.subject.count({ where: { classId: { in: classIds } } }),
      prisma.chapter.count({ where: { subjectId: { in: subjectIds }, isActive: true } }),
      prisma.question.count({ where: { subjectId: { in: subjectIds }, isActive: true } }),
      prisma.question.count({ where: { subjectId: { in: subjectIds }, isActive: true, type: "MCQ" } }),
      prisma.question.count({ where: { subjectId: { in: subjectIds }, isActive: true, type: "SUBJECTIVE" } }),
      prisma.exam.count({ where: { createdBy: userId, status: "DRAFT", deletedAt: null } }),
      prisma.exam.count({ where: { createdBy: userId, status: "ACTIVE", deletedAt: null } }),
      prisma.exam.count({ where: { createdBy: userId, status: "COMPLETED", deletedAt: null } }),
      prisma.exam.findMany({
        where: {
          createdBy: userId,
          status: "ACTIVE",
          deletedAt: null,
          expiresAt: { gte: now, lte: in24h },
        },
        select: { id: true, title: true, examCode: true, expiresAt: true },
        orderBy: { expiresAt: "asc" },
        take: 5,
      }),
      prisma.chapter.findMany({
        where: { subjectId: { in: subjectIds }, isActive: true },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          subject: { select: { id: true, name: true } },
          subSubject: { select: { id: true, name: true } },
          _count: { select: { questions: { where: { isActive: true } } } },
        },
      }),
    ]);

    // Session/attempt aggregates (across teacher's exams)
    const teacherExamIds = (
      await prisma.exam.findMany({ where: { createdBy: userId, deletedAt: null }, select: { id: true } })
    ).map((e) => e.id);

    const [totalSessions, sessionsToday, submittedTotal] = await Promise.all([
      prisma.examSession.count({ where: { examId: { in: teacherExamIds } } }),
      prisma.examSession.count({
        where: {
          examId: { in: teacherExamIds },
          startedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.examSession.count({ where: { examId: { in: teacherExamIds }, status: "SUBMITTED" } }),
    ]);

    return reply.send({
      success: true,
      data: {
        counts: {
          classes: classCount,
          subjects: subjectCount,
          chapters: chapterCount,
          questions: questionCount,
          mcqQuestions: mcqCount,
          subjectiveQuestions: subjectiveCount,
        },
        exams: {
          draft: examDraft,
          active: examActive,
          completed: examCompleted,
          total: examDraft + examActive + examCompleted,
        },
        sessions: {
          total: totalSessions,
          last24h: sessionsToday,
          submitted: submittedTotal,
        },
        alerts: {
          expiringSoon: examExpiringSoon,
        },
        recentChapters,
      },
    });
  });

  // GET /teacher/activity — recent activity feed (last N events across exams, sessions, uploads)
  app.get("/activity", async (req, reply) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) {
      return reply.code(401).send({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }

    const teacherExamIds = (
      await prisma.exam.findMany({ where: { createdBy: userId, deletedAt: null }, select: { id: true } })
    ).map((e) => e.id);

    // Load in parallel: last 10 exams created, last 10 sessions started, last 10 questions uploaded
    const [recentExams, recentSessions, recentQuestions] = await Promise.all([
      prisma.exam.findMany({
        where: { createdBy: userId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, title: true, examCode: true, status: true, createdAt: true },
      }),
      prisma.examSession.findMany({
        where: { examId: { in: teacherExamIds } },
        orderBy: { startedAt: "desc" },
        take: 10,
        select: {
          id: true, examId: true, studentName: true, startedAt: true, submittedAt: true, status: true,
          exam: { select: { title: true, examCode: true } },
        },
      }),
      prisma.question.findMany({
        where: { createdBy: userId, isActive: true },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true, createdAt: true, type: true, text: true,
          subject: { select: { name: true } },
          chapter: {
            select: {
              name: true,
              subSubject: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    // Merge into a single timeline sorted by timestamp desc
    interface Event {
      type: "exam_created" | "session_started" | "session_submitted" | "question_added";
      timestamp: Date;
      title: string;
      subtitle?: string;
      link?: string;
      icon: string;
      color: string;
    }
    const events: Event[] = [];

    for (const e of recentExams) {
      events.push({
        type: "exam_created",
        timestamp: e.createdAt,
        title: `Exam created: ${e.title}`,
        subtitle: e.examCode ? `Code ${e.examCode} · ${e.status}` : e.status,
        link: `/teacher/exams`,
        icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
        color: "indigo",
      });
    }
    for (const s of recentSessions) {
      const isSubmitted = s.status === "SUBMITTED";
      events.push({
        type: isSubmitted ? "session_submitted" : "session_started",
        timestamp: (isSubmitted && s.submittedAt) ? s.submittedAt : s.startedAt,
        title: isSubmitted
          ? `${s.studentName ?? "A student"} submitted ${s.exam?.title ?? "an exam"}`
          : `${s.studentName ?? "A student"} started ${s.exam?.title ?? "an exam"}`,
        subtitle: s.exam?.examCode ? `Code ${s.exam.examCode}` : undefined,
        link: `/teacher/exams/${s.examId}/results`,
        icon: isSubmitted
          ? "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          : "M13 10V3L4 14h7v7l9-11h-7z",
        color: isSubmitted ? "green" : "blue",
      });
    }
    for (const q of recentQuestions) {
      // Build the full hierarchy: Subject → Sub-subject → Chapter (skip missing links)
      const parts = [
        q.subject?.name,
        (q.chapter as any)?.subSubject?.name,
        q.chapter?.name,
      ].filter(Boolean);
      events.push({
        type: "question_added",
        timestamp: q.createdAt,
        title: `${q.type === "MCQ" ? "MCQ" : "Subjective"} question added`,
        subtitle: parts.length > 0 ? parts.join(" › ") : undefined,
        link: `/teacher/questions`,
        icon: "M12 4v16m8-8H4",
        color: q.type === "MCQ" ? "blue" : "amber",
      });
    }

    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return reply.send({
      success: true,
      data: { events: events.slice(0, 20) },
    });
  });
}
