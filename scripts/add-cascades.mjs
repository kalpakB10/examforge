#!/usr/bin/env node
/**
 * One-shot: add `onDelete: Cascade` to Exam-related child relations across all
 * six per-service Prisma schemas. Idempotent — running twice is a no-op.
 *
 * Cascades added (child → parent, deleting parent deletes child):
 *   ExamQuestion   → Exam
 *   ExamHistory    → Exam (usedInExamId)
 *   ExamSession    → Exam
 *   Result         → Exam
 *   Result         → ExamSession
 *   Dispute        → Exam
 *   Dispute        → ExamSession
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICES_DIR = join(__dirname, "..", "services");
const SERVICES = ["api-gateway", "question-bank", "exam-generator", "exam-session", "result-engine", "dispute-manager"];

// Each entry: unique substring on the relation line + the annotation to append inside the @relation(...)
const EDITS = [
  { match: /^(\s*exam\s+Exam\s+@relation\(fields: \[examId\], references: \[id\])\)(\s*)$/gm, kind: "onDelete: Cascade" },
  { match: /^(\s*exam\s+Exam\s+@relation\(fields: \[usedInExamId\], references: \[id\])\)(\s*)$/gm, kind: "onDelete: Cascade" },
  { match: /^(\s*examSession\s+ExamSession\s+@relation\(fields: \[examSessionId\], references: \[id\])\)(\s*)$/gm, kind: "onDelete: Cascade" },
];

for (const svc of SERVICES) {
  const path = join(SERVICES_DIR, svc, "prisma", "schema.prisma");
  let src = readFileSync(path, "utf8");
  let changes = 0;
  for (const { match, kind } of EDITS) {
    src = src.replace(match, (_full, prefix, suffix) => {
      if (prefix.includes(kind)) return _full; // already has it
      changes++;
      return `${prefix}, ${kind})${suffix}`;
    });
  }
  writeFileSync(path, src);
  console.log(`[cascades] ${svc}: applied ${changes} edits`);
}
