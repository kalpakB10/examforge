import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient, Difficulty, CorrectOption, QuestionType, Prisma } from "@prisma/client";
import { parse as csvParse } from "csv-parse";
import * as unzipper from "unzipper";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { StorageService, validateImageBuffer, sanitizeFilename } from "../storage/StorageService";
import { v4 as uuidv4 } from "uuid";
import { requireUser, requireOwnership } from "../lib/authz";

interface QuestionRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
  storage: StorageService;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function parseTagsField(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(";").map((t) => t.trim()).filter(Boolean);
}

function validateOption(
  label: string,
  text: string | null | undefined,
  imageUrl: string | null | undefined
): void {
  if (!text && !imageUrl) {
    throw new Error(`Option ${label} must have at least text or an image`);
  }
}

// ─── route plugin ────────────────────────────────────────────────────────────

export async function questionRoutes(
  app: FastifyInstance,
  opts: QuestionRouteOptions
) {
  const { prisma, storage } = opts;

  // ── POST /questions — multipart/form-data ───────────────────────────────
  app.post("/", async (req, reply) => {
    const createdBy = req.headers["x-user-id"] as string | undefined;
    const parts = req.parts();

    const fields: Record<string, string> = {};
    const imageBuffers: Record<string, { buf: Buffer; name: string }> = {};

    for await (const part of parts) {
      if (part.type === "file") {
        const buf = await part.toBuffer();
        imageBuffers[part.fieldname] = { buf, name: part.filename ?? part.fieldname };
      } else {
        fields[part.fieldname] = part.value as string;
      }
    }

    const {
      text,
      subject_id: subjectId,
      chapter_id: chapterId,
      sub_subject_id: subSubjectId,
      correct_option: correctOption,
      difficulty,
      tags,
      marks_weight,
      year_tag: yearTag,
      option_a: optionA,
      option_b: optionB,
      option_c: optionC,
      option_d: optionD,
      // F.1/F.4: optional sub-type + expected-answer for subjective questions
      sub_type: subTypeRaw,
      expected_answer: expectedAnswerRaw,
    } = fields;

    if (!createdBy) {
      return reply.code(401).send({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }
    if (!text || !subjectId || !difficulty) {
      return reply.code(400).send({
        success: false,
        error: { code: "MISSING_FIELDS", message: "text, subject_id, difficulty are required" },
      });
    }
    // Only allow adding questions to subjects/chapters the caller owns
    const subj = await prisma.subject.findUnique({ where: { id: subjectId }, select: { class: { select: { createdBy: true } } } });
    if (!subj?.class || subj.class.createdBy !== createdBy) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
    }
    if (chapterId) {
      const chap = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { subject: { select: { class: { select: { createdBy: true } } } } } });
      if (!chap?.subject?.class || chap.subject.class.createdBy !== createdBy) {
        return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
      }
    }

    // Auto-detect: has any option or correct_option → MCQ; otherwise SUBJECTIVE
    const hasAnyOption = !!(optionA || optionB || optionC || optionD ||
      imageBuffers["option_a_image"] || imageBuffers["option_b_image"] ||
      imageBuffers["option_c_image"] || imageBuffers["option_d_image"]);
    const questionType: QuestionType = hasAnyOption || correctOption ? "MCQ" : "SUBJECTIVE";

    if (questionType === "MCQ" && !correctOption) {
      return reply.code(400).send({
        success: false,
        error: { code: "MISSING_FIELDS", message: "MCQ question requires correct_option (A/B/C/D)" },
      });
    }

    // Save any uploaded images
    const saveImage = async (fieldname: string): Promise<string | null> => {
      const img = imageBuffers[fieldname];
      if (!img) return null;
      try {
        return await storage.save(img.buf, img.name);
      } catch (err: any) {
        throw new Error(`${fieldname}: ${err.message}`);
      }
    };

    let questionImageUrl: string | null = null;
    let optionAImageUrl: string | null = null;
    let optionBImageUrl: string | null = null;
    let optionCImageUrl: string | null = null;
    let optionDImageUrl: string | null = null;

    try {
      [questionImageUrl, optionAImageUrl, optionBImageUrl, optionCImageUrl, optionDImageUrl] =
        await Promise.all([
          saveImage("question_image"),
          saveImage("option_a_image"),
          saveImage("option_b_image"),
          saveImage("option_c_image"),
          saveImage("option_d_image"),
        ]);
    } catch (err: any) {
      return reply.code(400).send({
        success: false,
        error: { code: "IMAGE_ERROR", message: err.message },
      });
    }

    // For MCQ: validate all 4 options have text or image
    if (questionType === "MCQ") {
      try {
        validateOption("A", optionA, optionAImageUrl);
        validateOption("B", optionB, optionBImageUrl);
        validateOption("C", optionC, optionCImageUrl);
        validateOption("D", optionD, optionDImageUrl);
      } catch (err: any) {
        return reply.code(400).send({
          success: false,
          error: { code: "VALIDATION_ERROR", message: err.message },
        });
      }
    }

    // Subjective-only: normalise sub-type + expected answer. Defaults to
    // SHORT_ANSWER when a subjective row omits sub_type (safest sensible default).
    const validSubTypes = new Set(["FILL_BLANK", "ONE_WORD", "SHORT_ANSWER", "LONG_ANSWER"]);
    const normalisedSubType = questionType === "SUBJECTIVE"
      ? (validSubTypes.has((subTypeRaw || "").toUpperCase()) ? (subTypeRaw as string).toUpperCase() : "SHORT_ANSWER")
      : null;

    const question = await prisma.question.create({
      data: {
        subjectId,
        subSubjectId: subSubjectId || null,
        chapterId: chapterId || null,
        text,
        type: questionType,
        subType: normalisedSubType as any,
        expectedAnswer: questionType === "SUBJECTIVE" ? (expectedAnswerRaw || null) : null,
        questionImageUrl,
        optionA: questionType === "MCQ" ? (optionA || null) : null,
        optionAImageUrl: questionType === "MCQ" ? optionAImageUrl : null,
        optionB: questionType === "MCQ" ? (optionB || null) : null,
        optionBImageUrl: questionType === "MCQ" ? optionBImageUrl : null,
        optionC: questionType === "MCQ" ? (optionC || null) : null,
        optionCImageUrl: questionType === "MCQ" ? optionCImageUrl : null,
        optionD: questionType === "MCQ" ? (optionD || null) : null,
        optionDImageUrl: questionType === "MCQ" ? optionDImageUrl : null,
        correctOption: questionType === "MCQ" ? (correctOption as CorrectOption) : null,
        difficulty: difficulty as Difficulty,
        tags: parseTagsField(tags),
        yearTag: yearTag || null,
        marksWeight: marks_weight ? parseInt(marks_weight, 10) : 1,
        createdBy,
      },
    });

    return reply.code(201).send({ success: true, data: question });
  });

  // ── POST /questions/bulk — ZIP upload ───────────────────────────────────
  app.post("/bulk", async (req, reply) => {
    const createdBy = req.headers["x-user-id"] as string | undefined;
    const parts = req.parts();

    let subjectId: string | null = null;
    let zipBuffer: Buffer | null = null;

    for await (const part of parts) {
      if (part.type === "file") {
        zipBuffer = await part.toBuffer();
      } else {
        if (part.fieldname === "subject_id") subjectId = part.value as string;
      }
    }

    if (!zipBuffer) {
      return reply.code(400).send({
        success: false,
        error: { code: "NO_FILE", message: "ZIP file is required" },
      });
    }
    if (!createdBy) {
      return reply.code(401).send({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }
    if (!subjectId) {
      return reply.code(400).send({
        success: false,
        error: { code: "MISSING_FIELDS", message: "subject_id is required" },
      });
    }
    // Only allow bulk-adding to a subject the caller owns
    const bulkSubj = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { class: { select: { createdBy: true } } },
    });
    if (!bulkSubj?.class || bulkSubj.class.createdBy !== createdBy) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcq-bulk-"));

    try {
      // Extract ZIP to temp dir
      const directory = await unzipper.Open.buffer(zipBuffer);
      await directory.extract({ path: tmpDir });

      const csvPath = path.join(tmpDir, "questions.csv");
      if (!fs.existsSync(csvPath)) {
        return reply.code(400).send({
          success: false,
          error: { code: "MISSING_CSV", message: "ZIP must contain questions.csv at the root" },
        });
      }

      const imagesDir = path.join(tmpDir, "images");
      const csvContent = fs.readFileSync(csvPath, "utf-8");

      // Parse CSV
      type CsvRow = {
        text: string;
        question_image: string;
        option_a: string;
        option_a_image: string;
        option_b: string;
        option_b_image: string;
        option_c: string;
        option_c_image: string;
        option_d: string;
        option_d_image: string;
        correct_option: string;
        difficulty: string;
        tags: string;
        year_tag: string;
        chapter_id: string;
      };

      // Strip BOM and leading blank lines before parsing
      const cleanedCsv = csvContent.replace(/^﻿/, "").replace(/^\r?\n+/, "");

      const rows = await new Promise<CsvRow[]>((resolve, reject) => {
        csvParse(
          cleanedCsv,
          {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_quotes: true,
            relax_column_count: true,
          },
          (err, records) => (err ? reject(err) : resolve(records as CsvRow[]))
        );
      });

      // Process rows — save images, build DB records
      const inserted: Prisma.QuestionCreateManyInput[] = [];
      const errors: Array<{ row: number; reason: string }> = [];

      const saveFromZip = async (
        filename: string | undefined,
        rowIndex: number
      ): Promise<string | null> => {
        if (!filename) return null;
        const imgPath = path.join(imagesDir, filename);
        if (!fs.existsSync(imgPath)) {
          errors.push({ row: rowIndex, reason: `image not found: ${filename}` });
          return null;
        }
        const buf = fs.readFileSync(imgPath);
        return storage.save(buf, sanitizeFilename(filename));
      };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // 1-indexed, +1 for header

        try {
          if (!row.text) throw new Error("text field is required");

          const [questionImageUrl, optAImg, optBImg, optCImg, optDImg] = await Promise.all([
            saveFromZip(row.question_image || undefined, rowNum),
            saveFromZip(row.option_a_image || undefined, rowNum),
            saveFromZip(row.option_b_image || undefined, rowNum),
            saveFromZip(row.option_c_image || undefined, rowNum),
            saveFromZip(row.option_d_image || undefined, rowNum),
          ]);

          // Validate options
          validateOption("A", row.option_a, optAImg);
          validateOption("B", row.option_b, optBImg);
          validateOption("C", row.option_c, optCImg);
          validateOption("D", row.option_d, optDImg);

          inserted.push({
            subjectId: subjectId!,
            chapterId: row.chapter_id || null,
            createdBy: createdBy!,
            text: row.text,
            questionImageUrl,
            optionA: row.option_a || null,
            optionAImageUrl: optAImg,
            optionB: row.option_b || null,
            optionBImageUrl: optBImg,
            optionC: row.option_c || null,
            optionCImageUrl: optCImg,
            optionD: row.option_d || null,
            optionDImageUrl: optDImg,
            correctOption: row.correct_option as CorrectOption,
            difficulty: row.difficulty as Difficulty,
            tags: parseTagsField(row.tags),
            yearTag: row.year_tag || null,
            marksWeight: 1,
          });
        } catch (err: any) {
          errors.push({ row: rowNum, reason: err.message });
        }
      }

      // Insert all valid rows in a single transaction
      let insertedCount = 0;
      if (inserted.length > 0) {
        await prisma.$transaction(async (tx) => {
          const result = await tx.question.createMany({ data: inserted });
          insertedCount = result.count;
        });
      }

      return reply.code(201).send({
        success: true,
        data: { inserted: insertedCount, failed: errors.length, errors },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ── GET /questions — always scoped to caller's own questions ─────────────
  app.get("/", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const query = req.query as {
      subject_id?: string;
      chapter_id?: string;
      class_id?: string;
      difficulty?: Difficulty;
      tags?: string;
      search?: string;
      page?: string;
      limit?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const limit = Math.min(200, parseInt(query.limit ?? "50", 10));
    const skip = (page - 1) * limit;

    const where: Prisma.QuestionWhereInput = { isActive: true, createdBy: userId };
    if (query.chapter_id) {
      where.chapterId = query.chapter_id;
    } else if (query.subject_id) {
      where.subjectId = query.subject_id;
    } else if (query.class_id) {
      where.subject = { classId: query.class_id };
    }
    if (query.difficulty) where.difficulty = query.difficulty;
    if (query.tags) {
      where.tags = { hasSome: query.tags.split(",").map((t) => t.trim()) };
    }
    if (query.search) {
      where.text = { contains: query.search, mode: "insensitive" };
    }

    const [questions, total] = await Promise.all([
      prisma.question.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          subject: { select: { id: true, name: true } },
          chapter: { select: { id: true, name: true } },
        },
      }),
      prisma.question.count({ where }),
    ]);

    return reply.send({ success: true, data: { questions, total, page, limit } });
  });

  // ── GET /questions/:id ───────────────────────────────────────────────────
  app.get("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const question = await prisma.question.findUnique({ where: { id } });
    if (!requireOwnership(question, userId, reply)) return;

    return reply.send({ success: true, data: question });
  });

  // ── PUT /questions/:id ───────────────────────────────────────────────────
  app.put("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const existingQ = await prisma.question.findUnique({ where: { id }, select: { createdBy: true } });
    if (!requireOwnership(existingQ, userId, reply)) return;

    // Support both JSON body updates (text/options) and multipart for image swaps
    const contentType = req.headers["content-type"] ?? "";

    if (contentType.includes("multipart")) {
      const parts = req.parts();
      const fields: Record<string, string> = {};
      const imageBuffers: Record<string, { buf: Buffer; name: string }> = {};

      for await (const part of parts) {
        if (part.type === "file") {
          const buf = await part.toBuffer();
          imageBuffers[part.fieldname] = { buf, name: part.filename ?? part.fieldname };
        } else {
          fields[part.fieldname] = part.value as string;
        }
      }

      const updateData: Prisma.QuestionUpdateInput = {};
      if (fields.text) updateData.text = fields.text;
      if (fields.option_a !== undefined) updateData.optionA = fields.option_a || null;
      if (fields.option_b !== undefined) updateData.optionB = fields.option_b || null;
      if (fields.option_c !== undefined) updateData.optionC = fields.option_c || null;
      if (fields.option_d !== undefined) updateData.optionD = fields.option_d || null;
      if (fields.correct_option) updateData.correctOption = fields.correct_option as CorrectOption;
      if (fields.difficulty) updateData.difficulty = fields.difficulty as Difficulty;
      if (fields.tags) updateData.tags = parseTagsField(fields.tags);
      if (fields.marks_weight) updateData.marksWeight = parseInt(fields.marks_weight, 10);

      const saveImg = async (fieldname: string): Promise<string | undefined> => {
        const img = imageBuffers[fieldname];
        if (!img) return undefined;
        return storage.save(img.buf, img.name);
      };

      const [qImg, aImg, bImg, cImg, dImg] = await Promise.all([
        saveImg("question_image"),
        saveImg("option_a_image"),
        saveImg("option_b_image"),
        saveImg("option_c_image"),
        saveImg("option_d_image"),
      ]);

      if (qImg !== undefined) updateData.questionImageUrl = qImg;
      if (aImg !== undefined) updateData.optionAImageUrl = aImg;
      if (bImg !== undefined) updateData.optionBImageUrl = bImg;
      if (cImg !== undefined) updateData.optionCImageUrl = cImg;
      if (dImg !== undefined) updateData.optionDImageUrl = dImg;

      const question = await prisma.question.update({ where: { id }, data: updateData });
      return reply.send({ success: true, data: question });
    }

    // Plain JSON update (text fields only)
    const body = req.body as Prisma.QuestionUpdateInput;
    const question = await prisma.question.update({ where: { id }, data: body });
    return reply.send({ success: true, data: question });
  });

  // ── DELETE /questions/:id — soft delete ──────────────────────────────────
  app.delete("/:id", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    const q = await prisma.question.findUnique({ where: { id }, select: { createdBy: true } });
    if (!requireOwnership(q, userId, reply)) return;
    await prisma.question.update({ where: { id }, data: { isActive: false } });
    return reply.send({ success: true, data: { message: "Question deactivated" } });
  });
}
