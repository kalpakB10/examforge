import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient, Prisma } from "@prisma/client";
import { requireUser, requireOwnership } from "../lib/authz";

interface ClassRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function classRoutes(
  app: FastifyInstance,
  opts: ClassRouteOptions
) {
  const { prisma } = opts;

  // GET /classes — scoped to the logged-in teacher
  app.get("/", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const classes = await prisma.class.findMany({
      where: { createdBy: userId },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { subjects: true } },
      },
    });
    return reply.send({ success: true, data: { classes } });
  });

  // GET /classes/:id
  app.get("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const cls = await prisma.class.findUnique({
      where: { id },
      include: {
        subjects: {
          orderBy: { name: "asc" },
          include: {
            _count: {
              select: {
                chapters: { where: { isActive: true } },
                questions: { where: { isActive: true } },
              },
            },
          },
        },
      },
    });
    if (!requireOwnership(cls, userId, reply)) return;
    return reply.send({ success: true, data: cls });
  });

  // POST /classes — createdBy comes from the authenticated user, not the client
  app.post("/", async (req, reply) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    const body = req.body as { name: string; description?: string };
    if (!body.name?.trim()) {
      return reply.code(400).send({
        success: false,
        error: { code: "MISSING_FIELDS", message: "name is required" },
      });
    }
    if (!userId) {
      return reply.code(401).send({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }
    const cls = await prisma.class.create({
      data: {
        name: body.name.trim(),
        description: body.description?.trim(),
        createdBy: userId,
      },
    });
    return reply.code(201).send({ success: true, data: cls });
  });

  // PUT /classes/:id
  app.put("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const existing = await prisma.class.findUnique({ where: { id } });
    if (!requireOwnership(existing, userId, reply)) return;
    const body = req.body as { name?: string; description?: string };
    const cls = await prisma.class.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.description !== undefined && { description: body.description.trim() }),
      },
    });
    return reply.send({ success: true, data: cls });
  });

  // PATCH /classes/:id/defaults — set the paper template + org defaults for this class
  // These auto-populate when creating an exam under this class.
  app.patch("/:id/defaults", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const body = req.body as {
      defaultTemplateId?: string | null;
      defaultOrgSnapshot?: {
        orgName?: string;
        address?: string;
        logoText?: string;
        examTitle?: string;
        footerText?: string;
      } | null;
    };
    const existing = await prisma.class.findUnique({ where: { id } });
    if (!requireOwnership(existing, userId, reply)) return;
    const cls = await prisma.class.update({
      where: { id },
      data: {
        ...(body.defaultTemplateId !== undefined && { defaultTemplateId: body.defaultTemplateId }),
        ...(body.defaultOrgSnapshot !== undefined && {
          defaultOrgSnapshot: body.defaultOrgSnapshot as unknown as Prisma.InputJsonValue,
        }),
      },
    });
    return reply.send({ success: true, data: cls });
  });

  // DELETE /classes/:id
  app.delete("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const existing = await prisma.class.findUnique({ where: { id } });
    if (!requireOwnership(existing, userId, reply)) return;
    const subjectCount = await prisma.subject.count({ where: { classId: id } });
    if (subjectCount > 0) {
      return reply.code(409).send({
        success: false,
        error: {
          code: "HAS_SUBJECTS",
          message: `Cannot delete: class has ${subjectCount} subject(s). Remove them first.`,
        },
      });
    }
    await prisma.class.delete({ where: { id } });
    return reply.send({ success: true, data: { message: "Class deleted" } });
  });
}
