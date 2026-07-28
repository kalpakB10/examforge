import { FastifyInstance, FastifyPluginOptions } from "fastify";
import * as XLSX from "xlsx";

export async function templateRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /questions/excel-template — download blank Excel template
  app.get("/excel-template", async (_req, reply) => {
    const headers = [
      "text",
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
      "Earth",
      "Mars",
      "Jupiter",
      "Saturn",
      "B",
      "EASY",
      "science;planets",
      "2019-20",
      "1",
    ];

    const subjectiveExample = [
      "Explain Newton's third law with an example.",
      "", "", "", "",   // no options → auto-detected as SUBJECTIVE
      "",               // no correct_option
      "MEDIUM",
      "physics;laws",
      "2020-21",
      "5",
    ];

    const noteRow = [
      "// Leave option_a..option_d + correct_option EMPTY for subjective questions. MCQ needs all 4 options + correct_option.",
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, mcqExample, subjectiveExample, [], noteRow]);

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
