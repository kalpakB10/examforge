import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { Queue } from "bullmq";
import * as crypto from "crypto";
import { resultRoutes } from "./routes/results";
import { startResultWorker } from "./workers/resultWorker";
import { env } from "./lib/env";
import { registerHealthRoutes } from "./lib/health";
import { installGracefulShutdown } from "./lib/shutdown";
import { initSentry, wireSentryToFastify, registerMetrics, installSlowRequestLogger, installSlowQueryLogger } from "./lib/observability";

initSentry("result-engine");

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

registerHealthRoutes(app, "result-engine", prisma, redis);
registerMetrics(app, "result-engine");
installSlowRequestLogger(app);
installSlowQueryLogger(prisma, app.log);
wireSentryToFastify(app);

app.register(resultRoutes, { prefix: "/results", prisma });

const start = async () => {
  try {
    await prisma.$connect();
    const port = env.PORT;
    await app.listen({ port, host: "0.0.0.0" });
    app.log.info(`Result Engine service running on port ${port}`);
    startResultWorker(prisma, redisUrl, app.log);
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
