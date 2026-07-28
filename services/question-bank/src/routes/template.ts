import { FastifyInstance, FastifyPluginOptions } from "fastify";
import * as XLSX from "xlsx";

export async function templateRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /questions/excel-template — download blank Excel template
  // Supports both MCQ and all four subjective sub-types (fill-blank, one-word,
  // short-answer, long-answer). The sub_type column is IGNORED for MCQ rows.
  app.get("/excel-template", async (_req, reply) => {
    const headers = [
      "text",
      "sub_type",        // for subjective only: FILL_BLANK / ONE_WORD / SHORT_ANSWER / LONG_ANSWER
      "expected_answer", // subjective only: teacher reference for the answer key
      "option_a",
      "option_b",
      "option_c",
      "option_d",
      "correct_option",
      "difficulty",
      "tags",
      "year_tag",
      "marks_weight",
    ];

    const mcqExample = [
      "Which planet is known as the Red Planet?",
      "", "",                     // sub_type + expected_answer irrelevant for MCQ
      "Earth", "Mars", "Jupiter", "Saturn",
      "B",
      "EASY", "science;planets", "2019-20", "1",
    ];

    const fillBlankExample = [
      "The chemical symbol for gold is ___.",
      "FILL_BLANK", "Au",
      "", "", "", "", "",
      "EASY", "chemistry", "", "1",
    ];

    const oneWordExample = [
      "Name the largest planet in our solar system.",
      "ONE_WORD", "Jupiter",
      "", "", "", "", "",
      "EASY", "science;planets", "", "1",
    ];

    const shortAnswerExample = [
      "Explain Newton's third law with an example.",
      "SHORT_ANSWER", "For every action there is an equal and opposite reaction. Example: recoil of a gun.",
      "", "", "", "", "",
      "MEDIUM", "physics;laws", "2020-21", "3",
    ];

    const longAnswerExample = [
      "Describe the process of photosynthesis in detail, including the light-dependent and light-independent reactions.",
      "LONG_ANSWER", "Photosynthesis is the process by which green plants convert sunlight, water, and CO2 into glucose and oxygen. It occurs in two stages: (i) light-dependent reactions in the thylakoids... (ii) Calvin cycle in the stroma...",
      "", "", "", "", "",
      "HARD", "biology;plants", "", "5",
    ];

    const noteRow = [
      "// MCQ: fill all 4 options + correct_option (A/B/C/D). Subjective: fill sub_type + expected_answer.",
    ];
    const noteRow2 = [
      "// sub_type accepts: FILL_BLANK, ONE_WORD, SHORT_ANSWER, LONG_ANSWER (case-insensitive; aliases like 'fill', 'one-word', 'essay' also work).",
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      headers,
      mcqExample,
      fillBlankExample,
      oneWordExample,
      shortAnswerExample,
      longAnswerExample,
      [],
      noteRow,
      noteRow2,
    ]);

    // Column widths
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 4, 18) }));

    XLSX.utils.book_append_sheet(wb, ws, "Questions");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", "attachment; filename=question_upload_template.xlsx")
      .send(buf);
  });
}
