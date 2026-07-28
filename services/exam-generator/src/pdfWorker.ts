import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { env } from "./lib/env";

const QUESTION_BANK_URL = env.QUESTION_BANK_URL;
const PAPERS_DIR = env.EXAM_PAPERS_DIR;

// Ensure directory exists
fs.mkdirSync(PAPERS_DIR, { recursive: true });

// Public shape stored on a BullMQ job — must be JSON-serializable.
export interface RenderJobData {
  examId: string;
  userId: string;
  userRole: string;
  templateId?: string;
  composition: unknown;              // sections[]
  seed?: number;                     // deterministic sampling seed
  org: {
    orgName: string;
    address?: string;
    logoText?: string;
    examTitle?: string;
  };
  paperTitle: string;
  date?: string;
  totalTime?: number;
  instructions?: string[];
  footerText?: string;
}

async function callGeneratePaper(
  input: RenderJobData,
  type: "question-paper" | "answer-key",
  logger?: { error: (obj: any, msg?: string) => void },
): Promise<Buffer | null> {
  const url = `${QUESTION_BANK_URL}/generate-paper`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": input.userId,
        "x-user-role": input.userRole,
      },
      body: JSON.stringify({
        org: input.org,
        paperTitle: input.paperTitle,
        date: input.date,
        totalTime: input.totalTime,
        instructions: input.instructions ?? [],
        sections: input.composition,
        templateId: input.templateId,
        seed: input.seed,
        footerText: input.footerText,
        type,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`generate-paper returned ${res.status}: ${text.slice(0, 200)}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/pdf")) {
      const text = await res.text();
      throw new Error(`Expected PDF but got ${ct}: ${text.slice(0, 200)}`);
    }
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (err: any) {
    logger?.error({ err, type }, "generate-paper call failed");
    return null;
  }
}

/**
 * Actually render the PDFs. Called by the BullMQ worker.
 * Updates the exam's pdfStatus, paperPath, answerKeyPath, pdfError as it progresses.
 * Throws on unrecoverable errors so BullMQ can retry.
 */
export async function processPdfJob(
  prisma: PrismaClient,
  data: RenderJobData,
  logger: { info: (obj: any, msg?: string) => void; error: (obj: any, msg?: string) => void; warn: (obj: any, msg?: string) => void },
): Promise<void> {
  const examId = data.examId;
  logger.info({ examId }, "pdf render job started");
  await prisma.exam.update({
    where: { id: examId },
    data: { pdfStatus: "PENDING", pdfError: null, paperPath: null, answerKeyPath: null },
  });

  const paperPdf = await callGeneratePaper(data, "question-paper", logger);
  if (!paperPdf) {
    // Non-retryable: question-bank returned a well-formed non-PDF (probably bad composition).
    await prisma.exam.update({
      where: { id: examId },
      data: { pdfStatus: "FAILED", pdfError: "Question paper render failed" },
    });
    throw new Error(`Paper render returned no PDF for exam ${examId}`);
  }
  const paperPath = path.join(PAPERS_DIR, `${examId}_paper.pdf`);
  fs.writeFileSync(paperPath, paperPdf);

  // Answer key is optional (no MCQ → question-bank returns HTML, which callGeneratePaper skips)
  const akPdf = await callGeneratePaper(data, "answer-key", logger);
  let akPath: string | null = null;
  if (akPdf) {
    akPath = path.join(PAPERS_DIR, `${examId}_answer_key.pdf`);
    fs.writeFileSync(akPath, akPdf);
  }

  await prisma.exam.update({
    where: { id: examId },
    data: {
      pdfStatus: "READY",
      paperPath,
      answerKeyPath: akPath,
      pdfError: null,
    },
  });
  logger.info({ examId, hasAnswerKey: !!akPath }, "pdf render job completed");
}

export function getPapersDir(): string {
  return PAPERS_DIR;
}
