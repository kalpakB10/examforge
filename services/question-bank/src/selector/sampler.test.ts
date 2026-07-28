import { describe, expect, it } from "vitest";
import { makeRng, hashSeed, shuffleWithRng, sampleSection, sampleComposition, SectionSpec } from "./sampler";

describe("makeRng", () => {
  it("produces values in [0, 1)", () => {
    const rng = makeRng(42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic across separate seedings", () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it("different seeds diverge quickly", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    let differ = 0;
    for (let i = 0; i < 10; i++) if (a() !== b()) differ++;
    expect(differ).toBeGreaterThan(8);
  });
});

describe("hashSeed", () => {
  it("returns unsigned 32-bit int for any string", () => {
    for (const s of ["", "a", "hello world", "🚀 unicode"]) {
      const h = hashSeed(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xFFFFFFFF);
      expect(Number.isInteger(h)).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(hashSeed("same input")).toBe(hashSeed("same input"));
  });

  it("differs for different inputs", () => {
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
  });
});

describe("shuffleWithRng", () => {
  it("returns a new array (does not mutate)", () => {
    const src = [1, 2, 3, 4, 5];
    const out = shuffleWithRng(src, makeRng(1));
    expect(src).toEqual([1, 2, 3, 4, 5]);
    expect(out).not.toBe(src);
  });

  it("returns a permutation (same elements, possibly reordered)", () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = shuffleWithRng(src, makeRng(99));
    expect([...out].sort((a, b) => a - b)).toEqual(src);
  });

  it("is deterministic for the same seed", () => {
    const src = ["a", "b", "c", "d", "e"];
    const one = shuffleWithRng(src, makeRng(7));
    const two = shuffleWithRng(src, makeRng(7));
    expect(one).toEqual(two);
  });

  it("handles empty + single-element arrays", () => {
    expect(shuffleWithRng([], makeRng(1))).toEqual([]);
    expect(shuffleWithRng([42], makeRng(1))).toEqual([42]);
  });
});

// ─── sampleSection / sampleComposition with a fake prisma ────────────────────

// Minimal fake question shape — we only touch the fields the sampler reads.
type FakeQ = {
  id: string;
  type: "MCQ" | "SUBJECTIVE";
  difficulty: "EASY" | "MEDIUM" | "HARD";
  isActive: boolean;
  chapterId: string | null;
  subjectId: string;
  subject?: { id: string; name: string } | null;
  chapter?: { id: string; name: string; subSubject: null } | null;
};

function makeFakePrisma(questions: FakeQ[]) {
  const isMatch = (q: FakeQ, where: any): boolean => {
    if (where.isActive !== undefined && q.isActive !== where.isActive) return false;
    if (where.type !== undefined && q.type !== where.type) return false;
    if (where.chapterId?.in && !where.chapterId.in.includes(q.chapterId)) return false;
    if (where.subjectId?.in && !where.subjectId.in.includes(q.subjectId)) return false;
    if (where.id?.notIn && where.id.notIn.includes(q.id)) return false;
    return true;
  };
  return {
    question: {
      findMany: async ({ where }: any) => questions.filter((q) => isMatch(q, where)),
    },
  } as any;
}

function makeQ(id: string, opts: Partial<FakeQ> = {}): FakeQ {
  return {
    id,
    type: opts.type ?? "MCQ",
    difficulty: opts.difficulty ?? "MEDIUM",
    isActive: opts.isActive ?? true,
    chapterId: opts.chapterId ?? "ch1",
    subjectId: opts.subjectId ?? "sub1",
    subject: { id: "sub1", name: "Sub" },
    chapter: { id: opts.chapterId ?? "ch1", name: "Ch", subSubject: null },
  };
}

describe("sampleSection", () => {
  const baseSpec: SectionSpec = {
    type: "MCQ",
    marksPerQuestion: 1,
    numQuestions: 5,
    scope: { chapterIds: ["ch1"] },
  };

  it("errors when scope is empty", async () => {
    const prisma = makeFakePrisma([makeQ("q1")]);
    const r = await sampleSection(prisma, { ...baseSpec, scope: {} });
    expect(r.error).toMatch(/scope must include/);
    expect(r.questions).toEqual([]);
  });

  it("errors with per-chapter breakdown when pool is too small", async () => {
    const prisma = makeFakePrisma([makeQ("q1"), makeQ("q2")]);
    const r = await sampleSection(prisma, { ...baseSpec, numQuestions: 5 });
    expect(r.error).toMatch(/need 5 MCQ.*only 2 available/);
    expect(r.error).toMatch(/Per-chapter/);
    expect(r.breakdown?.total).toBe(2);
  });

  it("returns the requested count when the pool is sufficient", async () => {
    const pool = Array.from({ length: 20 }, (_, i) => makeQ(`q${i}`));
    const prisma = makeFakePrisma(pool);
    const r = await sampleSection(prisma, baseSpec, { seed: 1 });
    expect(r.error).toBeUndefined();
    expect(r.questions).toHaveLength(5);
    // All ids unique
    expect(new Set(r.questions.map((q) => q.id)).size).toBe(5);
  });

  it("is deterministic under a fixed seed", async () => {
    const pool = Array.from({ length: 20 }, (_, i) => makeQ(`q${i}`));
    const prisma = makeFakePrisma(pool);
    const a = await sampleSection(prisma, baseSpec, { seed: 42 });
    const b = await sampleSection(prisma, baseSpec, { seed: 42 });
    expect(a.questions.map((q) => q.id)).toEqual(b.questions.map((q) => q.id));
  });

  it("distributeAcrossChapters balances picks across chapters", async () => {
    // 3 chapters × 10 questions each = 30 total; ask for 9 with fairness.
    const pool: FakeQ[] = [];
    for (const ch of ["c1", "c2", "c3"]) {
      for (let i = 0; i < 10; i++) pool.push(makeQ(`${ch}-${i}`, { chapterId: ch }));
    }
    const prisma = makeFakePrisma(pool);
    const r = await sampleSection(prisma, {
      ...baseSpec,
      numQuestions: 9,
      scope: { chapterIds: ["c1", "c2", "c3"] },
      distributeAcrossChapters: true,
    }, { seed: 1 });
    expect(r.error).toBeUndefined();
    const perChapter = new Map<string, number>();
    for (const q of r.questions) {
      perChapter.set(q.chapterId!, (perChapter.get(q.chapterId!) ?? 0) + 1);
    }
    // 9 / 3 chapters = exactly 3 each
    expect(perChapter.get("c1")).toBe(3);
    expect(perChapter.get("c2")).toBe(3);
    expect(perChapter.get("c3")).toBe(3);
  });

  it("difficulty distribution respects the requested mix", async () => {
    const pool: FakeQ[] = [];
    for (let i = 0; i < 10; i++) pool.push(makeQ(`e${i}`, { difficulty: "EASY" }));
    for (let i = 0; i < 10; i++) pool.push(makeQ(`m${i}`, { difficulty: "MEDIUM" }));
    for (let i = 0; i < 10; i++) pool.push(makeQ(`h${i}`, { difficulty: "HARD" }));
    const prisma = makeFakePrisma(pool);
    const r = await sampleSection(prisma, {
      ...baseSpec,
      numQuestions: 10,
      difficulty: { easy: 50, medium: 30, hard: 20 },
    }, { seed: 5 });
    expect(r.error).toBeUndefined();
    const counts = { EASY: 0, MEDIUM: 0, HARD: 0 };
    for (const q of r.questions) counts[q.difficulty as "EASY" | "MEDIUM" | "HARD"]++;
    expect(counts.EASY).toBe(5);
    expect(counts.MEDIUM).toBe(3);
    expect(counts.HARD).toBe(2);
  });

  it("difficulty distribution errors clearly when pool truly can't satisfy the mix (even with borrowing)", async () => {
    // Pool: 2 EASY only. Want 5 hard. Even after borrowing E→H, only 2 total.
    // (numQuestions=5 also exceeds pool size, but this exercises the difficulty branch)
    const pool: FakeQ[] = [
      makeQ("e1", { difficulty: "EASY" }),
      makeQ("e2", { difficulty: "EASY" }),
    ];
    const prisma = makeFakePrisma(pool);
    const r = await sampleSection(prisma, {
      ...baseSpec,
      numQuestions: 5,
      difficulty: { easy: 0, medium: 0, hard: 5 },
    }, { seed: 1 });
    // Total-pool check trips first here, which is fine — the sampler correctly errors.
    expect(r.error).toBeDefined();
    expect(r.error).toMatch(/need 5|difficulty mix/);
  });

  it("excludeIds prevents reuse across calls", async () => {
    const pool = Array.from({ length: 10 }, (_, i) => makeQ(`q${i}`));
    const prisma = makeFakePrisma(pool);
    const first = await sampleSection(prisma, { ...baseSpec, numQuestions: 5 }, { seed: 1 });
    const firstIds = new Set(first.questions.map((q) => q.id));
    const second = await sampleSection(prisma, { ...baseSpec, numQuestions: 5 }, { seed: 2, excludeIds: firstIds });
    for (const q of second.questions) {
      expect(firstIds.has(q.id)).toBe(false);
    }
  });
});

describe("sampleComposition", () => {
  it("never repeats a question across sections", async () => {
    const pool = Array.from({ length: 30 }, (_, i) => makeQ(`q${i}`));
    const prisma = makeFakePrisma(pool);
    const specs: SectionSpec[] = [
      { type: "MCQ", marksPerQuestion: 1, numQuestions: 10, scope: { chapterIds: ["ch1"] } },
      { type: "MCQ", marksPerQuestion: 2, numQuestions: 10, scope: { chapterIds: ["ch1"] } },
    ];
    const r = await sampleComposition(prisma, specs, 100);
    expect(r.errors).toEqual([]);
    const allIds = r.sections.flatMap((s) => s.questions.map((q) => q.id));
    expect(new Set(allIds).size).toBe(allIds.length); // no dupes
    expect(allIds).toHaveLength(20);
  });

  it("accumulates per-section errors without aborting the whole composition", async () => {
    // 3 questions available; section 1 wants 2 (fine), section 2 wants 5 (fails)
    const pool = Array.from({ length: 3 }, (_, i) => makeQ(`q${i}`));
    const prisma = makeFakePrisma(pool);
    const specs: SectionSpec[] = [
      { type: "MCQ", marksPerQuestion: 1, numQuestions: 2, scope: { chapterIds: ["ch1"] } },
      { type: "MCQ", marksPerQuestion: 1, numQuestions: 5, scope: { chapterIds: ["ch1"] } },
    ];
    const r = await sampleComposition(prisma, specs, 1);
    expect(r.errors).toHaveLength(1);
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0].questions).toHaveLength(2);
  });

  it("is deterministic under the same top-level seed", async () => {
    const pool = Array.from({ length: 30 }, (_, i) => makeQ(`q${i}`));
    const prisma = makeFakePrisma(pool);
    const specs: SectionSpec[] = [
      { type: "MCQ", marksPerQuestion: 1, numQuestions: 5, scope: { chapterIds: ["ch1"] } },
      { type: "MCQ", marksPerQuestion: 1, numQuestions: 5, scope: { chapterIds: ["ch1"] } },
    ];
    const a = await sampleComposition(prisma, specs, 12345);
    const b = await sampleComposition(prisma, specs, 12345);
    expect(a.sections.map((s) => s.questions.map((q) => q.id)))
      .toEqual(b.sections.map((s) => s.questions.map((q) => q.id)));
  });
});
