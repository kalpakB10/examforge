import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient } from "@prisma/client";
import { requireUser, assertOwnsSubject } from "../lib/authz";

interface SubjectRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function subjectRoutes(
  app: FastifyInstance,
  opts: SubjectRouteOptions
) {
  const { prisma } = opts;

  // POST /subjects — creating requires ownership of the target class
  app.post("/", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const body = req.body as { name: string; description?: string; class_id?: string };

    if (!body.name?.trim()) {
      return reply.code(400).send({
        success: false,
        error: { code: "MISSING_FIELDS", message: "name is required" },
      });
    }
    if (!body.class_id) {
      return reply.code(400).send({
        success: false,
        error: { code: "MISSING_FIELDS", message: "class_id is required" },
      });
    }
    const cls = await prisma.class.findUnique({ where: { id: body.class_id }, select: { createdBy: true } });
    if (!cls || cls.createdBy !== userId) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
    }

    const subject = await prisma.subject.create({
      data: {
        name: body.name.trim(),
        description: body.description?.trim(),
        classId: body.class_id,
      },
    });

    return reply.code(201).send({ success: true, data: subject });
  });

  // GET /subjects?class_id=xxx — always scoped to the authenticated teacher's own classes
  app.get("/", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const query = req.query as { class_id?: string };
    const ownClassIds = (
      await prisma.class.findMany({ where: { createdBy: userId }, select: { id: true } })
    ).map((c) => c.id);
    // If a class_id filter was supplied, intersect with the caller's own
    // classes (yields nothing if they don't own it — desired). Otherwise
    // return every subject under any class they own.
    const allowedIds = query.class_id
      ? ownClassIds.filter((id) => id === query.class_id)
      : ownClassIds;
    const where: any = { classId: { in: allowedIds } };

    const subjects = await prisma.subject.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        class: { select: { id: true, name: true } },
        _count: {
          select: {
            chapters: { where: { isActive: true } },
            questions: { where: { isActive: true } },
          },
        },
      },
    });
    return reply.send({ success: true, data: { subjects } });
  });

  // GET /subjects/:id
  app.get("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await assertOwnsSubject(prisma, id, userId, reply))) return;
    const subject = await prisma.subject.findUnique({
      where: { id },
      include: {
        class: { select: { id: true, name: true } },
        subSubjects: {
          where: { isActive: true },
          orderBy: [{ order: "asc" }, { name: "asc" }],
          include: {
            _count: { select: { chapters: { where: { isActive: true } } } },
          },
        },
        chapters: {
          where: { isActive: true },
          orderBy: [{ order: "asc" }, { name: "asc" }],
          include: {
            _count: { select: { questions: { where: { isActive: true } } } },
          },
        },
      },
    });

    if (!subject) {
      return reply.code(404).send({
        success: false,
        error: { code: "NOT_FOUND", message: "Subject not found" },
      });
    }

    return reply.send({ success: true, data: subject });
  });

  // PUT /subjects/:id
  app.put("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await assertOwnsSubject(prisma, id, userId, reply))) return;
    const body = req.body as { name?: string; description?: string };

    const subject = await prisma.subject.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
      },
    });

    return reply.send({ success: true, data: subject });
  });

  // DELETE /subjects/:id
  app.delete("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await assertOwnsSubject(prisma, id, userId, reply))) return;

    // Check for active chapters before hard delete
    const chapterCount = await prisma.chapter.count({
      where: { subjectId: id, isActive: true },
    });
    if (chapterCount > 0) {
      return reply.code(409).send({
        success: false,
        error: {
          code: "HAS_CHAPTERS",
          message: `Cannot delete: subject has ${chapterCount} active chapter(s). Deactivate them first.`,
        },
      });
    }

    await prisma.subject.delete({ where: { id } });
    return reply.send({ success: true, data: { message: "Subject deleted" } });
  });
}
