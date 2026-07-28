#!/usr/bin/env node
/**
 * F.1 — Add SubjectiveSubType enum + optional `subType` column on Question,
 * plus optional `expectedAnswer` text column (teacher-side reference for
 * fill-in-blank / one-word answers, used by the answer key renderer).
 *
 * Applies identically to all six per-service Prisma schemas. Idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICES = ["api-gateway", "question-bank", "exam-generator", "exam-session", "result-engine", "dispute-manager"];

const ENUM_BLOCK = `enum SubjectiveSubType {
  FILL_BLANK
  ONE_WORD
  SHORT_ANSWER
  LONG_ANSWER
}

`;

// Insert enum right after the QuestionType enum block.
const ENUM_ANCHOR = `enum QuestionType {
  MCQ
  SUBJECTIVE
}

`;

// Add subType + expectedAnswer to the Question model.
const FIELD_ANCHOR = `  type               QuestionType  @default(MCQ)`;
const FIELD_ADDITION = `  type               QuestionType  @default(MCQ)
  subType            SubjectiveSubType? @map("sub_type")
  expectedAnswer     String?         @map("expected_answer")`;

for (const svc of SERVICES) {
  const path = join(__dirname, "..", "services", svc, "prisma", "schema.prisma");
  let src = readFileSync(path, "utf8");

  if (src.includes("enum SubjectiveSubType")) {
    console.log(`[subtype] ${svc}: enum already present, skipping`);
    continue;
  }
  if (!src.includes(ENUM_ANCHOR)) {
    console.error(`[subtype] ${svc}: QuestionType enum anchor not found`);
    process.exit(1);
  }
  if (!src.includes(FIELD_ANCHOR)) {
    console.error(`[subtype] ${svc}: Question.type field anchor not found`);
    process.exit(1);
  }

  src = src.replace(ENUM_ANCHOR, ENUM_ANCHOR + ENUM_BLOCK);
  src = src.replace(FIELD_ANCHOR, FIELD_ADDITION);

  writeFileSync(path, src);
  console.log(`[subtype] ${svc}: added`);
}
