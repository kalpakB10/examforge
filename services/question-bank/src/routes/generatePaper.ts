import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { PrismaClient, Prisma } from "@prisma/client";
import { Layout } from "../paperTemplate/types";
import {
  RenderContext,
  renderSection,
  renderMetaRow,
  templateBaseCss,
  pickAccent,
} from "../paperTemplate/renderer";
import { sampleComposition, SectionSpec, shuffleWithRng, makeRng } from "../selector/sampler";

interface GeneratePaperOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

const OPTION_SYMBOLS: Record<string, string> = { A: "①", B: "②", C: "③", D: "④" };
const OPTION_LABELS = ["A", "B", "C", "D"] as const;

function optText(q: any, o: string): string {
  return (q[`option${o}`] as string | null) ?? "";
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgHeader {
  orgName: string;
  address?: string;
  logoText?: string;
  examTitle?: string;
}

type SectionType = "MCQ" | "SUBJECTIVE";

interface Section {
  title?: string;
  type: SectionType;
  marksPerQuestion: number;
  numQuestions: number;
  blankLines?: number;
  scope: { subjectIds?: string[]; chapterIds?: string[] };
  shuffle?: boolean;
  distributeAcrossChapters?: boolean;
  difficulty?: { easy?: number; medium?: number; hard?: number };
}

interface PaperConfig {
  org: OrgHeader;
  paperTitle?: string;
  date?: string;
  totalTime?: number;
  instructions?: string[];
  sections: Section[];
  shufflePapers?: number;
  type?: "question-paper" | "answer-key";
  variant?: string;
  templateId?: string;
  seed?: number;
  footerText?: string;              // teacher-editable footer text (single line)
}

// ─── Default fallback layout (used if no templateId given) ────────────────────

const FALLBACK_LAYOUT: Layout = {
  accentColor: "#1a237e",
  answerKeyAccentColor: "#0d9488",
  header: {
    rows: [
      { slots: [{ align: "center", fields: [{ type: "orgName", size: "lg", bold: true }] }] },
      { slots: [{ align: "center", fields: [{ type: "paperTitle", size: "md", bold: true, uppercase: true }] }], divider: true },
    ],
  },
  footer: {
    rows: [{
      slots: [
        { align: "left", fields: [{ type: "customFooter", size: "sm" }] },
        { align: "right", fields: [{ type: "orgName", size: "sm" }] },
      ],
    }],
  },
  metaRow: { show: true, fields: ["date", "time", "totalMarks", "totalQuestions"] },
};

// ─── Body builders ────────────────────────────────────────────────────────────

function buildInstructions(extra: string[], hasMCQ: boolean, hasSubjective: boolean): string {
  const defaults = ["All questions are compulsory."];
  if (hasMCQ) defaults.push("For MCQ: circle / tick the correct option. There is <strong>no negative marking</strong>.");
  if (hasSubjective) defaults.push("For subjective questions: write your answer in the space provided.");
  defaults.push("Use blue or black ball-point pen only.");
  const all = [...defaults, ...extra];
  const items = all.map((t, i) => `<li>${i + 1}. ${t}</li>`).join("");
  return `<div class="instructions"><strong>Instructions:</strong><ul>${items}</ul></div>`;
}

function buildMcqQuestion(q: any, n: number): string {
  const yearTag = q.yearTag ? ` <span class="year-tag">[${q.yearTag}]</span>` : "";
  const opts = OPTION_LABELS.map(
    (o) => `<div class="opt"><span class="opt-sym">${OPTION_SYMBOLS[o]}</span> ${optText(q, o)}</div>`
  ).join("");
  return `<div class="question">
    <div class="q-text"><span class="q-num">${n}.</span> ${q.text}${yearTag}</div>
    <div class="opts-grid">${opts}</div>
  </div>`;
}

function buildSubjectiveQuestion(q: any, n: number, marks: number, blankLines: number): string {
  const yearTag = q.yearTag ? ` <span class="year-tag">[${q.yearTag}]</span>` : "";
  const lines = Array.from({ length: blankLines }, () => `<div class="subj-line"></div>`).join("");
  return `<div class="question subj-question">
    <div class="q-text">
      <span class="q-num">${n}.</span> ${q.text}${yearTag}
      <span class="q-marks">[${marks} mark${marks !== 1 ? "s" : ""}]</span>
    </div>
    <div class="subj-answer-space">${lines}</div>
  </div>`;
}

function buildSectionBanner(idx: number, sec: Section, count: number): string {
  const label = sec.title || `Section ${String.fromCharCode(65 + idx)}`;
  const typeLabel = sec.type === "MCQ" ? "MCQ" : "Short Answer";
  return `<div class="paper-section-header">
    <span class="ps-label">${label}</span>
    <span class="ps-type">${typeLabel}</span>
    <span class="ps-meta">${count} question${count !== 1 ? "s" : ""} × ${sec.marksPerQuestion} mark${sec.marksPerQuestion !== 1 ? "s" : ""} = ${count * sec.marksPerQuestion} mark${count * sec.marksPerQuestion !== 1 ? "s" : ""}</span>
  </div>`;
}

interface RenderedSection { sec: Section; questions: any[] }

// ─── Page assembly ────────────────────────────────────────────────────────────

function assemblePaper(
  layout: Layout,
  ctx: RenderContext,
  rendered: RenderedSection[],
  extraInstructions: string[],
): string {
  const accent = pickAccent(layout, false);
  const hasMCQ = rendered.some((s) => s.sec.type === "MCQ");
  const hasSubj = rendered.some((s) => s.sec.type === "SUBJECTIVE");

  const header = renderSection(layout.header, ctx, "header", accent);
  const meta = renderMetaRow(layout, ctx);
  const instructions = buildInstructions(extraInstructions, hasMCQ, hasSubj);
  const footer = renderSection(layout.footer, ctx, "footer", accent);

  let body = "";
  let n = 0;
  for (let i = 0; i < rendered.length; i++) {
    const { sec, questions } = rendered[i];
    body += buildSectionBanner(i, sec, questions.length);
    for (const q of questions) {
      n++;
      body += sec.type === "MCQ"
        ? buildMcqQuestion(q, n)
        : buildSubjectiveQuestion(q, n, sec.marksPerQuestion, sec.blankLines ?? 4);
    }
  }

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>${templateBaseCss(layout, accent)}</style></head>
<body><div class="page">
  ${header}${meta}${instructions}${body}${footer}
</div></body></html>`;
}

function assembleAnswerKey(
  layout: Layout,
  ctx: RenderContext,
  rendered: RenderedSection[],
): string {
  const accent = pickAccent(layout, true);
  const header = renderSection(layout.header, ctx, "header", accent);
  const footer = renderSection(layout.footer, ctx, "footer", accent);

  const groupSize = 10;
  let akHtml = "";
  const sectionOffsets: number[] = [];
  let globalOffset = 0;
  for (const r of rendered) {
    sectionOffsets.push(globalOffset);
    globalOffset += r.questions.length;
  }

  for (let sIdx = 0; sIdx < rendered.length; sIdx++) {
    const r = rendered[sIdx];
    if (r.sec.type !== "MCQ") continue;
    const start = sectionOffsets[sIdx];
    const rows: string[] = [];
    for (let i = 0; i < r.questions.length; i += groupSize) {
      const slice = r.questions.slice(i, i + groupSize);
      const nums = slice.map((_, j) => `<td>${start + i + j + 1}</td>`).join("");
      const ans = slice.map((q) => `<td class="ans-cell">${OPTION_SYMBOLS[q.correctOption as string] ?? q.correctOption ?? "?"}</td>`).join("");
      rows.push(
        `<tr><td class="lbl">Q.No</td>${nums}</tr><tr><td class="lbl">Ans</td>${ans}</tr><tr class="ak-spacer"><td colspan="${slice.length + 1}"></td></tr>`
      );
    }
    const secTitle = r.sec.title || `Section ${String.fromCharCode(65 + sIdx)}`;
    akHtml += `<div class="ak-section">
      <div class="ak-section-title">${secTitle} — MCQ (${r.questions.length} Qs)</div>
      <table class="ak-table">${rows.join("")}</table>
    </div>`;
  }

  const anyMcq = rendered.some((r) => r.sec.type === "MCQ");
  if (!anyMcq) {
    akHtml = `<div style="padding: 20px; text-align: center; color: #666;">No MCQ questions in this paper — no answer key needed.</div>`;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>${templateBaseCss(layout, accent)}</style></head>
<body><div class="page">
  ${header}${akHtml}${footer}
</div></body></html>`;
}

async function renderPdf(html: string): Promise<Buffer | null> {
  try {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    // Body includes its own header + footer via the template renderer.
    // For multi-page papers the footer only appears on the last page — acceptable
    // tradeoff to avoid Puppeteer's footerTemplate rendering quirks (see git history).
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    await browser.close();
    return Buffer.from(pdf);
  } catch {
    return null;
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function generatePaperRoutes(app: FastifyInstance, opts: GeneratePaperOptions) {
  const { prisma } = opts;

  app.post("/generate-paper", async (req, reply) => {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) {
      return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
    const body = req.body as PaperConfig;
    const { org, sections, type = "question-paper", templateId } = body;

    if (!org?.orgName) {
      return reply.code(400).send({ success: false, error: { code: "MISSING_ORG", message: "org.orgName is required" } });
    }
    if (!Array.isArray(sections) || sections.length === 0) {
      return reply.code(400).send({ success: false, error: { code: "NO_SECTIONS", message: "At least one section is required" } });
    }

    // Every subject/chapter referenced in the composition must be owned by the caller
    const requestedSubjectIds = new Set<string>();
    const requestedChapterIds = new Set<string>();
    for (const s of sections) {
      (s.scope?.subjectIds ?? []).forEach((id) => requestedSubjectIds.add(id));
      (s.scope?.chapterIds ?? []).forEach((id) => requestedChapterIds.add(id));
    }
    if (requestedSubjectIds.size > 0) {
      const rows = await prisma.subject.findMany({
        where: { id: { in: [...requestedSubjectIds] } },
        select: { id: true, class: { select: { createdBy: true } } },
      });
      if (rows.length !== requestedSubjectIds.size || rows.some((r) => !r.class || r.class.createdBy !== userId)) {
        return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
      }
    }
    if (requestedChapterIds.size > 0) {
      const rows = await prisma.chapter.findMany({
        where: { id: { in: [...requestedChapterIds] } },
        select: { id: true, subject: { select: { class: { select: { createdBy: true } } } } },
      });
      if (rows.length !== requestedChapterIds.size || rows.some((r) => !r.subject?.class || r.subject.class.createdBy !== userId)) {
        return reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: "Resource not found" } });
      }
    }

    // Load the chosen template (or fallback if none given)
    let layout: Layout = FALLBACK_LAYOUT;
    if (templateId) {
      const tmpl = await prisma.paperTemplate.findUnique({ where: { id: templateId } });
      if (tmpl) {
        layout = tmpl.layout as unknown as Layout;
      }
    }

    // Validate section shape up-front (sampler already handles most, but marksPerQuestion is UI-only)
    const upfrontErrors: string[] = [];
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      const label = sec.title || `Section ${String.fromCharCode(65 + i)}`;
      if (sec.type !== "MCQ" && sec.type !== "SUBJECTIVE") upfrontErrors.push(`${label}: type must be MCQ or SUBJECTIVE`);
      if (!sec.marksPerQuestion || sec.marksPerQuestion < 1) upfrontErrors.push(`${label}: marksPerQuestion must be at least 1`);
      if (!sec.numQuestions || sec.numQuestions < 1) upfrontErrors.push(`${label}: numQuestions must be at least 1`);
    }
    if (upfrontErrors.length > 0) {
      return reply.code(400).send({ success: false, error: { code: "SECTION_ERRORS", message: upfrontErrors.join(" • ") } });
    }

    // Sample via shared engine (deterministic + fair + difficulty-aware)
    const specs: SectionSpec[] = sections.map((s, i) => ({
      title: s.title || `Section ${String.fromCharCode(65 + i)}`,
      type: s.type,
      marksPerQuestion: s.marksPerQuestion,
      numQuestions: s.numQuestions,
      blankLines: s.blankLines,
      scope: s.scope,
      shuffle: s.shuffle,
      distributeAcrossChapters: s.distributeAcrossChapters,
      difficulty: s.difficulty,
    }));
    const sampleResult = await sampleComposition(prisma, specs, body.seed);
    if (sampleResult.errors.length > 0) {
      return reply.code(400).send({ success: false, error: { code: "SECTION_ERRORS", message: sampleResult.errors.join(" • ") } });
    }

    // Build rendered[] in the shape the HTML builders expect
    const subjectNames = new Set<string>();
    const chapterNames = new Set<string>();
    const rendered: RenderedSection[] = sampleResult.sections.map((ss) => {
      ss.questions.forEach((q: any) => {
        q.subject?.name && subjectNames.add(q.subject.name);
        q.chapter?.name && chapterNames.add(q.chapter.name);
      });
      return { sec: ss.spec as Section, questions: ss.questions };
    });

    const totalMarks = rendered.reduce((a, r) => a + r.questions.length * r.sec.marksPerQuestion, 0);
    const totalQuestions = rendered.reduce((a, r) => a + r.questions.length, 0);
    const totalTime = body.totalTime ?? Math.max(30, Math.ceil(totalMarks * 1.2));
    const paperTitle = body.paperTitle || "Question Paper";
    const date = body.date || "___________";
    const extraInstructions = body.instructions ?? [];
    const subjectLabel = [...subjectNames].slice(0, 3).join(", ") + (subjectNames.size > 3 ? ` & ${subjectNames.size - 3} more` : "");
    const chapterLabel = [...chapterNames].slice(0, 3).join(", ") + (chapterNames.size > 3 ? ` & ${chapterNames.size - 3} more` : "");
    const numVariants = Math.min(Math.max(body.shufflePapers ?? 1, 1), 4);
    const variantLabels = ["A", "B", "C", "D"];

    const baseCtx = (isAnswerKey: boolean, variant?: string): RenderContext => ({
      orgName: org.orgName,
      orgAddress: org.address,
      orgLogoText: org.logoText,
      examTitle: org.examTitle,
      paperTitle: isAnswerKey ? "Answer Key" : paperTitle,
      date, totalTime, totalMarks, totalQuestions,
      setNumber: variant, subjectLabel, chapterLabel,
      footerText: body.footerText,
      isAnswerKey,
    });

    if (type === "answer-key") {
      const html = assembleAnswerKey(layout, baseCtx(true), rendered);
      const pdf = await renderPdf(html);
      if (pdf) {
        return reply.header("Content-Type", "application/pdf")
          .header("Content-Disposition", `attachment; filename="AnswerKey.pdf"`)
          .send(pdf);
      }
      return reply.header("Content-Type", "text/html").send(html);
    }

    if (numVariants === 1) {
      const html = assemblePaper(layout, baseCtx(false), rendered, extraInstructions);
      const pdf = await renderPdf(html);
      if (pdf) {
        return reply.header("Content-Type", "application/pdf")
          .header("Content-Disposition", `attachment; filename="${paperTitle.replace(/\s+/g, "_")}.pdf"`)
          .send(pdf);
      }
      return reply.header("Content-Type", "text/html").send(html);
    }

    // Multi-variant — each variant is a distinct deterministic reshuffle
    const variantSeedBase = body.seed ?? Math.floor(Math.random() * 0xFFFFFFFF);
    const pages: string[] = [];
    for (let v = 0; v < numVariants; v++) {
      const variantRng = makeRng(variantSeedBase + v * 2654435761);
      const shuffled = rendered.map((r) => ({ ...r, questions: shuffleWithRng(r.questions, variantRng) }));
      const html = assemblePaper(layout, baseCtx(false, variantLabels[v]), shuffled, extraInstructions);
      const bodyOnly = html.replace(/<!DOCTYPE html>[\s\S]*?<body>/, "").replace("</body></html>", "");
      pages.push(bodyOnly);
    }
    const accent = pickAccent(layout, false);
    const merged = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>${templateBaseCss(layout, accent)}
.variant-break { page-break-before: always; }
</style></head><body>
${pages.map((p, i) => i === 0 ? p : `<div class="variant-break"></div>${p}`).join("")}
</body></html>`;
    const pdf = await renderPdf(merged);
    if (pdf) {
      return reply.header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${paperTitle.replace(/\s+/g, "_")}_AllSets.pdf"`)
        .send(pdf);
    }
    return reply.header("Content-Type", "text/html").send(merged);
  });

  // Scope-stats endpoint (unchanged from before)
  app.get("/generate-paper/scope-stats", async (req, reply) => {
    const q = req.query as { chapterIds?: string; subjectIds?: string };
    const chapterIds = q.chapterIds ? q.chapterIds.split(",").filter(Boolean) : [];
    const subjectIds = q.subjectIds ? q.subjectIds.split(",").filter(Boolean) : [];
    if (chapterIds.length === 0 && subjectIds.length === 0) {
      return reply.send({ success: true, data: { mcq: 0, subjective: 0 } });
    }
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) {
      return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }
    // Scope stats only leak counts for chapters/subjects the caller owns
    const where: Prisma.QuestionWhereInput = { isActive: true, createdBy: userId };
    if (chapterIds.length > 0) where.chapterId = { in: chapterIds };
    else where.subjectId = { in: subjectIds };
    const [mcq, subjective] = await Promise.all([
      prisma.question.count({ where: { ...where, type: "MCQ" } }),
      prisma.question.count({ where: { ...where, type: "SUBJECTIVE" } }),
    ]);
    return reply.send({ success: true, data: { mcq, subjective } });
  });
}
