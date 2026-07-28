import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { Queue } from "bullmq";
import * as crypto from "crypto";
import { sessionRoutes } from "./routes/sessions";
import { startTimerWorker } from "./workers/timerWorker";
import { env } from "./lib/env";
import { registerHealthRoutes } from "./lib/health";
import { installGracefulShutdown } from "./lib/shutdown";
import { initSentry, wireSentryToFastify, registerMetrics, registerQueueMetrics, installSlowRequestLogger, installSlowQueryLogger } from "./lib/observability";

initSentry("exam-session");

const prisma = new PrismaClient({
  log: [{ level: "query", emit: "event" }, { level: "warn", emit: "stdout" }, { level: "error", emit: "stdout" }],
});
const redisUrl = env.REDIS_URL;
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });

const resultQueue = new Queue("result-calculation", {
  connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
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

// Rate limiting: enable route-level limits (used by /sessions/join below).
// Keyed by IP address; the api-gateway forwards `x-forwarded-for` which the
// remoteAddr picks up when Fastify sits behind it.
app.register(rateLimit, {
  global: false,
});

// Convert rate-limit throw into our standard error envelope with 429.
app.setErrorHandler((error: any, _req, reply) => {
  if (error?.statusCode === 429) {
    reply.code(429).send({
      success: false,
      error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many attempts. Please wait and try again." },
    });
    return;
  }
  reply.code(error?.statusCode ?? 500).send({
    success: false,
    error: { code: error?.code ?? "INTERNAL_ERROR", message: error?.message ?? "An unexpected error occurred" },
  });
});

registerHealthRoutes(app, "exam-session", prisma, redis);
registerMetrics(app, "exam-session");
installSlowRequestLogger(app);
installSlowQueryLogger(prisma, app.log);
wireSentryToFastify(app);
registerQueueMetrics("result-calculation", async () => {
  const c = await resultQueue.getJobCounts("waiting", "active", "delayed", "failed");
  return {
    waiting: c.waiting ?? 0,
    active: c.active ?? 0,
    delayed: c.delayed ?? 0,
    failed: c.failed ?? 0,
  };
});

app.register(sessionRoutes, {
  prefix: "/sessions",
  prisma,
  redis,
  resultQueue,
});

const start = async () => {
  try {
    await prisma.$connect();
    const port = env.PORT;
    await app.listen({ port, host: "0.0.0.0" });
    app.log.info(`Exam Session service running on port ${port}`);
    startTimerWorker(prisma, redis, resultQueue, app.log);
    installGracefulShutdown(app, [
      { name: "prisma", close: () => prisma.$disconnect() },
      { name: "resultQueue", close: () => resultQueue.close() },
      { name: "redis", close: async () => { redis.disconnect(); } },
    ]);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
