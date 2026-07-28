import { describe, expect, it } from "vitest";
import { renderSection, renderMetaRow, RenderContext, pickAccent } from "./renderer";
import { Layout, Section } from "./types";

const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({
  orgName: "Test School",
  paperTitle: "Question Paper",
  date: "2026-07-28",
  totalTime: 60,
  totalMarks: 50,
  totalQuestions: 25,
  ...over,
});

describe("renderSection", () => {
  it("returns empty string when section is undefined or has no rows", () => {
    expect(renderSection(undefined, ctx(), "header", "#000")).toBe("");
    expect(renderSection({ rows: [] } as Section, ctx(), "header", "#000")).toBe("");
  });

  it("escapes HTML in text values (XSS-safe)", () => {
    const section: Section = {
      rows: [{ slots: [{ align: "left", fields: [{ type: "orgName" }] }] }],
    };
    const html = renderSection(section, ctx({ orgName: "<script>alert('x')</script>" }), "header", "#000");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&#39;");
  });

  it("suppresses pageNumber field (returns empty, no wrapper)", () => {
    const section: Section = {
      rows: [{ slots: [{ align: "center", fields: [{ type: "pageNumber" }] }] }],
    };
    const html = renderSection(section, ctx(), "footer", "#000");
    // pageNumber renders empty and the slot has no content
    expect(html).not.toMatch(/pageNumber/i);
    expect(html).not.toContain("Page");
  });

  it("renders customFooter with the provided teacher text", () => {
    const section: Section = {
      rows: [{ slots: [{ align: "left", fields: [{ type: "customFooter" }] }] }],
    };
    const html = renderSection(section, ctx({ footerText: "Best of luck!" }), "footer", "#000");
    expect(html).toContain("Best of luck!");
  });

  it("footer wrapper uses top-border styling; header does not", () => {
    const section: Section = {
      rows: [{ slots: [{ align: "left", fields: [{ type: "orgName" }] }] }],
    };
    const footerHtml = renderSection(section, ctx(), "footer", "#000");
    const headerHtml = renderSection(section, ctx(), "header", "#000");
    expect(footerHtml).toContain("border-top");
    expect(headerHtml).toContain("margin-bottom");
    expect(headerHtml).not.toContain("border-top");
  });

  it("respects slot alignment classes", () => {
    const section: Section = {
      rows: [
        {
          slots: [
            { align: "left", fields: [{ type: "orgName" }] },
            { align: "right", fields: [{ type: "date" }] },
          ],
        },
      ],
    };
    const html = renderSection(section, ctx(), "header", "#000");
    expect(html).toContain("pt-align-left");
    expect(html).toContain("pt-align-right");
  });
});

describe("renderMetaRow", () => {
  const layout = (fields: Array<"date" | "time" | "totalMarks" | "totalQuestions">, show = true): Layout => ({
    accentColor: "#000",
    header: { rows: [] },
    metaRow: { show, fields },
  });

  it("returns empty when show=false", () => {
    expect(renderMetaRow(layout(["date"], false), ctx())).toBe("");
  });

  it("returns empty when no fields", () => {
    expect(renderMetaRow(layout([], true), ctx())).toBe("");
  });

  it("renders each requested field with its label", () => {
    const html = renderMetaRow(layout(["date", "time", "totalMarks", "totalQuestions"]), ctx());
    expect(html).toContain("Date:");
    expect(html).toContain("2026-07-28");
    expect(html).toContain("Time:");
    expect(html).toContain("60 Min");
    expect(html).toContain("Marks:");
    expect(html).toContain("50");
    expect(html).toContain("Questions:");
    expect(html).toContain("25");
  });
});

describe("pickAccent", () => {
  const layout: Layout = {
    accentColor: "#111111",
    answerKeyAccentColor: "#222222",
    header: { rows: [] },
  };

  it("uses accentColor for question papers", () => {
    expect(pickAccent(layout, false)).toBe("#111111");
  });

  it("uses answerKeyAccentColor for answer keys when set", () => {
    expect(pickAccent(layout, true)).toBe("#222222");
  });

  it("falls back to accentColor when answerKeyAccentColor is missing", () => {
    const l: Layout = { ...layout, answerKeyAccentColor: undefined };
    expect(pickAccent(l, true)).toBe("#111111");
  });

  it("defaults to indigo when neither is set", () => {
    const l = { header: { rows: [] } } as Layout;
    expect(pickAccent(l, false)).toBe("#1a237e");
  });
});
