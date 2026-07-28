import Fastify from "fastify";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import { PrismaClient } from "@prisma/client";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { questionRoutes } from "./routes/questions";
import { subjectRoutes } from "./routes/subjects";
import { chapterRoutes } from "./routes/chapters";
import { pdfRoutes } from "./routes/pdf";
import { excelUploadRoutes } from "./routes/excelUpload";
import { templateRoutes } from "./routes/template";
import { generatePaperRoutes } from "./routes/generatePaper";
import { quickTestRoutes } from "./routes/quickTest";
import { classRoutes } from "./routes/classes";
import { subSubjectRoutes } from "./routes/subSubjects";
import { teacherStatsRoutes } from "./routes/teacherStats";
import { paperTemplateRoutes, seedPresets } from "./routes/paperTemplates";
import { LocalStorageService } from "./storage/StorageService";
import { env } from "./lib/env";
import { registerHealthRoutes } from "./lib/health";
import { installGracefulShutdown } from "./lib/shutdown";
import { initSentry, wireSentryToFastify, registerMetrics, installSlowRequestLogger, installSlowQueryLogger } from "./lib/observability";

initSentry("question-bank");

const prisma = new PrismaClient({
  log: [{ level: "query", emit: "event" }, { level: "warn", emit: "stdout" }, { level: "error", emit: "stdout" }],
});

const UPLOADS_DIR = env.UPLOADS_DIR;
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = new LocalStorageService(UPLOADS_DIR, "/static/question-images");

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

// Multipart — allow up to 5 MB per file, 50 MB total
app.register(multipart, {
  limits: { fileSize: 5 * 1024 * 1024, files: 10, fieldSize: 1024 * 1024 },
});

// Serve uploaded images statically
app.register(staticFiles, {
  root: UPLOADS_DIR,
  prefix: "/static/question-images/",
  decorateReply: false,
});

registerHealthRoutes(app, "question-bank", prisma);
registerMetrics(app, "question-bank");
installSlowRequestLogger(app);
installSlowQueryLogger(prisma, app.log);
wireSentryToFastify(app);

app.register(questionRoutes, { prefix: "/questions", prisma, storage });
app.register(excelUploadRoutes, { prefix: "/questions", prisma, storage });
app.register(templateRoutes, { prefix: "/questions" });
app.register(subjectRoutes, { prefix: "/subjects", prisma });
app.register(chapterRoutes, { prefix: "/chapters", prisma, storage });
app.register(pdfRoutes, { prefix: "/chapters", prisma });
app.register(generatePaperRoutes, { prefix: "", prisma });
app.register(quickTestRoutes, { prefix: "/quick-tests", prisma });
app.register(classRoutes, { prefix: "/classes", prisma });
app.register(subSubjectRoutes, { prefix: "/sub-subjects", prisma });
app.register(teacherStatsRoutes, { prefix: "/teacher", prisma });
app.register(paperTemplateRoutes, { prefix: "/paper-templates", prisma });

const start = async () => {
  try {
    await prisma.$connect();
    // Seed preset paper templates (idempotent)
    try {
      await seedPresets(prisma);
      app.log.info("Paper template presets seeded/updated");
    } catch (e) {
      app.log.warn({ err: e }, "Preset seeding failed");
    }
    const port = env.PORT;
    await app.listen({ port, host: "0.0.0.0" });
    app.log.info(`Question Bank service running on port ${port}`);
    app.log.info(`Static images served from ${UPLOADS_DIR} at /static/question-images/`);
    installGracefulShutdown(app, [
      { name: "prisma", close: () => prisma.$disconnect() },
    ]);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
