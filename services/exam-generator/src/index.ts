import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import { examRoutes } from "./routes/exams";
import { env } from "./lib/env";
import { registerHealthRoutes } from "./lib/health";
import { installGracefulShutdown } from "./lib/shutdown";
import { initSentry, wireSentryToFastify, registerMetrics, registerQueueMetrics, installSlowRequestLogger, installSlowQueryLogger } from "./lib/observability";
import { createPdfQueue, startPdfWorker, PDF_QUEUE_NAME } from "./pdfQueue";

initSentry("exam-generator");

const prisma = new PrismaClient({
  log: [{ level: "query", emit: "event" }, { level: "warn", emit: "stdout" }, { level: "error", emit: "stdout" }],
});
const app = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    serializers: {
      req(req) {
        return { method: req.method, url: req.url, requestId: req.id };
      },
    },
  },
  genReqId: (req) => {
    const incoming = req.headers["x-request-id"];
    if (typeof incoming === "string" && incoming.trim() !== "") return incoming;
    return crypto.randomUUID();
  },
});

const pdfQueue = createPdfQueue(env.REDIS_URL);

registerHealthRoutes(app, "exam-generator", prisma);
registerMetrics(app, "exam-generator");
installSlowRequestLogger(app);
installSlowQueryLogger(prisma, app.log);
wireSentryToFastify(app);
registerQueueMetrics(PDF_QUEUE_NAME, async () => {
  const c = await pdfQueue.getJobCounts("waiting", "active", "delayed", "failed");
  return {
    waiting: c.waiting ?? 0,
    active: c.active ?? 0,
    delayed: c.delayed ?? 0,
    failed: c.failed ?? 0,
  };
});

app.register(examRoutes, { prefix: "/exams", prisma, pdfQueue });

const start = async () => {
  try {
    await prisma.$connect();
    const port = env.PORT;
    await app.listen({ port, host: "0.0.0.0" });
    app.log.info(`Exam Generator service running on port ${port}`);
    const pdfWorker = startPdfWorker(prisma, env.REDIS_URL, app.log);
    installGracefulShutdown(app, [
      { name: "prisma", close: () => prisma.$disconnect() },
      // Close the worker first so it stops picking up new jobs, then the queue.
      { name: "pdfQueue", close: () => pdfQueue.close() },
      { name: "pdfWorker", close: () => pdfWorker.close() },
    ]);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
