import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient, Prisma } from "@prisma/client";
import { PRESETS } from "../paperTemplate/presets";

interface Options extends FastifyPluginOptions {
  prisma: PrismaClient;
}

// Seed presets once — idempotent (matched by name + isPreset=true)
export async function seedPresets(prisma: PrismaClient) {
  for (const p of PRESETS) {
    const existing = await prisma.paperTemplate.findFirst({
      where: { isPreset: true, name: p.name },
    });
    if (!existing) {
      await prisma.paperTemplate.create({
        data: {
          name: p.name,
          description: p.description,
          isPreset: true,
          ownerId: null,
          layout: p.layout as unknown as Prisma.InputJsonValue,
        },
      });
    } else if (JSON.stringify(existing.layout) !== JSON.stringify(p.layout) || existing.description !== p.description) {
      // Keep presets in sync with code changes
      await prisma.paperTemplate.update({
        where: { id: existing.id },
        data: {
          description: p.description,
          layout: p.layout as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }
}

export async function paperTemplateRoutes(app: FastifyInstance, opts: Options) {
  const { prisma } = opts;

  // GET /paper-templates — list presets + templates owned by the authenticated user
  app.get("/", async (req, reply) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    const where: Prisma.PaperTemplateWhereInput = {
      OR: [
        { isPreset: true },
        ...(userId ? [{ ownerId: userId }] : []),
      ],
    };
    const templates = await prisma.paperTemplate.findMany({
      where,
      orderBy: [{ isPreset: "desc" }, { name: "asc" }],
    });
    return reply.send({ success: true, data: { templates } });
  });

  // GET /paper-templates/:id
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const template = await prisma.paperTemplate.findUnique({ where: { id } });
    if (!template) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Template not found" } });
    }
    return reply.send({ success: true, data: template });
  });

  // POST /paper-templates — save a personal template (usually a "Save As" from a preset)
  app.post("/", async (req, reply) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) {
      return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
    const body = req.body as { name: string; description?: string; layout: unknown };
    if (!body.name?.trim() || !body.layout) {
      return reply.code(400).send({ success: false, error: { code: "MISSING_FIELDS", message: "name and layout are required" } });
    }
    const t = await prisma.paperTemplate.create({
      data: {
        name: body.name.trim(),
        description: body.description?.trim(),
        isPreset: false,
        ownerId: userId,
        layout: body.layout as Prisma.InputJsonValue,
      },
    });
    return reply.code(201).send({ success: true, data: t });
  });

  // PUT /paper-templates/:id — only owner can edit (presets are read-only)
  app.put("/:id", async (req, reply) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    const { id } = req.params as { id: string };
    const existing = await prisma.paperTemplate.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Template not found" } });
    }
    if (existing.isPreset) {
      return reply.code(403).send({ success: false, error: { code: "IS_PRESET", message: "Presets cannot be edited. Save a personal copy first." } });
    }
    if (existing.ownerId !== userId) {
      return reply.code(403).send({ success: false, error: { code: "NOT_OWNER", message: "You can only edit templates you own." } });
    }
    const body = req.body as { name?: string; description?: string; layout?: unknown };
    const t = await prisma.paperTemplate.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.description !== undefined && { description: body.description?.trim() }),
        ...(body.layout !== undefined && { layout: body.layout as Prisma.InputJsonValue }),
      },
    });
    return reply.send({ success: true, data: t });
  });

  // DELETE /paper-templates/:id — owner only, presets protected
  app.delete("/:id", async (req, reply) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    const { id } = req.params as { id: string };
    const existing = await prisma.paperTemplate.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Template not found" } });
    }
    if (existing.isPreset) {
      return reply.code(403).send({ success: false, error: { code: "IS_PRESET", message: "Presets cannot be deleted." } });
    }
    if (existing.ownerId !== userId) {
      return reply.code(403).send({ success: false, error: { code: "NOT_OWNER", message: "You can only delete templates you own." } });
    }
    await prisma.paperTemplate.delete({ where: { id } });
    return reply.send({ success: true, data: { message: "Template deleted" } });
  });
}
