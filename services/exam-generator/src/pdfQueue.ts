import { PrismaClient } from "@prisma/client";
import { Queue, Worker, JobsOptions } from "bullmq";
import Redis from "ioredis";
import type { FastifyBaseLogger } from "fastify";
import { RenderJobData, processPdfJob } from "./pdfWorker";

export const PDF_QUEUE_NAME = "exam-pdf-generation";

// Sensible default job options: retry twice with exponential backoff, keep
// completed jobs for one day for debugging, failed for a week.
const DEFAULT_JOB_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 500 },
  removeOnFail: { age: 7 * 24 * 3600, count: 500 },
};

export function createPdfQueue(redisUrl: string): Queue<RenderJobData> {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return new Queue<RenderJobData>(PDF_QUEUE_NAME, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTS,
  });
}

/**
 * Start the BullMQ worker that consumes PDF render jobs.
 * Concurrency 1 by default — Puppeteer is memory-heavy and we don't want to
 * launch multiple Chromium instances in parallel on a small box. Raise via
 * PDF_WORKER_CONCURRENCY env if the host has spare RAM.
 */
export function startPdfWorker(
  prisma: PrismaClient,
  redisUrl: string,
  logger: FastifyBaseLogger,
): Worker<RenderJobData> {
  const concurrency = Number(process.env.PDF_WORKER_CONCURRENCY) || 1;
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<RenderJobData>(
    PDF_QUEUE_NAME,
    async (job) => {
      const childLog = logger.child({ jobId: job.id, examId: job.data.examId, attempt: job.attemptsMade + 1 });
      await processPdfJob(prisma, job.data, childLog);
    },
    { connection, concurrency },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, examId: job?.data.examId, err }, "pdf job failed");
  });
  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, examId: job.data.examId }, "pdf job completed");
  });

  logger.info({ concurrency }, "PDF worker started");
  return worker;
}
