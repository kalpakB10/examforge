#!/usr/bin/env node
/**
 * One-shot: add `deletedAt` soft-delete column to Exam model across all six
 * per-service Prisma schemas. Idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICES = ["api-gateway", "question-bank", "exam-generator", "exam-session", "result-engine", "dispute-manager"];

const NEEDLE = `  createdAt           DateTime   @default(now()) @map("created_at")`;
const REPLACE = `  createdAt           DateTime   @default(now()) @map("created_at")
  deletedAt           DateTime?  @map("deleted_at")`;

for (const svc of SERVICES) {
  const path = join(__dirname, "..", "services", svc, "prisma", "schema.prisma");
  const src = readFileSync(path, "utf8");
  if (src.includes("deletedAt")) {
    console.log(`[soft-delete] ${svc}: already present, skipping`);
    continue;
  }
  if (!src.includes(NEEDLE)) {
    console.error(`[soft-delete] ${svc}: needle not found — schema drifted`);
    process.exit(1);
  }
  writeFileSync(path, src.replace(NEEDLE, REPLACE));
  console.log(`[soft-delete] ${svc}: added deletedAt`);
}
