import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient, CorrectOption } from "@prisma/client";
import { requireUser, assertOwnsChapter } from "../lib/authz";

interface PdfRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

const OPTION_SYMBOLS: Record<string, string> = { A: "①", B: "②", C: "③", D: "④" };
const OPTION_LABELS = ["A", "B", "C", "D"] as const;

function optionText(q: any, opt: string): string {
  const textField = `option${opt}` as keyof typeof q;
  return (q[textField] as string | null) ?? "";
}

function buildQuestionPaperHtml(chapter: any, questions: any[]): string {
  const subject = chapter.subject?.name ?? "Subject";
  const chapterName = chapter.name;
  const totalMarks = chapter.totalMarks;
  const timeMinutes = chapter.timeMinutes;

  const questionsHtml = questions
    .map((q, idx) => {
      const yearTag = q.yearTag ? `<span class="year-tag">[${q.yearTag}]</span>` : "";
      const opts = OPTION_LABELS.map(
        (o) => `<div class="option">${OPTION_SYMBOLS[o]} ${optionText(q, o)}</div>`
      ).join("");
      return `
        <div class="question">
          <div class="q-text">${idx + 1}. ${q.text} ${yearTag}</div>
          <div class="options">${opts}</div>
        </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #000; padding: 20px; }
  .header { border: 2px solid #000; padding: 12px; margin-bottom: 16px; }
  .header-top { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
  .pub-name { font-size: 10px; color: #555; }
  .title { font-size: 18px; font-weight: bold; text-align: center; }
  .chapter-title { font-size: 14px; font-weight: bold; text-align: center; margin-top: 2px; }
  .meta-row { display: flex; justify-content: space-between; margin-top: 8px; font-size: 12px; }
  .meta-item { display: flex; gap: 4px; }
  .meta-label { font-weight: bold; }
  .sign-box { border: 1px solid #000; padding: 4px 20px; font-size: 11px; }
  .instructions { font-size: 11px; margin-bottom: 12px; color: #333; border-left: 3px solid #888; padding-left: 8px; }
  .question { margin-bottom: 14px; page-break-inside: avoid; }
  .q-text { font-weight: 500; margin-bottom: 4px; line-height: 1.4; }
  .year-tag { font-size: 10px; color: #555; font-style: italic; }
  .options { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; padding-left: 16px; font-size: 12px; }
  .option { line-height: 1.6; }
  @media print { body { padding: 10px; } }
</style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      <div class="pub-name">Joyful Genius Publication</div>
      <div>
        <div class="title">${subject}</div>
        <div class="chapter-title">${chapterName}</div>
      </div>
      <div class="sign-box">Teacher Sign:<br><br></div>
    </div>
    <div class="meta-row">
      <div class="meta-item"><span class="meta-label">Date:</span> ___________</div>
      <div class="meta-item"><span class="meta-label">Time:</span> ${timeMinutes} Min.</div>
      <div class="meta-item"><span class="meta-label">Total Marks:</span> ${totalMarks}</div>
      <div class="meta-item"><span class="meta-label">Total Questions:</span> ${questions.length}</div>
    </div>
  </div>
  <div class="instructions">
    ✏ Circle the correct answer. Each question carries 1 mark. No negative marking.
  </div>
  ${questionsHtml}
</body>
</html>`;
}

function buildAnswerKeyHtml(chapter: any, questions: any[]): string {
  const subject = chapter.subject?.name ?? "Subject";
  const chapterName = chapter.name;

  const rows = questions
    .map((q, idx) => {
      const ans = q.correctOption as string;
      return `<td class="cell">${OPTION_SYMBOLS[ans]}</td>`;
    })
    .join("");

  const nums = questions.map((_, idx) => `<td class="cell">${idx + 1}</td>`).join("");

  // Group into rows of 10
  const groupSize = 10;
  const tableRows: string[] = [];
  for (let i = 0; i < questions.length; i += groupSize) {
    const slice = questions.slice(i, i + groupSize);
    const numCells = slice.map((_, j) => `<td class="cell">${i + j + 1}</td>`).join("");
    const ansCells = slice
      .map((q) => `<td class="cell ans">${OPTION_SYMBOLS[q.correctOption as string]}</td>`)
      .join("");
    tableRows.push(`<tr><td class="label">Q.No</td>${numCells}</tr><tr><td class="label">Ans</td>${ansCells}</tr><tr><td colspan="${slice.length + 1}" class="spacer"></td></tr>`);
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #000; padding: 20px; }
  .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 8px; }
  .title { font-size: 16px; font-weight: bold; }
  .subtitle { font-size: 12px; color: #555; margin-top: 2px; }
  .key-label { font-size: 14px; font-weight: bold; margin-bottom: 10px; background: #000; color: #fff; padding: 4px 10px; display: inline-block; }
  table { border-collapse: collapse; width: 100%; }
  td { border: 1px solid #000; text-align: center; padding: 5px 8px; }
  .label { font-weight: bold; background: #f0f0f0; text-align: left; padding-left: 6px; }
  .ans { font-weight: bold; font-size: 14px; }
  .spacer { border: none; height: 6px; }
</style>
</head>
<body>
  <div class="header">
    <div class="title">${subject} — ${chapterName}</div>
    <div class="subtitle">Answer Key</div>
  </div>
  <div class="key-label">Answer Key</div>
  <table>
    ${tableRows.join("")}
  </table>
</body>
</html>`;
}

export async function pdfRoutes(
  app: FastifyInstance,
  opts: PdfRouteOptions
) {
  const { prisma } = opts;

  // GET /chapters/:id/question-paper-pdf
  app.get("/:id/question-paper-pdf", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await assertOwnsChapter(prisma, id, userId, reply))) return;

    const chapter = await prisma.chapter.findUnique({
      where: { id },
      include: { subject: { select: { id: true, name: true } } },
    });

    if (!chapter || !chapter.isActive) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Chapter not found" } });
    }

    const questions = await prisma.question.findMany({
      where: { chapterId: id, isActive: true },
      orderBy: { createdAt: "asc" },
    });

    if (questions.length === 0) {
      return reply.code(400).send({ success: false, error: { code: "NO_QUESTIONS", message: "No questions in this chapter" } });
    }

    const html = buildQuestionPaperHtml(chapter, questions);

    // Try puppeteer if available, otherwise return HTML
    try {
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        headless: true,
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({ format: "A4", margin: { top: "10mm", bottom: "10mm", left: "15mm", right: "15mm" } });
      await browser.close();

      const safeChapter = chapter.name.replace(/[^a-zA-Z0-9]/g, "_");
      reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${safeChapter}_QuestionPaper.pdf"`)
        .send(Buffer.from(pdf));
    } catch (_) {
      // Puppeteer not available — return HTML directly
      reply
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Content-Disposition", `inline; filename="question-paper.html"`)
        .send(html);
    }
  });

  // GET /chapters/:id/answer-key-pdf
  app.get("/:id/answer-key-pdf", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await assertOwnsChapter(prisma, id, userId, reply))) return;

    const chapter = await prisma.chapter.findUnique({
      where: { id },
      include: { subject: { select: { id: true, name: true } } },
    });

    if (!chapter || !chapter.isActive) {
      return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Chapter not found" } });
    }

    const questions = await prisma.question.findMany({
      where: { chapterId: id, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, correctOption: true },
    });

    if (questions.length === 0) {
      return reply.code(400).send({ success: false, error: { code: "NO_QUESTIONS", message: "No questions in this chapter" } });
    }

    const html = buildAnswerKeyHtml(chapter, questions);

    try {
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        headless: true,
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({ format: "A4", margin: { top: "10mm", bottom: "10mm", left: "15mm", right: "15mm" } });
      await browser.close();

      const safeChapter = chapter.name.replace(/[^a-zA-Z0-9]/g, "_");
      reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${safeChapter}_AnswerKey.pdf"`)
        .send(Buffer.from(pdf));
    } catch (_) {
      reply
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Content-Disposition", `inline; filename="answer-key.html"`)
        .send(html);
    }
  });
}
