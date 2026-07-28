import { PrismaClient, SessionStatus } from "@prisma/client";
import Redis from "ioredis";
import { Queue } from "bullmq";

interface SimpleLogger {
  info(obj: object | string, msg?: string): void;
  warn(obj: object | string, msg?: string): void;
  error(obj: object | string, msg?: string): void;
}

export function startTimerWorker(
  prisma: PrismaClient,
  redis: Redis,
  resultQueue: Queue,
  logger: SimpleLogger
) {
  // Subscribe to Redis keyspace notifications for expired keys
  const subscriber = new Redis(redis.options);

  subscriber.config("SET", "notify-keyspace-events", "KEA").catch((err) => {
    logger.warn({ err }, "Could not configure keyspace notifications — falling back to polling");
    startPollingWorker(prisma, redis, resultQueue, logger);
    return;
  });

  subscriber.subscribe("__keyevent@0__:expired", (err) => {
    if (err) {
      logger.error({ err }, "Failed to subscribe to keyspace notifications, using polling");
      startPollingWorker(prisma, redis, resultQueue, logger);
      return;
    }
    logger.info("Subscribed to Redis keyspace notifications for timer expiry");
  });

  subscriber.on("message", async (_channel: string, key: string) => {
    const match = key.match(/^session:([^:]+):timer$/);
    if (!match) return;

    const sessionId = match[1];
    await handleExpiredSession(sessionId, prisma, resultQueue, logger);
  });
}

function startPollingWorker(
  prisma: PrismaClient,
  redis: Redis,
  resultQueue: Queue,
  logger: SimpleLogger
) {
  logger.info("Starting timer polling worker (30s interval)");

  setInterval(async () => {
    try {
      const sessions = await prisma.examSession.findMany({
        where: { status: SessionStatus.IN_PROGRESS },
      });

      for (const session of sessions) {
        const timerKey = `session:${session.id}:timer`;
        const ttl = await redis.ttl(timerKey);
        if (ttl === -2) {
          // Key doesn't exist — timer expired
          await handleExpiredSession(session.id, prisma, resultQueue, logger);
        }
      }
    } catch (err) {
      logger.error({ err }, "Error in timer polling worker");
    }
  }, 30_000);
}

async function handleExpiredSession(
  sessionId: string,
  prisma: PrismaClient,
  resultQueue: Queue,
  logger: SimpleLogger
) {
  try {
    const session = await prisma.examSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.status !== SessionStatus.IN_PROGRESS) return;

    logger.info({ sessionId }, "Auto-submitting expired session");

    await prisma.examSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.EXPIRED,
        submittedAt: new Date(),
        isAutoSubmitted: true,
      },
    });

    await resultQueue.add("calculate-result", {
      sessionId,
      examId: session.examId,
      studentId: session.studentId,
    });
  } catch (err) {
    logger.error({ err, sessionId }, "Failed to auto-submit session");
  }
}
