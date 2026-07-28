import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient, Prisma } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { parse as csvParse } from "csv-parse";
import { StorageService, sanitizeFilename } from "../storage/StorageService";
import { requireUser, assertOwnsSubject, assertOwnsChapter } from "../lib/authz";

interface ChapterRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
  storage: StorageService;
}

export async function chapterRoutes(
  app: FastifyInstance,
  opts: ChapterRouteOptions
) {
  const { prisma } = opts;

  // GET /chapters?subject_id=xxx&sub_subject_id=xxx — always scoped to caller's classes
  app.get("/", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const query = req.query as { subject_id?: string; sub_subject_id?: string };
    const ownClassIds = (
      await prisma.class.findMany({ where: { createdBy: userId }, select: { id: true } })
    ).map((c) => c.id);
    const where: Prisma.ChapterWhereInput = {
      isActive: true,
      subject: { classId: { in: ownClassIds } },
    };
    if (query.sub_subject_id) {
      where.subSubjectId = query.sub_subject_id;
    } else if (query.subject_id) {
      where.subjectId = query.subject_id;
    }

    const chapters = await prisma.chapter.findMany({
      where,
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        subject: { select: { id: true, name: true } },
        subSubject: { select: { id: true, name: true } },
        _count: { select: { questions: { where: { isActive: true } } } },
      },
    });

    // Split counts by type in a single grouped query
    const chapterIds = chapters.map((c) => c.id);
    const grouped = chapterIds.length === 0 ? [] : await prisma.question.groupBy({
      by: ["chapterId", "type"],
      where: { chapterId: { in: chapterIds }, isActive: true },
      _count: { _all: true },
    });

    const countMap: Record<string, { mcq: number; subjective: number }> = {};
    for (const g of grouped) {
      if (!g.chapterId) continue;
      if (!countMap[g.chapterId]) countMap[g.chapterId] = { mcq: 0, subjective: 0 };
      if (g.type === "MCQ") countMap[g.chapterId].mcq = g._count._all;
      else if (g.type === "SUBJECTIVE") countMap[g.chapterId].subjective = g._count._all;
    }

    const enriched = chapters.map((c) => ({
      ...c,
      questionCounts: {
        mcq: countMap[c.id]?.mcq ?? 0,
        subjective: countMap[c.id]?.subjective ?? 0,
        total: c._count.questions,
      },
    }));

    return reply.send({ success: true, data: { chapters: enriched } });
  });

  // GET /chapters/:id
  app.get("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await assertOwnsChapter(prisma, id, userId, reply))) return;
    const chapter = await prisma.chapter.findUnique({
      where: { id },
      include: {
        subject: { select: { id: true, name: true, classId: true } },
        subSubject: { select: { id: true, name: true } },
        _count: { select: { questions: { where: { isActive: true } } } },
      },
    });

    if (!chapter) {
      return reply.code(404).send({
        success: false,
        error: { code: "NOT_FOUND", message: "Chapter not found" },
      });
    }

    return reply.send({ success: true, data: chapter });
  });

  // POST /chapters — order auto-assigned to (max existing sibling + 1) unless provided.
  // Siblings share the same subject AND the same sub-subject (or both null).
  app.post("/", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const body = req.body as {
      subject_id: string;
      sub_subject_id?: string;
      name: string;
      description?: string;
      total_marks?: number;
      time_minutes?: number;
      order?: number;
    };

    if (!body.subject_id || !body.name) {
      return reply.code(400).send({
        success: false,
        error: { code: "MISSING_FIELDS", message: "subject_id and name are required" },
      });
    }
    if (!(await assertOwnsSubject(prisma, body.subject_id, userId, reply))) return;

    let order = body.order;
    if (order === undefined || order === null) {
      const maxRow = await prisma.chapter.aggregate({
        where: {
          subjectId: body.subject_id,
          subSubjectId: body.sub_subject_id ?? null,
          isActive: true,
        },
        _max: { order: true },
      });
      order = (maxRow._max.order ?? 0) + 1;
    }

    const chapter = await prisma.chapter.create({
      data: {
        subjectId: body.subject_id,
        subSubjectId: body.sub_subject_id ?? null,
        name: body.name,
        description: body.description,
        totalMarks: body.total_marks ?? 90,
        timeMinutes: body.time_minutes ?? 90,
        order,
      },
    });

    return reply.code(201).send({ success: true, data: chapter });
  });

  // PUT /chapters/:id
  app.put("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await assertOwnsChapter(prisma, id, userId, reply))) return;
    const body = req.body as Partial<{
      name: string;
      description: string;
      total_marks: number;
      time_minutes: number;
      order: number;
    }>;

    const chapter = await prisma.chapter.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.total_marks !== undefined && { totalMarks: body.total_marks }),
        ...(body.time_minutes !== undefined && { timeMinutes: body.time_minutes }),
        ...(body.order !== undefined && { order: body.order }),
      },
    });

    return reply.send({ success: true, data: chapter });
  });

  // DELETE /chapters/:id (soft delete)
  app.delete("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await assertOwnsChapter(prisma, id, userId, reply))) return;
    await prisma.chapter.update({ where: { id }, data: { isActive: false } });
    return reply.send({ success: true, data: { message: "Chapter deactivated" } });
  });
}
