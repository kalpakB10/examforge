#!/usr/bin/env node
/**
 * One-shot: strip QuickTest + QuickTestAttempt models from all six per-service
 * Prisma schemas. Idempotent — running twice is a no-op.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICES = ["api-gateway", "question-bank", "exam-generator", "exam-session", "result-engine", "dispute-manager"];

// Match `model QuickTest { ... }` and `model QuickTestAttempt { ... }` blocks.
// Multi-line — greedy up to the closing `}` on its own line.
const RX = /model (?:QuickTest|QuickTestAttempt) \{[\s\S]*?\n\}\n?/g;

for (const svc of SERVICES) {
  const path = join(__dirname, "..", "services", svc, "prisma", "schema.prisma");
  const src = readFileSync(path, "utf8");
  const stripped = src.replace(RX, "");
  if (stripped === src) {
    console.log(`[quicktest-strip] ${svc}: nothing to remove`);
    continue;
  }
  // Collapse triple-blank-lines that result from the removal.
  const cleaned = stripped.replace(/\n{3,}/g, "\n\n");
  writeFileSync(path, cleaned);
  console.log(`[quicktest-strip] ${svc}: removed`);
}
