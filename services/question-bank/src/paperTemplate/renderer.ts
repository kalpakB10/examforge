import { Field, Layout, Row, Section, Slot } from "./types";

// Runtime values a template can reference
export interface RenderContext {
  orgName: string;
  orgAddress?: string;
  orgLogoText?: string;
  examTitle?: string;
  paperTitle: string;                 // "Question Paper" or "Answer Key"
  date: string;
  totalTime: number;
  totalMarks: number;
  totalQuestions: number;
  setNumber?: string;
  chapterLabel?: string;
  subjectLabel?: string;
  footerText?: string;                // teacher-editable footer text
  isAnswerKey?: boolean;
}

const SIZE_MAP: Record<string, string> = {
  sm: "10.5px",
  md: "13px",
  lg: "18px",
  xl: "22px",
};

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function fieldValue(field: Field, ctx: RenderContext): string {
  switch (field.type) {
    case "text":            return field.text ? esc(field.text) : "";
    case "orgName":         return esc(ctx.orgName || "");
    case "orgAddress":      return ctx.orgAddress ? esc(ctx.orgAddress).replace(/\n/g, "<br>") : "";
    case "orgLogo":         return esc(ctx.orgLogoText || "");
    case "examTitle":       return esc(ctx.examTitle || "");
    case "paperTitle":      return esc(ctx.paperTitle);
    case "date":            return esc(ctx.date || "___________");
    case "time":            return String(ctx.totalTime);
    case "totalMarks":      return String(ctx.totalMarks);
    case "totalQuestions":  return String(ctx.totalQuestions);
    case "setNumber":       return ctx.setNumber ? `<span style="background:#1a237e;color:#fff;padding:2px 10px;border-radius:3px;font-weight:bold;">Set – ${esc(ctx.setNumber)}</span>` : "";
    case "rollNumberBox":   return `<span style="border:1px solid #999;padding:4px 10px;font-size:10.5px;display:inline-block;line-height:1.7;">Roll No: ___________<br>Name: ___________</span>`;
    case "signatureBox":    return `<span style="border:1px solid #000;padding:4px 12px;font-size:10px;display:inline-block;text-align:center;min-width:110px;">Teacher Sign:<br><br></span>`;
    // Puppeteer's footerTemplate substitution doesn't work reliably with our custom footer HTML,
    // so we render the footer in the body. This means pageNumber can't be a real per-page number.
    // Suppress it entirely (returning empty string will make renderField skip the field, and
    // any adjacent "Page " text will also be hidden by the field's empty-value check).
    case "pageNumber":      return "";
    case "chapterName":     return esc(ctx.chapterLabel || "");
    case "subjectName":     return esc(ctx.subjectLabel || "");
    case "timestamp":       return new Date().toLocaleString();
    case "customFooter":    return ctx.footerText ? esc(ctx.footerText) : "";
    case "instructionsBlock": return "";
    default:                return "";
  }
}

function renderField(field: Field, ctx: RenderContext): string {
  const value = fieldValue(field, ctx);
  if (!value) return "";
  const styles: string[] = [];
  if (field.size) styles.push(`font-size:${SIZE_MAP[field.size]}`);
  if (field.bold) styles.push("font-weight:bold");
  if (field.italic) styles.push("font-style:italic");
  if (field.color) styles.push(`color:${field.color}`);
  if (field.bg) styles.push(`background:${field.bg}`);
  if (field.border) styles.push("border:1px solid currentColor;border-radius:3px");
  if (field.padding) styles.push(`padding:${field.padding}`);
  if (field.uppercase) styles.push("text-transform:uppercase;letter-spacing:0.5px");
  const style = styles.length > 0 ? ` style="${styles.join(";")}"` : "";
  return `<span class="pt-field"${style}>${value}</span>`;
}

function renderSlot(slot: Slot, ctx: RenderContext): string {
  const gap = slot.gap ?? "4px";
  const rendered = slot.fields.map((f) => renderField(f, ctx)).filter(Boolean);
  if (rendered.length === 0) return `<div class="pt-slot pt-align-${slot.align}" style="text-align:${slot.align};"></div>`;

  // Heuristic: fields that are logically part of one line (labels + values, boxed things)
  // should render inline with a space between them. Multi-line stackable fields (orgName,
  // orgAddress, examTitle, paperTitle) should stack vertically.
  //
  // We treat these types as "block" (stack vertically); everything else is inline within a line.
  const BLOCK_TYPES = new Set([
    "orgName", "orgAddress", "examTitle", "paperTitle",
    "signatureBox", "rollNumberBox", "instructionsBlock",
  ]);

  // Group consecutive inline fields into a single line; block fields become their own line.
  const lines: string[] = [];
  let currentInline: string[] = [];
  const flushInline = () => {
    if (currentInline.length > 0) {
      lines.push(`<div>${currentInline.join(" ")}</div>`);
      currentInline = [];
    }
  };
  slot.fields.forEach((f, i) => {
    const html = rendered[i];
    if (!html) return;
    if (BLOCK_TYPES.has(f.type)) {
      flushInline();
      lines.push(`<div>${html}</div>`);
    } else {
      currentInline.push(html);
    }
  });
  flushInline();

  return `<div class="pt-slot pt-align-${slot.align}" style="display:flex;flex-direction:column;gap:${gap};text-align:${slot.align};">${lines.join("")}</div>`;
}

function renderRow(row: Row, ctx: RenderContext): string {
  const styles: string[] = ["display:flex", "align-items:flex-start", "gap:12px", "justify-content:space-between"];
  if (row.bg) styles.push(`background:${row.bg}`);
  if (row.padding) styles.push(`padding:${row.padding}`);
  if (row.border) styles.push("border:2px solid currentColor;border-radius:4px;padding:8px 12px");
  const slots = row.slots.map((s) => renderSlot(s, ctx)).join("");
  const dividerHtml = row.divider ? `<div class="pt-divider" style="border-top:1.5px solid currentColor;margin:6px 0;"></div>` : "";
  return `<div class="pt-row" style="${styles.join(";")}">${slots}</div>${dividerHtml}`;
}

export function renderSection(section: Section | undefined, ctx: RenderContext, kind: "header" | "footer", accentColor: string): string {
  if (!section || section.rows.length === 0) return "";
  const rows = section.rows.map((r) => renderRow(r, ctx)).join("");
  // Footers get a compact wrapper with a subtle top border and tighter text
  const footerAttrs = kind === "footer"
    ? `color:${accentColor};margin-top:16px;padding-top:4px;border-top:1px solid #e5e7eb;font-size:10.5px;line-height:1.3;`
    : `color:${accentColor};margin-bottom:10px;`;
  return `<div class="pt-${kind}" style="${footerAttrs}">${rows}</div>`;
}


export function renderMetaRow(layout: Layout, ctx: RenderContext): string {
  if (!layout.metaRow?.show) return "";
  const items: string[] = [];
  for (const f of layout.metaRow.fields) {
    if (f === "date") items.push(`<span><strong>Date:</strong> ${esc(ctx.date)}</span>`);
    if (f === "time") items.push(`<span><strong>Time:</strong> ${ctx.totalTime} Min</span>`);
    if (f === "totalMarks") items.push(`<span><strong>Marks:</strong> ${ctx.totalMarks}</span>`);
    if (f === "totalQuestions") items.push(`<span><strong>Questions:</strong> ${ctx.totalQuestions}</span>`);
  }
  if (items.length === 0) return "";
  return `<div class="pt-meta-row" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:11.5px;border-top:1px solid #d1d5db;border-bottom:1px solid #d1d5db;padding:4px 0;margin:6px 0 8px;">${items.join("")}</div>`;
}

export function templateBaseCss(layout: Layout, accentColor: string): string {
  const fontFamily = layout.fontFamily ?? "Arial, Helvetica, sans-serif";
  const fontSize = layout.fontSize ?? "13px";
  const m = layout.margins ?? {};
  const top = m.top ?? "16mm", bottom = m.bottom ?? "14mm", left = m.left ?? "18mm", right = m.right ?? "18mm";
  return `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: ${fontFamily}; font-size: ${fontSize}; color: #000; background: #fff; }
.page { padding: ${top} ${right} ${bottom} ${left}; }
.pt-field { display: inline-block; }
.pt-slot { flex: 1; min-width: 0; }
.pt-align-left { text-align: left; align-items: flex-start; }
.pt-align-center { text-align: center; align-items: center; }
.pt-align-right { text-align: right; align-items: flex-end; }

/* accent-colored section banner for question sections */
.paper-section-header { display: flex; justify-content: space-between; align-items: center;
  background: ${accentColor}; color: #fff; padding: 6px 12px; margin: 14px 0 8px;
  border-radius: 3px; font-size: 12.5px; font-weight: bold; }
.ps-label { font-size: 13px; }
.ps-type { flex: 1; text-align: center; font-size: 11px; letter-spacing: 0.5px; opacity: 0.9; }
.ps-meta { font-size: 11px; font-weight: normal; }

.instructions { font-size: 11px; background: #f8f8f8; border-left: 3px solid ${accentColor}; padding: 6px 10px; margin-bottom: 10px; }
.instructions ul { list-style: none; padding: 0; margin-top: 4px; }
.instructions li { margin-bottom: 2px; }

.question { margin-bottom: 13px; page-break-inside: avoid; }
.q-num { font-weight: bold; }
.q-text { font-weight: 500; line-height: 1.45; margin-bottom: 4px; }
.q-marks { float: right; font-size: 11px; color: #555; font-weight: bold; }
.year-tag { font-size: 10px; color: #777; font-style: italic; }
.opts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 20px; padding-left: 18px; }
.opt { line-height: 1.6; font-size: 12.5px; }
.opt-sym { font-size: 13px; }
.subj-answer-space { margin-top: 6px; padding-left: 4px; }
.subj-line { border-bottom: 1px solid #999; height: 22px; margin-bottom: 2px; }

/* answer key grid */
.ak-table { border-collapse: collapse; width: 100%; margin-top: 8px; }
.ak-table td { border: 1px solid #000; text-align: center; padding: 5px 6px; font-size: 12px; }
.ak-table .lbl { font-weight: bold; background: rgba(0,0,0,0.05); text-align: left; padding-left: 8px; }
.ak-table .ans-cell { font-weight: bold; font-size: 14px; }
.ak-spacer { height: 6px; }
.ak-section { margin-bottom: 14px; }
.ak-section-title { font-size: 12px; font-weight: bold; background: ${accentColor}; color: #fff; padding: 3px 10px; margin-bottom: 6px; border-radius: 2px; }
`;
}

export function pickAccent(layout: Layout, isAnswerKey: boolean): string {
  const key = isAnswerKey ? (layout.answerKeyAccentColor || layout.accentColor) : layout.accentColor;
  return key || "#1a237e";
}
