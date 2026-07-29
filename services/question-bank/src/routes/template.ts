import { FastifyInstance, FastifyPluginOptions } from "fastify";
import * as XLSX from "xlsx";

/**
 * Excel template downloads.
 *
 * GET /questions/excel-template               → the combined (mixed) template (legacy)
 * GET /questions/excel-template?flavor=mcq    → MCQ-only template
 * GET /questions/excel-template?flavor=subjective → Subjective-only template
 *
 * Split templates make the columns unambiguous: teachers picking MCQ never
 * see the sub_type column, and vice versa. The combined template is kept
 * as an escape hatch for advanced users doing mixed uploads.
 */

const MCQ_HEADERS = [
  "text",
  "option_a", "option_b", "option_c", "option_d",
  "correct_option",
  "difficulty",
  "tags",
  "year_tag",
  "marks_weight",
];

const SUBJECTIVE_HEADERS = [
  "text",
  "sub_type",
  "expected_answer",
  "difficulty",
  "marks_weight",
  "tags",
  "year_tag",
];

const COMBINED_HEADERS = [
  "text",
  "sub_type",
  "expected_answer",
  "option_a", "option_b", "option_c", "option_d",
  "correct_option",
  "difficulty",
  "tags",
  "year_tag",
  "marks_weight",
];

function xlsxResponse(reply: any, sheetName: string, rows: any[][], filename: string) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Column widths tuned to the header text length so the file opens legibly.
  ws["!cols"] = (rows[0] as any[]).map((h: any) => ({ wch: Math.max(String(h).length + 4, 18) }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  reply
    .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .header("Content-Disposition", `attachment; filename=${filename}`)
    .send(buf);
}

export async function templateRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.get("/excel-template", async (req, reply) => {
    const flavor = (req.query as { flavor?: string })?.flavor?.toLowerCase();

    if (flavor === "mcq") {
      const rows: any[][] = [
        MCQ_HEADERS,
        ["Which planet is known as the Red Planet?", "Earth", "Mars", "Jupiter", "Saturn", "B", "EASY", "science;planets", "2019-20", "1"],
        ["What is the SI unit of force?", "Newton", "Joule", "Watt", "Pascal", "A", "EASY", "physics;units", "", "1"],
        ["Which number is prime?", "9", "15", "17", "21", "C", "MEDIUM", "math;primes", "", "1"],
        [],
        ["// Every row must have all 4 options + a correct_option (A/B/C/D)."],
        ["// difficulty accepts EASY / MEDIUM / HARD (default MEDIUM)."],
        ["// tags are semicolon-separated. year_tag + marks_weight are optional."],
      ];
      return xlsxResponse(reply, "MCQ Questions", rows, "mcq_question_template.xlsx");
    }

    if (flavor === "subjective") {
      const rows: any[][] = [
        SUBJECTIVE_HEADERS,
        ["The chemical symbol for gold is ___.", "FILL_BLANK", "Au", "EASY", "1", "chemistry", ""],
        ["Name the largest planet in our solar system.", "ONE_WORD", "Jupiter", "EASY", "1", "science;planets", ""],
        ["Explain Newton's third law with an example.", "SHORT_ANSWER", "For every action there is an equal and opposite reaction. Example: recoil of a gun.", "MEDIUM", "3", "physics;laws", "2020-21"],
        ["Describe the process of photosynthesis in detail.", "LONG_ANSWER", "", "HARD", "5", "biology;plants", ""],
        [],
        ["// sub_type is REQUIRED: FILL_BLANK | ONE_WORD | SHORT_ANSWER | LONG_ANSWER"],
        ["// Aliases also work: fill, one-word, short, long, essay (case-insensitive)."],
        ["// expected_answer is recommended for FILL_BLANK + ONE_WORD (goes into the answer key)."],
        ["// For SHORT_ANSWER + LONG_ANSWER, expected_answer is optional — leave blank if the teacher"],
        ["//   will grade manually. The answer key will still print with a marks-only placeholder."],
      ];
      return xlsxResponse(reply, "Subjective Questions", rows, "subjective_question_template.xlsx");
    }

    // Legacy combined template
    const rows: any[][] = [
      COMBINED_HEADERS,
      ["Which planet is known as the Red Planet?", "", "",  "Earth", "Mars", "Jupiter", "Saturn", "B", "EASY", "science;planets", "2019-20", "1"],
      ["The chemical symbol for gold is ___.", "FILL_BLANK", "Au",  "", "", "", "", "", "EASY", "chemistry", "", "1"],
      ["Name the largest planet in our solar system.", "ONE_WORD", "Jupiter",  "", "", "", "", "", "EASY", "science;planets", "", "1"],
      ["Explain Newton's third law with an example.", "SHORT_ANSWER", "For every action there is an equal and opposite reaction.",  "", "", "", "", "", "MEDIUM", "physics;laws", "2020-21", "3"],
      ["Describe photosynthesis in detail.", "LONG_ANSWER", "",  "", "", "", "", "", "HARD", "biology;plants", "", "5"],
      [],
      ["// MCQ rows: fill option_a..d + correct_option. Leave sub_type + expected_answer empty."],
      ["// Subjective rows: fill sub_type (FILL_BLANK / ONE_WORD / SHORT_ANSWER / LONG_ANSWER). Options + correct_option empty."],
      ["// expected_answer is required for FILL_BLANK / ONE_WORD; optional for SHORT/LONG."],
    ];
    return xlsxResponse(reply, "Questions", rows, "question_upload_template.xlsx");
  });
}
