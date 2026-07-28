import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient, Difficulty, CorrectOption, QuestionType, Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { StorageService } from "../storage/StorageService";

interface ExcelUploadOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
  storage: StorageService;
}

function parseTagsField(raw: string | undefined): string[] {
  if (!raw) return [];
  return String(raw).split(";").map((t) => t.trim()).filter(Boolean);
}

function toStr(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function detectRowType(row: any): "MCQ" | "SUBJECTIVE" {
  const hasAnyOption =
    toStr(row.option_a || row.Option_A || row.A || row["Option A"]) ||
    toStr(row.option_b || row.Option_B || row.B || row["Option B"]) ||
    toStr(row.option_c || row.Option_C || row.C || row["Option C"]) ||
    toStr(row.option_d || row.Option_D || row.D || row["Option D"]);
  const hasCorrect = toStr(row.correct_option || row.correct || row.answer || row.Answer);
  return hasAnyOption || hasCorrect ? "MCQ" : "SUBJECTIVE";
}

type SubjectiveSubType = "FILL_BLANK" | "ONE_WORD" | "SHORT_ANSWER" | "LONG_ANSWER";

/**
 * Parse the sub_type column for subjective rows. Accepts common aliases:
 *   fill_blank, fill-in-the-blanks, fill-in-blank, fill blank, blank, blanks
 *   one_word, one-word, single_word, single word
 *   short_answer, short, sa
 *   long_answer, long, essay, la
 * Falls back to SHORT_ANSWER if unspecified / unrecognised (matches how
 * teachers typically upload legacy "subjective" data with no sub-type).
 */
function detectSubType(row: any): SubjectiveSubType {
  const raw = toStr(
    row.sub_type || row.subType || row.type_sub || row["Sub Type"] ||
    row["Question Type"] || row.question_type || ""
  ).toLowerCase().replace(/[\s_-]/g, "");

  if (!raw) return "SHORT_ANSWER";
  if (raw.startsWith("fill") || raw === "blank" || raw === "blanks") return "FILL_BLANK";
  if (raw.startsWith("one") || raw.startsWith("single") || raw === "oneword") return "ONE_WORD";
  if (raw.startsWith("long") || raw === "essay" || raw === "la") return "LONG_ANSWER";
  if (raw.startsWith("short") || raw === "sa") return "SHORT_ANSWER";
  return "SHORT_ANSWER";
}

function validateRow(row: any, idx: number): string | null {
  if (!toStr(row.text || row.Text || row.question || row.Question)) {
    return `Row ${idx}: text/question field is required`;
  }
  const type = detectRowType(row);
  if (type === "MCQ") {
    const co = toStr(row.correct_option || row.correct || row.answer || row.Answer || "").toUpperCase();
    if (!["A", "B", "C", "D"].includes(co)) {
      return `Row ${idx}: MCQ row must have correct_option A/B/C/D`;
    }
  }
  const diff = toStr(row.difficulty || row.Difficulty || "MEDIUM").toUpperCase();
  if (!["EASY", "MEDIUM", "HARD"].includes(diff)) {
    return `Row ${idx}: difficulty must be EASY, MEDIUM, or HARD`;
  }
  return null;
}

export async function excelUploadRoutes(
  app: FastifyInstance,
  opts: ExcelUploadOptions
) {
  const { prisma } = opts;

  /**
   * POST /questions/excel-upload
   * Multipart: file (xlsx), subject_id, chapter_id (optional), created_by
   *
   * Expected Excel columns (flexible naming):
   *   text / question — question text
   *   option_a / A — option A text
   *   option_b / B — option B text
   *   option_c / C — option C text
   *   option_d / D — option D text
   *   correct_option / answer — A|B|C|D
   *   difficulty — EASY|MEDIUM|HARD (default: MEDIUM)
   *   tags — semicolon-separated
   *   year_tag — e.g. 2018-19
   *   marks_weight — integer (default: 1)
   */
  app.post("/excel-upload", async (req, reply) => {
    const createdBy = req.headers["x-user-id"] as string | undefined;
    const parts = req.parts();

    let subjectId: string | null = null;
    let chapterId: string | null = null;
    let xlsxBuffer: Buffer | null = null;

    for await (const part of parts) {
      if (part.type === "file") {
        xlsxBuffer = await part.toBuffer();
      } else {
        if (part.fieldname === "subject_id") subjectId = part.value as string;
        if (part.fieldname === "chapter_id") chapterId = part.value as string;
      }
    }

    if (!xlsxBuffer) {
      return reply.code(400).send({
        success: false,
        error: { code: "NO_FILE", message: "Excel file (.xlsx) is required" },
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
    const xlsxSubj = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { class: { select: { createdBy: true } } },
    });
    if (!xlsxSubj?.class || xlsxSubj.class.createdBy !== createdBy) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
    }
    if (chapterId) {
      const xlsxChap = await prisma.chapter.findUnique({
        where: { id: chapterId },
        select: { subject: { select: { class: { select: { createdBy: true } } } } },
      });
      if (!xlsxChap?.subject?.class || xlsxChap.subject.class.createdBy !== createdBy) {
        return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
      }
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(xlsxBuffer, { type: "buffer" });
    } catch (e: any) {
      return reply.code(400).send({
        success: false,
        error: { code: "INVALID_FILE", message: "Could not parse Excel file: " + e.message },
      });
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const inserted: Prisma.QuestionCreateManyInput[] = [];
    const errors: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2;

      const validErr = validateRow(row, rowNum);
      if (validErr) {
        errors.push({ row: rowNum, reason: validErr });
        continue;
      }

      const text = toStr(row.text || row.Text || row.question || row.Question);
      const type = detectRowType(row);
      const optA = toStr(row.option_a || row.Option_A || row.A || row["Option A"]);
      const optB = toStr(row.option_b || row.Option_B || row.B || row["Option B"]);
      const optC = toStr(row.option_c || row.Option_C || row.C || row["Option C"]);
      const optD = toStr(row.option_d || row.Option_D || row.D || row["Option D"]);
      const difficulty = (toStr(row.difficulty || row.Difficulty || "MEDIUM").toUpperCase() || "MEDIUM") as Difficulty;
      const tags = parseTagsField(toStr(row.tags || row.Tags));
      const yearTag = toStr(row.year_tag || row.Year_Tag || row.year || "") || null;
      const marksWeight = parseInt(toStr(row.marks_weight || row.marks || "1"), 10) || 1;

      const correctOption =
        type === "MCQ"
          ? (toStr(row.correct_option || row.correct || row.answer || row.Answer).toUpperCase() as CorrectOption)
          : null;

      // Subjective-only: sub-type (fill/one-word/short/long) + expected answer.
      // For MCQ rows we leave both fields null.
      const subType = type === "SUBJECTIVE" ? detectSubType(row) : null;
      const expectedAnswer = type === "SUBJECTIVE"
        ? (toStr(row.expected_answer || row.expectedAnswer || row.answer || row.model_answer || "") || null)
        : null;

      inserted.push({
        subjectId,
        chapterId: chapterId || null,
        createdBy,
        text,
        type: type as QuestionType,
        subType: subType as any,
        expectedAnswer,
        optionA: type === "MCQ" ? (optA || null) : null,
        optionB: type === "MCQ" ? (optB || null) : null,
        optionC: type === "MCQ" ? (optC || null) : null,
        optionD: type === "MCQ" ? (optD || null) : null,
        correctOption,
        difficulty,
        tags,
        yearTag,
        marksWeight,
      });
    }

    let insertedCount = 0;
    if (inserted.length > 0) {
      await prisma.$transaction(async (tx) => {
        const result = await tx.question.createMany({ data: inserted });
        insertedCount = result.count;
      });
    }

    return reply.code(201).send({
      success: true,
      data: { inserted: insertedCount, failed: errors.length, total: rawRows.length, errors },
    });
  });
}
