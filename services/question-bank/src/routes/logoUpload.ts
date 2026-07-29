/**
 * F.6 — Logo image upload.
 *
 * POST /logos              multipart/form-data with a single "file" field.
 * Returns: { success, data: { url } } where `url` is a relative path
 * the teacher can save on their org snapshot (Exam.orgSnapshot.logoUrl or
 * Class.defaultOrgSnapshot.logoUrl).
 *
 * No cropper. No server-side resize. We just validate the magic bytes +
 * size cap (already done by validateImageBuffer) and store via the same
 * LocalStorageService used for question images. CSS in the paper template
 * caps rendered size to 60x60 so oversized uploads still look sane.
 */

import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { StorageService } from "../storage/StorageService";
import { requireUser } from "../lib/authz";

interface LogoUploadOptions extends FastifyPluginOptions {
  storage: StorageService;
}

export async function logoUploadRoutes(
  app: FastifyInstance,
  opts: LogoUploadOptions,
) {
  const { storage } = opts;

  app.post("/", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    // Multipart: one file, ignore extra fields.
    const parts = req.parts();
    let buf: Buffer | null = null;
    let filename = "logo.png";

    for await (const part of parts) {
      if (part.type === "file") {
        buf = await part.toBuffer();
        if (part.filename) filename = part.filename;
        break;                             // only care about the first file
      }
    }

    if (!buf) {
      return reply.code(400).send({
        success: false,
        error: { code: "NO_FILE", message: "A logo image is required" },
      });
    }

    try {
      const url = await storage.save(buf, filename);
      return reply.code(201).send({ success: true, data: { url } });
    } catch (err: any) {
      return reply.code(400).send({
        success: false,
        error: { code: "INVALID_IMAGE", message: err?.message ?? "Could not save logo" },
      });
    }
  });
}
