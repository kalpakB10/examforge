import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";

/**
 * Register `/health` (liveness — process is up) and `/ready` (readiness — DB
 * reachable) on the app. Use `/health` for k8s liveness / basic uptime checks
 * and `/ready` for load-balancer routing decisions.
 */
export function registerHealthRoutes(
  app: FastifyInstance,
  serviceName: string,
  prisma: PrismaClient,
): void {
  app.get("/health", async () => ({ status: "ok", service: serviceName }));

  app.get("/ready", async (_req, reply) => {
    try {
      // Lightweight DB round-trip; fast even under load.
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      app.log.warn({ err }, "readiness DB check failed");
      return reply.code(503).send({ status: "not_ready", service: serviceName, reason: "db_unreachable" });
    }
    return reply.send({ status: "ok", service: serviceName });
  });
}
