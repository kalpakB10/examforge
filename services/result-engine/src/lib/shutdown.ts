import { FastifyInstance } from "fastify";

/**
 * Wire SIGTERM / SIGINT to a graceful shutdown:
 *   1. Stop accepting new HTTP connections (fastify.close())
 *   2. Let in-flight requests finish (bounded by shutdownTimeoutMs)
 *   3. Invoke each `onClose` handler in reverse-registration order
 *
 * Registration order matters: caller passes the closers in dependency order
 * (e.g. Prisma first, then Redis, then queues) — we drain in the reverse of
 * that so producers stop before consumers.
 */
type Closer = { name: string; close: () => Promise<void> | void };

export function installGracefulShutdown(
  app: FastifyInstance,
  closers: Closer[],
  shutdownTimeoutMs: number = 15_000,
): void {
  let shuttingDown = false;

  const handle = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "graceful shutdown started");

    const forceExit = setTimeout(() => {
      app.log.error({ shutdownTimeoutMs }, "graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, shutdownTimeoutMs);
    // Don't keep the loop alive just for the timer.
    forceExit.unref();

    try {
      await app.close();
      for (let i = closers.length - 1; i >= 0; i--) {
        const c = closers[i];
        try {
          await c.close();
          app.log.info({ resource: c.name }, "closed");
        } catch (err) {
          app.log.error({ err, resource: c.name }, "close failed");
        }
      }
      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "graceful shutdown failed");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void handle("SIGTERM"));
  process.on("SIGINT", () => void handle("SIGINT"));
}
