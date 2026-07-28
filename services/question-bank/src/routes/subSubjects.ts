import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient } from "@prisma/client";
import { requireUser, assertOwnsSubject, assertOwnsSubSubject } from "../lib/authz";

interface SubSubjectRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function subSubjectRoutes(app: FastifyInstance, opts: SubSubjectRouteOptions) {
  const { prisma } = opts;

  // GET /sub-subjects?subject_id=xxx — always scoped to caller's classes
  app.get("/", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const query = req.query as { subject_id?: string };
    const ownClassIds = (
      await prisma.class.findMany({ where: { createdBy: userId }, select: { id: true } })
    ).map((c) => c.id);
    const where: any = {
      isActive: true,
      subject: { classId: { in: ownClassIds } },
      ...(query.subject_id ? { subjectId: query.subject_id } : {}),
    };

    const subSubjects = await prisma.subSubject.findMany({
      where,
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: { chapters: { where: { isActive: true } } },
        },
      },
    });
    return reply.send({ success: true, data: { subSubjects } });
  });

  // GET /sub-subjects/:id
  app.get("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await assertOwnsSubSubject(prisma, id, userId, reply))) return;
    const subSubject = await prisma.subSubject.findUnique({
      where: { id },
      include: {
        subject: { select: { id: true, name: true, classId: true, class: { select: { id: true, name: true } } } },
        chapters: {
          where: { isActive: true },
          orderBy: [{ order: "asc" }, { name: "asc" }],
          include: {
            _count: { select: { questions: { where: { isActive: true } } } },
          },
        },
      },
    });
    if (!subSubject) {
      return reply.code(404).send({
        success: false,
        error: { code: "NOT_FOUND", message: "Sub-subject not found" },
      });
    }
    return reply.send({ success: true, data: subSubject });
  });

  // POST /sub-subjects — order auto-assigned to (max existing + 1) unless explicitly provided
  app.post("/", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const body = req.body as {
      subject_id: string;
      name: string;
      description?: string;
      order?: number;
    };
    if (!body.subject_id?.trim() || !body.name?.trim()) {
      return reply.code(400).send({
        success: false,
        error: { code: "MISSING_FIELDS", message: "subject_id and name are required" },
      });
    }
    if (!(await assertOwnsSubject(prisma, body.subject_id, userId, reply))) return;
    let order = body.order;
    if (order === undefined || order === null) {
      const maxRow = await prisma.subSubject.aggregate({
        where: { subjectId: body.subject_id, isActive: true },
        _max: { order: true },
      });
      order = (maxRow._max.order ?? 0) + 1;
    }
    const subSubject = await prisma.subSubject.create({
      data: {
        subjectId: body.subject_id,
        name: body.name.trim(),
        description: body.description?.trim(),
        order,
      },
    });
    return reply.code(201).send({ success: true, data: subSubject });
  });

  // PUT /sub-subjects/:id
  app.put("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await assertOwnsSubSubject(prisma, id, userId, reply))) return;
    const body = req.body as { name?: string; description?: string; order?: number };
    const subSubject = await prisma.subSubject.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.description !== undefined && { description: body.description.trim() }),
        ...(body.order !== undefined && { order: body.order }),
      },
    });
    return reply.send({ success: true, data: subSubject });
  });

  // DELETE /sub-subjects/:id — soft delete
  app.delete("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await assertOwnsSubSubject(prisma, id, userId, reply))) return;
    const chapterCount = await prisma.chapter.count({
      where: { subSubjectId: id, isActive: true },
    });
    if (chapterCount > 0) {
      return reply.code(409).send({
        success: false,
        error: {
          code: "HAS_CHAPTERS",
          message: `Cannot delete: sub-subject has ${chapterCount} active chapter(s). Deactivate them first.`,
        },
      });
    }
    await prisma.subSubject.update({ where: { id }, data: { isActive: false } });
    return reply.send({ success: true, data: { message: "Sub-subject deactivated" } });
  });
}
