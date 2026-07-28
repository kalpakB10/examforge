import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { Queue } from "bullmq";
import * as crypto from "crypto";
import { disputeRoutes } from "./routes/disputes";
import { env } from "./lib/env";
import { registerHealthRoutes } from "./lib/health";
import { installGracefulShutdown } from "./lib/shutdown";
import { initSentry, wireSentryToFastify, registerMetrics, installSlowRequestLogger, installSlowQueryLogger } from "./lib/observability";

initSentry("dispute-manager");

const prisma = new PrismaClient({
  log: [{ level: "query", emit: "event" }, { level: "warn", emit: "stdout" }, { level: "error", emit: "stdout" }],
});
const redisUrl = env.REDIS_URL;
// Standalone Redis connection used only for the readiness ping.
const redisPing = new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });

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

registerHealthRoutes(app, "dispute-manager", prisma, redisPing);
registerMetrics(app, "dispute-manager");
installSlowRequestLogger(app);
installSlowQueryLogger(prisma, app.log);
wireSentryToFastify(app);

app.register(disputeRoutes, { prefix: "/disputes", prisma, resultQueue });

const start = async () => {
  try {
    await prisma.$connect();
    const port = env.PORT;
    await app.listen({ port, host: "0.0.0.0" });
    app.log.info(`Dispute Manager service running on port ${port}`);
    installGracefulShutdown(app, [
      { name: "prisma", close: () => prisma.$disconnect() },
      { name: "resultQueue", close: () => resultQueue.close() },
      { name: "redisPing", close: async () => { redisPing.disconnect(); } },
    ]);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
