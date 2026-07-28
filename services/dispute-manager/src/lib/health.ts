import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import type Redis from "ioredis";

/**
 * `/health` = liveness; `/ready` = DB + Redis reachable.
 */
export function registerHealthRoutes(
  app: FastifyInstance,
  serviceName: string,
  prisma: PrismaClient,
  redis: Redis,
): void {
  app.get("/health", async () => ({ status: "ok", service: serviceName }));

  app.get("/ready", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      app.log.warn({ err }, "readiness DB check failed");
      return reply.code(503).send({ status: "not_ready", service: serviceName, reason: "db_unreachable" });
    }
    try {
      const pong = await redis.ping();
      if (pong !== "PONG") throw new Error(`unexpected ping response: ${pong}`);
    } catch (err) {
      app.log.warn({ err }, "readiness Redis check failed");
      return reply.code(503).send({ status: "not_ready", service: serviceName, reason: "redis_unreachable" });
    }
    return reply.send({ status: "ok", service: serviceName });
  });
}
