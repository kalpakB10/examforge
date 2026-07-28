import * as Sentry from "@sentry/node";
import { FastifyInstance } from "fastify";
import * as promClient from "prom-client";

/**
 * Initialize Sentry if SENTRY_DSN is set; otherwise this is a no-op so devs
 * don't need to set anything to run the stack locally.
 *
 * Call this ONCE at process start, before creating the Fastify app.
 */
export function initSentry(serviceName: string): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || dsn.trim() === "") return false;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    serverName: serviceName,
    // Small sample rate — errors are always captured; this only affects perf spans.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0"),
    // Send request-id + basic metadata; strip anything sensitive.
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });
  // eslint-disable-next-line no-console
  console.log(`[sentry] initialized for ${serviceName}`);
  return true;
}

/**
 * Register a Fastify error hook that forwards unhandled 5xx errors to Sentry
 * with the request id as a tag. Safe to call whether Sentry is initialized
 * or not (captureException is a no-op if init wasn't called).
 */
export function wireSentryToFastify(app: FastifyInstance): void {
  app.addHook("onError", async (req, _reply, error: any) => {
    const statusCode = error?.statusCode ?? 500;
    // Only report unhandled server errors — 4xxs are usually caller mistakes.
    if (statusCode < 500) return;
    Sentry.withScope((scope) => {
      scope.setTag("requestId", String(req.id));
      scope.setTag("method", req.method);
      scope.setTag("route", req.routeOptions?.url ?? req.url);
      scope.setContext("request", { url: req.url, method: req.method });
      Sentry.captureException(error);
    });
  });
}

export { Sentry };

// ─── Slow-query + slow-request logging ───────────────────────────────────────

const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS ?? "2000");
const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? "500");

/**
 * Warn-log any request that took longer than SLOW_REQUEST_MS to serve.
 * Uses reply.elapsedTime so it accounts for the full server-side time.
 */
export function installSlowRequestLogger(app: FastifyInstance): void {
  app.addHook("onResponse", async (req, reply) => {
    if (req.url === "/metrics" || req.url === "/health" || req.url === "/ready") return;
    if (reply.elapsedTime > SLOW_REQUEST_MS) {
      req.log.warn(
        { url: req.url, method: req.method, elapsedMs: Math.round(reply.elapsedTime) },
        "slow request",
      );
    }
  });
}

/**
 * Attach a Prisma `$on('query')` listener that warn-logs any query slower
 * than SLOW_QUERY_MS. Requires the PrismaClient to be constructed with
 * `log: [{ level: 'query', emit: 'event' }]`.
 */
export function installSlowQueryLogger(
  prisma: any,
  log: { warn: (obj: any, msg?: string) => void },
): void {
  try {
    prisma.$on("query", (e: { duration: number; query: string; params: string }) => {
      if (e.duration > SLOW_QUERY_MS) {
        log.warn(
          { durationMs: e.duration, query: e.query.slice(0, 200) },
          "slow query",
        );
      }
    });
  } catch {
    // PrismaClient wasn't configured with event emit — skip silently.
  }
}

// ─── Prometheus metrics ──────────────────────────────────────────────────────

// Use a single global registry per process. Default node metrics (event loop
// lag, memory, GC, CPU) are collected once at init.
let metricsInitialized = false;
let httpRequestsTotal: promClient.Counter<string>;
let httpRequestDurationSeconds: promClient.Histogram<string>;

/**
 * Register `/metrics` and instrument every HTTP request with a Counter
 * (labeled method/route/status) and a Histogram (labeled method/route).
 * Route label uses the Fastify route pattern (e.g. `/exams/:id`) not the
 * concrete URL, so cardinality stays bounded.
 */
export function registerMetrics(app: FastifyInstance, serviceName: string): void {
  if (!metricsInitialized) {
    promClient.collectDefaultMetrics({ prefix: "app_" });
    httpRequestsTotal = new promClient.Counter({
      name: "http_requests_total",
      help: "Total HTTP requests processed",
      labelNames: ["service", "method", "route", "status"],
    });
    httpRequestDurationSeconds = new promClient.Histogram({
      name: "http_request_duration_seconds",
      help: "HTTP request latency in seconds",
      labelNames: ["service", "method", "route"],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    });
    metricsInitialized = true;
  }

  app.addHook("onResponse", async (req, reply) => {
    // Skip metrics scraping itself and health probes to avoid noise + recursion.
    if (req.url === "/metrics" || req.url === "/health" || req.url === "/ready") return;
    const route = req.routeOptions?.url ?? "unknown";
    const method = req.method;
    const status = String(reply.statusCode);
    httpRequestsTotal.inc({ service: serviceName, method, route, status });
    // reply.elapsedTime is in ms; convert to seconds for Prometheus convention.
    httpRequestDurationSeconds.observe({ service: serviceName, method, route }, reply.elapsedTime / 1000);
  });

  app.get("/metrics", async (_req, reply) => {
    reply.header("Content-Type", promClient.register.contentType);
    return promClient.register.metrics();
  });
}

/**
 * Register a gauge that reports BullMQ queue depth (waiting + active + delayed).
 * Call ONCE per queue after the Queue is created. Values are refreshed on
 * every /metrics scrape.
 */
export function registerQueueMetrics(
  queueName: string,
  getCounts: () => Promise<{ waiting: number; active: number; delayed: number; failed: number }>,
): void {
  new promClient.Gauge({
    name: "queue_jobs",
    help: "BullMQ jobs by state",
    labelNames: ["queue", "state"],
    async collect() {
      try {
        const c = await getCounts();
        this.set({ queue: queueName, state: "waiting" }, c.waiting);
        this.set({ queue: queueName, state: "active" }, c.active);
        this.set({ queue: queueName, state: "delayed" }, c.delayed);
        this.set({ queue: queueName, state: "failed" }, c.failed);
      } catch { /* skip this scrape */ }
    },
  });
}
