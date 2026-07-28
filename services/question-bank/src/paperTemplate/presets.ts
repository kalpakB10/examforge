import { Layout } from "./types";

export interface Preset {
  name: string;
  description: string;
  layout: Layout;
}

/**
 * Presets set ONLY visual style + layout structure.
 * They never bake institution-specific text. All text comes from:
 *  - the org snapshot (school name, address, logo, exam sub-heading)
 *  - the paper config (title, date, marks, time, questions)
 *  - the teacher-provided footerText (renders via `customFooter` field)
 */

// ─── 1. Minimal ───────────────────────────────────────────────────────────────
const minimal: Preset = {
  name: "Minimal",
  description: "Clean one-line school name at the top. No logos, no boxes.",
  layout: {
    accentColor: "#333333",
    answerKeyAccentColor: "#0d9488",
    header: {
      rows: [
        { slots: [{ align: "center", fields: [{ type: "orgName", size: "lg", bold: true }] }] },
        { slots: [{ align: "center", fields: [{ type: "paperTitle", size: "md", bold: true, uppercase: true }] }], divider: true },
        {
          slots: [
            { align: "left", fields: [{ type: "text", text: "Date:" }, { type: "date" }] },
            { align: "right", fields: [{ type: "text", text: "Marks:" }, { type: "totalMarks" }] },
          ],
        },
      ],
    },
    footer: {
      rows: [
        {
          slots: [
            { align: "left", fields: [{ type: "customFooter" }] },
            { align: "right", fields: [{ type: "orgName" }] },
          ],
        },
      ],
    },
    metaRow: { show: false, fields: [] },
  },
};

// ─── 2. Classic Indian School ──────────────────────────────────────────────────
const classicIndianSchool: Preset = {
  name: "Classic Indian School",
  description: "Logo left, school details center, roll number & sign boxes right. The traditional format.",
  layout: {
    accentColor: "#1a237e",
    answerKeyAccentColor: "#0d9488",
    header: {
      rows: [
        {
          border: true,
          slots: [
            { align: "left", fields: [{ type: "orgLogo", border: true, padding: "4px 8px", bold: true, color: "#1a237e" }] },
            {
              align: "center",
              fields: [
                { type: "orgName", size: "lg", bold: true, color: "#1a237e" },
                { type: "orgAddress", size: "sm", color: "#555" },
                { type: "examTitle", size: "sm", bold: true },
              ],
            },
            {
              align: "right",
              fields: [
                { type: "setNumber" },
                { type: "signatureBox" },
                { type: "rollNumberBox" },
              ],
            },
          ],
        },
        { slots: [{ align: "center", fields: [{ type: "paperTitle", size: "md", bold: true, uppercase: true }] }] },
      ],
    },
    footer: {
      rows: [
        {
          slots: [
            { align: "left", fields: [{ type: "customFooter" }] },
            { align: "center", fields: [{ type: "date" }] },
            { align: "right", fields: [{ type: "orgName" }] },
          ],
        },
      ],
    },
    metaRow: { show: true, fields: ["date", "time", "totalMarks", "totalQuestions"] },
  },
};

// ─── 3. Board Exam ─────────────────────────────────────────────────────────────
const boardExam: Preset = {
  name: "Board Exam",
  description: "Formal exam format — no logos, official disclaimer, exam board style.",
  layout: {
    accentColor: "#111827",
    answerKeyAccentColor: "#059669",
    fontFamily: "Georgia, 'Times New Roman', serif",
    header: {
      rows: [
        {
          slots: [{ align: "center", fields: [{ type: "orgName", size: "xl", bold: true, uppercase: true }] }],
        },
        {
          slots: [{ align: "center", fields: [{ type: "examTitle", size: "md", bold: true }] }],
          divider: true,
        },
        {
          slots: [{ align: "center", fields: [{ type: "paperTitle", size: "lg", bold: true, uppercase: true }] }],
        },
        {
          slots: [
            { align: "left", fields: [{ type: "text", text: "Time Allowed:" }, { type: "time" }, { type: "text", text: "Minutes" }] },
            { align: "right", fields: [{ type: "text", text: "Maximum Marks:" }, { type: "totalMarks" }] },
          ],
          padding: "8px 0",
        },
        {
          slots: [{ align: "center", fields: [{ type: "text", text: "Read all questions carefully before answering. Do not open this paper until instructed.", italic: true, size: "sm" }] }],
        },
      ],
    },
    footer: {
      rows: [
        {
          slots: [
            { align: "left", fields: [{ type: "orgName" }] },
            { align: "center", fields: [{ type: "date" }] },
            { align: "right", fields: [{ type: "customFooter" }] },
          ],
        },
      ],
    },
    metaRow: { show: false, fields: [] },
  },
};

// ─── 4. CBSE Sample Paper ──────────────────────────────────────────────────────
const cbseSample: Preset = {
  name: "CBSE Sample Paper",
  description: "CBSE-style header: blue banner with school name, subject/class panel, time & marks side-by-side.",
  layout: {
    accentColor: "#1e40af",
    answerKeyAccentColor: "#047857",
    header: {
      rows: [
        {
          bg: "#1e40af",
          padding: "6px 12px",
          slots: [{ align: "center", fields: [{ type: "orgName", color: "#ffffff", bold: true, size: "md" }] }],
        },
        {
          slots: [
            { align: "center", fields: [{ type: "paperTitle", bold: true, size: "lg", uppercase: true }] },
          ],
        },
        {
          slots: [
            { align: "center", fields: [{ type: "examTitle", size: "md", italic: true }] },
          ],
          divider: true,
        },
        {
          padding: "6px 0",
          slots: [
            { align: "left", fields: [
              { type: "text", text: "Time:" }, { type: "time" }, { type: "text", text: "min" },
            ] },
            { align: "center", fields: [{ type: "text", text: "General Instructions Overleaf", italic: true, size: "sm", color: "#666" }] },
            { align: "right", fields: [
              { type: "text", text: "Max Marks:" }, { type: "totalMarks" },
            ] },
          ],
        },
        {
          slots: [
            { align: "left", fields: [{ type: "text", text: "Roll No:" }, { type: "text", text: "____________" }] },
            { align: "right", fields: [{ type: "text", text: "Date:" }, { type: "date" }] },
          ],
        },
      ],
    },
    footer: {
      rows: [
        {
          slots: [
            { align: "left", fields: [{ type: "customFooter" }] },
            { align: "center", fields: [{ type: "date" }] },
            { align: "right", fields: [{ type: "subjectName" }] },
          ],
        },
      ],
    },
    metaRow: { show: false, fields: [] },
  },
};

// ─── 5. Coaching Institute ─────────────────────────────────────────────────────
const coachingInstitute: Preset = {
  name: "Coaching Institute",
  description: "Big branded header with logo + tagline slot. Address & contact go in the footer text.",
  layout: {
    accentColor: "#dc2626",
    answerKeyAccentColor: "#0891b2",
    header: {
      rows: [
        {
          bg: "#fef2f2",
          border: true,
          padding: "10px 14px",
          slots: [
            {
              align: "left",
              fields: [
                { type: "orgLogo", size: "xl", border: true, padding: "6px 12px", bold: true, color: "#dc2626" },
              ],
            },
            {
              align: "center",
              fields: [
                { type: "orgName", size: "xl", bold: true, color: "#dc2626", uppercase: true },
                { type: "examTitle", size: "md", italic: true, color: "#7f1d1d" },
                { type: "orgAddress", size: "sm", color: "#666" },
              ],
            },
            {
              align: "right",
              fields: [
                { type: "rollNumberBox" },
              ],
            },
          ],
        },
        {
          bg: "#dc2626",
          padding: "4px 12px",
          slots: [
            { align: "left", fields: [{ type: "paperTitle", bold: true, uppercase: true, color: "#ffffff" }] },
            { align: "right", fields: [{ type: "setNumber", color: "#ffffff" }] },
          ],
        },
      ],
    },
    footer: {
      rows: [
        {
          slots: [
            { align: "left", fields: [{ type: "orgAddress", color: "#7f1d1d" }] },
            { align: "center", fields: [{ type: "customFooter", color: "#7f1d1d" }] },
            { align: "right", fields: [{ type: "orgName" }] },
          ],
        },
      ],
    },
    metaRow: { show: true, fields: ["date", "time", "totalMarks"] },
  },
};

// ─── 6. Custom Blank ───────────────────────────────────────────────────────────
const customBlank: Preset = {
  name: "Custom Blank",
  description: "Starts empty — build your own header and footer from scratch.",
  layout: {
    accentColor: "#4b5563",
    answerKeyAccentColor: "#0d9488",
    header: {
      rows: [
        { slots: [{ align: "center", fields: [{ type: "orgName", size: "lg", bold: true }] }] },
        { slots: [{ align: "center", fields: [{ type: "paperTitle", size: "md", uppercase: true }] }], divider: true },
      ],
    },
    footer: {
      rows: [
        {
          slots: [
            { align: "left", fields: [{ type: "customFooter" }] },
            { align: "right", fields: [{ type: "orgName" }] },
          ],
        },
      ],
    },
    metaRow: { show: true, fields: ["date", "time", "totalMarks", "totalQuestions"] },
  },
};

export const PRESETS: Preset[] = [
  minimal,
  classicIndianSchool,
  boardExam,
  cbseSample,
  coachingInstitute,
  customBlank,
];
