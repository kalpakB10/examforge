import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";
import { env } from "./lib/env";
import { registerHealthRoutes } from "./lib/health";
import { installGracefulShutdown } from "./lib/shutdown";
import { initSentry, wireSentryToFastify, registerMetrics, installSlowRequestLogger, installSlowQueryLogger } from "./lib/observability";
import { authMiddleware } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { createProxyHandler } from "./proxy";

// Sentry must be initialized before Fastify so its instrumentation is in place.
initSentry("api-gateway");

const prisma = new PrismaClient({
  log: [{ level: "query", emit: "event" }, { level: "warn", emit: "stdout" }, { level: "error", emit: "stdout" }],
});

const app = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          requestId: req.id,
        };
      },
    },
  },
  // Honor an incoming x-request-id if present (useful for external tracing);
  // otherwise generate a fresh UUID. Downstream services will use this same id.
  genReqId: (req) => {
    const incoming = req.headers["x-request-id"];
    if (typeof incoming === "string" && incoming.trim() !== "") return incoming;
    return crypto.randomUUID();
  },
});

// Accept multipart and octet-stream as raw buffers so the proxy can forward them unchanged
app.addContentTypeParser(
  ["multipart/form-data", "application/octet-stream"],
  { parseAs: "buffer" },
  (_req, body, done) => done(null, body)
);

// CORS — restrict to configured frontend origin(s)
const allowedOrigins = env.FRONTEND_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
app.register(cors, {
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-Requested-With"],
});

// Rate limiting: 100 req/min per IP (global default). Sensitive endpoints
// override with tighter per-route limits registered below in authRoutes /
// with the auth-plugin decorator (via a route-level `config.rateLimit`).
app.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: "1 minute",
  errorResponseBuilder: () => ({
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests, slow down",
    },
  }),
});

// Auth middleware on all routes
app.addHook("preHandler", authMiddleware);

// Health + readiness + metrics + Sentry error hook.
registerHealthRoutes(app, "api-gateway", prisma);
registerMetrics(app, "api-gateway");
installSlowRequestLogger(app);
installSlowQueryLogger(prisma, app.log);
wireSentryToFastify(app);

// Auth routes (public)
app.register(authRoutes, { prefix: "/auth", prisma });

// Service URLs
const QUESTION_BANK_URL = env.QUESTION_BANK_URL;
const EXAM_GENERATOR_URL = env.EXAM_GENERATOR_URL;
const EXAM_SESSION_URL = env.EXAM_SESSION_URL;
const RESULT_ENGINE_URL = env.RESULT_ENGINE_URL;
const DISPUTE_MANAGER_URL = env.DISPUTE_MANAGER_URL;

// Proxy routes — Question Bank
const questionProxy = createProxyHandler(QUESTION_BANK_URL);
app.all("/classes", questionProxy);
app.all("/classes/*", questionProxy);
app.all("/sub-subjects", questionProxy);
app.all("/sub-subjects/*", questionProxy);
app.all("/questions", questionProxy);
app.all("/questions/*", questionProxy);
app.all("/subjects", questionProxy);
app.all("/subjects/*", questionProxy);
app.all("/chapters", questionProxy);
app.all("/chapters/*", questionProxy);
app.all("/generate-paper", questionProxy);
app.all("/generate-paper/*", questionProxy);
app.all("/teacher/stats", questionProxy);
app.all("/teacher/activity", questionProxy);
app.all("/paper-templates", questionProxy);
app.all("/paper-templates/*", questionProxy);

// Proxy routes — Exam Generator
const examProxy = createProxyHandler(EXAM_GENERATOR_URL);
app.all("/exams", examProxy);
app.all("/exams/*", examProxy);

// Proxy routes — Exam Session
const sessionProxy = createProxyHandler(EXAM_SESSION_URL);
app.all("/sessions", sessionProxy);
app.all("/sessions/*", sessionProxy);

// Proxy routes — Result Engine
const resultProxy = createProxyHandler(RESULT_ENGINE_URL);
app.all("/results", resultProxy);
app.all("/results/*", resultProxy);

// Proxy routes — Dispute Manager
const disputeProxy = createProxyHandler(DISPUTE_MANAGER_URL);
app.all("/disputes", disputeProxy);
app.all("/disputes/*", disputeProxy);

// Global error handler
app.setErrorHandler((error: any, req, reply) => {
  // Rate-limit errors: send our structured envelope with 429
  if (error?.statusCode === 429 || error?.error?.code === "RATE_LIMIT_EXCEEDED") {
    reply.code(429).send({
      success: false,
      error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests, slow down" },
    });
    return;
  }
  req.log.error({ err: error, requestId: req.id }, "Unhandled error");
  reply.code(error.statusCode ?? 500).send({
    success: false,
    error: {
      code: error.code ?? "INTERNAL_ERROR",
      message: error.message ?? "An unexpected error occurred",
    },
  });
});

const start = async () => {
  try {
    await prisma.$connect();
    const port = env.PORT;
    await app.listen({ port, host: "0.0.0.0" });
    app.log.info(`API Gateway running on port ${port}`);
    installGracefulShutdown(app, [
      { name: "prisma", close: () => prisma.$disconnect() },
    ]);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
