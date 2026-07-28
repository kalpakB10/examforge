/**
 * Board-style exam presets — one-click templates that pre-fill the whole
 * composition with a real Indian-board section structure. Teachers can pick
 * one at Step 2, then tweak in Step 3.
 *
 * Every preset is one PAPER with multiple SECTIONS of different types.
 * (A "CBSE 10 Standard" is a single exam that has MCQ + Fill-Blank +
 * Short-Answer + Long-Answer all together.)
 *
 * Presets DON'T carry chapter scope — teacher picks scope per section in
 * step 3 because that depends on which chapters they've uploaded questions
 * for. Presets only define STRUCTURE (type mix, marks distribution).
 */

import type { Section } from './types';
import { newSection } from './types';

export interface Preset {
  id: string;
  name: string;
  description: string;
  tag: 'CBSE' | 'STATE' | 'COACHING' | 'CUSTOM';
  durationMinutes: number;
  buildSections: () => Section[];
  totalMarks: number;
  sectionCount: number;
}

/** Utility: build a section with a given shape but the standard defaults. */
function section(over: Partial<Section>): Section {
  return newSection(over);
}

// ─── CBSE Class 10 Standard ─────────────────────────────────────────────────
// Real CBSE X paper structure: 5 sections, ~80 marks, 3 hours.
// Based on the 2023-24 CBSE sample paper format.
function cbse10Sections(): Section[] {
  return [
    section({ title: 'Section A', type: 'MCQ',
              numQuestions: 20, marksPerQuestion: 1 }),
    section({ title: 'Section B', type: 'SUBJECTIVE', subType: 'ONE_WORD',
              numQuestions: 5,  marksPerQuestion: 2,
              instructions: 'Very short answer questions. Answer in one word or one sentence.' }),
    section({ title: 'Section C', type: 'SUBJECTIVE', subType: 'SHORT_ANSWER',
              numQuestions: 6,  marksPerQuestion: 3, attemptAny: 4,
              instructions: 'Attempt any 4 of the following 6. Answer in about 40-50 words.' }),
    section({ title: 'Section D', type: 'SUBJECTIVE', subType: 'LONG_ANSWER',
              numQuestions: 4,  marksPerQuestion: 5, attemptAny: 3,
              instructions: 'Attempt any 3 of the following 4. Answer in about 80-100 words.' }),
    section({ title: 'Section E', type: 'SUBJECTIVE', subType: 'LONG_ANSWER',
              numQuestions: 2,  marksPerQuestion: 4, attemptAny: 1,
              instructions: 'Case-study based. Attempt any 1.' }),
  ];
}

// ─── CBSE Class 12 Standard ─────────────────────────────────────────────────
function cbse12Sections(): Section[] {
  return [
    section({ title: 'Section A', type: 'MCQ',
              numQuestions: 18, marksPerQuestion: 1 }),
    section({ title: 'Section B', type: 'SUBJECTIVE', subType: 'ONE_WORD',
              numQuestions: 7,  marksPerQuestion: 2,
              instructions: 'Very short answer questions.' }),
    section({ title: 'Section C', type: 'SUBJECTIVE', subType: 'SHORT_ANSWER',
              numQuestions: 5,  marksPerQuestion: 3, attemptAny: 3,
              instructions: 'Attempt any 3 of the following 5.' }),
    section({ title: 'Section D', type: 'SUBJECTIVE', subType: 'LONG_ANSWER',
              numQuestions: 3,  marksPerQuestion: 5, attemptAny: 2,
              instructions: 'Attempt any 2 of the following 3.' }),
    section({ title: 'Section E', type: 'SUBJECTIVE', subType: 'LONG_ANSWER',
              numQuestions: 2,  marksPerQuestion: 6, attemptAny: 1,
              instructions: 'Case-study / passage-based. Attempt any 1.' }),
  ];
}

// ─── State Board Unit Test (smaller, 25 marks, 60 min) ──────────────────────
function stateBoardUnitTestSections(): Section[] {
  return [
    section({ title: 'Section A', type: 'MCQ',
              numQuestions: 5, marksPerQuestion: 1 }),
    section({ title: 'Section B', type: 'SUBJECTIVE', subType: 'FILL_BLANK',
              numQuestions: 5, marksPerQuestion: 1,
              instructions: 'Fill in the blanks with the correct word/phrase.' }),
    section({ title: 'Section C', type: 'SUBJECTIVE', subType: 'SHORT_ANSWER',
              numQuestions: 3, marksPerQuestion: 3,
              instructions: 'Answer in 2-3 sentences.' }),
    section({ title: 'Section D', type: 'SUBJECTIVE', subType: 'LONG_ANSWER',
              numQuestions: 1, marksPerQuestion: 6 }),
  ];
}

// ─── Coaching Full MCQ (JEE/NEET/CET style, all MCQ, 100 marks) ──────────────
function coachingFullMcqSections(): Section[] {
  return [
    section({ title: 'Section A', type: 'MCQ',
              numQuestions: 100, marksPerQuestion: 1,
              instructions: '+1 for correct, -0.25 for wrong. Skipped = 0.' }),
  ];
}

// ─── Custom Blank ────────────────────────────────────────────────────────────
function customBlankSections(): Section[] {
  return [
    section({ title: 'Section A', type: 'MCQ', numQuestions: 10, marksPerQuestion: 1 }),
  ];
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function sumMarks(sections: Section[]): number {
  return sections.reduce((total, s) => {
    const effective = s.attemptAny && s.attemptAny < s.numQuestions ? s.attemptAny : s.numQuestions;
    return total + effective * s.marksPerQuestion;
  }, 0);
}

// Public preset list — used by the wizard's Step 2 picker.
export const PRESETS: Preset[] = [
  {
    id: 'cbse-10',
    name: 'CBSE Class 10 Standard',
    description: 'MCQ + short + long + case-study — matches CBSE X board format (~80 marks).',
    tag: 'CBSE',
    durationMinutes: 180,
    buildSections: cbse10Sections,
    totalMarks: sumMarks(cbse10Sections()),
    sectionCount: 5,
  },
  {
    id: 'cbse-12',
    name: 'CBSE Class 12 Standard',
    description: 'MCQ + very-short + short + long + case-study — CBSE XII format (~80 marks).',
    tag: 'CBSE',
    durationMinutes: 180,
    buildSections: cbse12Sections,
    totalMarks: sumMarks(cbse12Sections()),
    sectionCount: 5,
  },
  {
    id: 'state-unit',
    name: 'State Board Unit Test',
    description: 'MCQ + fill-blanks + short + long — quick 25-mark unit test.',
    tag: 'STATE',
    durationMinutes: 60,
    buildSections: stateBoardUnitTestSections,
    totalMarks: sumMarks(stateBoardUnitTestSections()),
    sectionCount: 4,
  },
  {
    id: 'coaching-mcq',
    name: 'Coaching Full MCQ',
    description: 'Pure MCQ practice test — JEE/NEET/CET style. Negative marking recommended.',
    tag: 'COACHING',
    durationMinutes: 90,
    buildSections: coachingFullMcqSections,
    totalMarks: sumMarks(coachingFullMcqSections()),
    sectionCount: 1,
  },
  {
    id: 'custom',
    name: 'Custom / Blank',
    description: 'Start with one MCQ section — add / edit / remove any way you like.',
    tag: 'CUSTOM',
    durationMinutes: 60,
    buildSections: customBlankSections,
    totalMarks: sumMarks(customBlankSections()),
    sectionCount: 1,
  },
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
