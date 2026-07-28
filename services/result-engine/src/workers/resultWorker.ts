import { PrismaClient } from "@prisma/client";
import { Worker } from "bullmq";
import puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";

interface SimpleLogger {
  info(obj: object | string, msg?: string): void;
  warn(obj: object | string, msg?: string): void;
  error(obj: object | string, msg?: string): void;
}

function parseRedisUrl(url: string): { host: string; port: number } {
  const parsed = new URL(url.startsWith("redis://") ? url : `redis://${url}`);
  return { host: parsed.hostname, port: parseInt(parsed.port || "6379", 10) };
}

export function startResultWorker(
  prisma: PrismaClient,
  redisUrl: string,
  logger: SimpleLogger
) {
  const worker = new Worker(
    "result-calculation",
    async (job) => {
      const { sessionId, examId, studentId } = job.data as {
        sessionId: string;
        examId: string;
        studentId: string;
      };

      logger.info({ sessionId }, "Processing result calculation");

      // 1. Fetch session
      const session = await prisma.examSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) throw new Error(`Session ${sessionId} not found`);

      // 2. Fetch exam and questions with answers
      const exam = await prisma.exam.findUnique({
        where: { id: examId },
        include: {
          examQuestions: {
            orderBy: { questionOrder: "asc" },
            include: { question: true },
          },
        },
      });
      if (!exam) throw new Error(`Exam ${examId} not found`);

      const studentAnswers = (session.answers as Record<string, string>) ?? {};

      let correctCount = 0;
      let wrongCount = 0;
      let skippedCount = 0;

      for (const eq of exam.examQuestions) {
        const order = String(eq.questionOrder);
        const studentAnswer = studentAnswers[order];

        if (!studentAnswer) {
          skippedCount++;
        } else if (studentAnswer === eq.question.correctOption) {
          correctCount++;
        } else {
          wrongCount++;
        }
      }

      const rawScore = correctCount * exam.marksPerQuestion;
      const negativeDeduction = exam.negativeMarking
        ? wrongCount * exam.negativeMarksValue
        : 0;
      const finalScore = Math.max(0, rawScore - negativeDeduction);
      const percentage =
        exam.totalMarks > 0
          ? Math.round((finalScore / exam.totalMarks) * 10000) / 100
          : 0;
      const totalAttempted = correctCount + wrongCount;

      // 3. Get student identity from session
      const studentName = session.studentName ?? studentId;
      const rollNumber = session.rollNumber ?? studentId;
      const safeFilename = rollNumber.replace(/[^A-Za-z0-9_-]/g, "_");

      // 3. Generate PDF answer key
      const uploadsPath = process.env.UPLOADS_PATH || "./uploads";
      const pdfDir = path.join(uploadsPath, "answer-keys", examId);
      fs.mkdirSync(pdfDir, { recursive: true });
      const pdfPath = path.join(pdfDir, `${safeFilename}.pdf`);
      const answerKeyUrl = `/uploads/answer-keys/${examId}/${safeFilename}.pdf`;

      const html = buildAnswerKeyHtml(
        exam.title,
        studentName,
        rollNumber,
        exam.examQuestions,
        studentAnswers
      );

      await generatePdf(html, pdfPath, logger);

      // 4. Insert result
      const existing = await prisma.result.findUnique({
        where: { examSessionId: sessionId },
      });

      if (existing) {
        await prisma.result.update({
          where: { examSessionId: sessionId },
          data: {
            studentName,
            rollNumber,
            totalAttempted,
            correctCount,
            wrongCount,
            skippedCount,
            rawScore,
            negativeDeduction,
            finalScore,
            percentage,
            answerKeyUrl,
            calculatedAt: new Date(),
          },
        });
      } else {
        await prisma.result.create({
          data: {
            examSessionId: sessionId,
            studentId,
            studentName,
            rollNumber,
            examId,
            totalAttempted,
            correctCount,
            wrongCount,
            skippedCount,
            rawScore,
            negativeDeduction,
            finalScore,
            percentage,
            answerKeyUrl,
          },
        });
      }

      // 5. Check if all sessions for exam are submitted ??' assign ranks
      const allSessions = await prisma.examSession.findMany({
        where: { examId },
      });
      const allDone = allSessions.every(
        (s) => s.status === "SUBMITTED" || s.status === "EXPIRED"
      );

      if (allDone) {
        await assignRanks(examId, prisma, logger);
      }

      logger.info({ sessionId, finalScore }, "Result calculated successfully");
    },
    {
      connection: parseRedisUrl(redisUrl),
      concurrency: 3,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Result calculation job failed");
  });

  logger.info("Result calculation worker started");
  return worker;
}

async function assignRanks(
  examId: string,
  prisma: PrismaClient,
  logger: SimpleLogger
) {
  logger.info({ examId }, "Assigning ranks");

  const results = await prisma.result.findMany({
    where: { examId },
    orderBy: { finalScore: "desc" },
  });

  let rank = 1;
  for (let i = 0; i < results.length; i++) {
    if (i > 0 && results[i].finalScore < results[i - 1].finalScore) {
      rank = i + 1;
    }
    await prisma.result.update({
      where: { id: results[i].id },
      data: { rank },
    });
  }
}

const QUESTION_BANK_BASE = process.env.QUESTION_BANK_URL || "http://question-bank:3001";

function resolveImageUrl(staticPath: string | null | undefined): string | null {
  if (!staticPath) return null;
  // staticPath is like /static/question-images/uuid-file.png
  return `${QUESTION_BANK_BASE}${staticPath}`;
}

function imgTag(url: string | null | undefined, alt = "", extraStyle = ""): string {
  if (!url) return "";
  return `<img src="${url}" alt="${alt}" style="max-width:400px;max-height:300px;display:block;margin:6px 0;border-radius:4px;${extraStyle}" />`;
}

function buildAnswerKeyHtml(
  examTitle: string,
  studentName: string,
  rollNumber: string,
  examQuestions: Array<{
    questionOrder: number;
    question: {
      text: string;
      questionImageUrl: string | null;
      optionA: string | null;
      optionAImageUrl: string | null;
      optionB: string | null;
      optionBImageUrl: string | null;
      optionC: string | null;
      optionCImageUrl: string | null;
      optionD: string | null;
      optionDImageUrl: string | null;
      correctOption: string | null;
    };
  }>,
  studentAnswers: Record<string, string>
): string {
  const questionRows = examQuestions
    .map((eq) => {
      const q = eq.question;
      const order = String(eq.questionOrder);
      const studentAnswer = studentAnswers[order] || "SKIPPED";
      const correct = q.correctOption;

      const qImgUrl = resolveImageUrl(q.questionImageUrl);

      const options = [
        { key: "A", text: q.optionA, imageUrl: resolveImageUrl(q.optionAImageUrl) },
        { key: "B", text: q.optionB, imageUrl: resolveImageUrl(q.optionBImageUrl) },
        { key: "C", text: q.optionC, imageUrl: resolveImageUrl(q.optionCImageUrl) },
        { key: "D", text: q.optionD, imageUrl: resolveImageUrl(q.optionDImageUrl) },
      ];

      const optionHtml = options
        .map((opt) => {
          const isCorrect = opt.key === correct;
          const isWrong = opt.key === studentAnswer && opt.key !== correct;
          let bg = "";
          if (isCorrect) bg = "background:#d4edda;";
          if (isWrong) bg = "background:#f8d7da;";
          const badge = isCorrect ? " &#10003;" : isWrong ? " &#10007;" : "";
          const optImg = imgTag(opt.imageUrl, `Option ${opt.key}`);
          const textPart = opt.text ? `<span>${opt.text}</span>` : "";
          return `<div style="padding:6px 10px;border-radius:4px;margin-bottom:4px;${bg}">
            <strong>${opt.key}.</strong>${badge} ${textPart}${optImg}
          </div>`;
        })
        .join("");

      const statusColor = studentAnswer === correct ? "#28a745" : studentAnswer === "SKIPPED" ? "#6c757d" : "#dc3545";
      const status = studentAnswer === correct ? "Correct" : studentAnswer === "SKIPPED" ? "Skipped" : "Wrong";

      return `
        <div style="margin-bottom:24px;padding:14px;border:1px solid #dee2e6;border-radius:8px;page-break-inside:avoid;">
          <div style="font-weight:bold;margin-bottom:6px;">Q${eq.questionOrder}. ${q.text}</div>
          ${imgTag(qImgUrl, "Question image")}
          <div style="margin:10px 0;">${optionHtml}</div>
          <div style="color:${statusColor};font-size:12px;margin-top:6px;">
            Your answer: <strong>${studentAnswer}</strong> &nbsp;|&nbsp; Correct: <strong>${correct}</strong> &nbsp;|&nbsp; ${status}
          </div>
        </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Answer Key - ${examTitle}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #333; font-size: 14px; }
    h1 { color: #2c3e50; margin: 0 0 4px; }
    .header { border-bottom: 2px solid #3498db; padding-bottom: 12px; margin-bottom: 24px; }
    img { object-fit: contain; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${examTitle} &mdash; Answer Key</h1>
    <p style="margin:4px 0;"><strong>Student:</strong> ${studentName}</p>
    <p style="margin:4px 0;"><strong>Roll Number:</strong> ${rollNumber}</p>
    <p style="margin:4px 0;">Generated: ${new Date().toLocaleString()}</p>
  </div>
  ${questionRows}
</body>
</html>`;
}

async function generatePdf(
  html: string,
  outputPath: string,
  logger: SimpleLogger
): Promise<void> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: outputPath, format: "A4", margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" } });
  } catch (err) {
    logger.error({ err }, "PDF generation failed, saving HTML fallback");
    fs.writeFileSync(outputPath.replace(".pdf", ".html"), html, "utf-8");
  } finally {
    if (browser) await browser.close();
  }
}

