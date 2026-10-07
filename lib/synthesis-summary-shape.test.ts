import { describe, it, expect } from "vitest";
import type { SynthesisExercise } from "@/components/design-groups/AnswerPanels";
import { coerceSummary, summaryDigest, summaryInputHash, SUMMARY_LIMITS } from "./synthesis-summary-shape";

const row = (id: string, text: string) => ({ id, text, author: "Ana", createdAt: "2026-01-01" });
const stake = (id: string, text: string) => ({ ...row(id, text), mechanism: null, shortlisted: false });

const ex = (themes: SynthesisExercise["themes"]): SynthesisExercise => ({
  kind: "synthesis",
  exerciseId: "EX",
  title: "Session 3",
  cards: [],
  themes,
  hopesFears: [],
  role: [],
  unclustered: [],
  parked: [],
  orphans: [],
  questions: [],
  summary: null,
});

const theme = (id: string, text: string, over: Partial<SynthesisExercise["themes"][number]> = {}) => ({
  id,
  text,
  description: null,
  implications: [],
  answers: [],
  risks: [],
  opportunities: [],
  chain: [],
  tensions: [],
  ...over,
});

const valid = {
  overview: "Trust moves to people.",
  themes: [
    { themeId: "T1", title: "Trust", about: "Who people listen to", atStake: "Hosts gain reach", risks: ["Bad actors"], opportunities: ["Ride trust routes"] },
  ],
  tensions: ["Reach vs accountability"],
  generatedAt: "2026-10-05T12:00:00.000Z",
  cardCount: 7,
};

describe("coerceSummary", () => {
  it("passes a well-formed summary through", () => {
    expect(coerceSummary(valid)).toEqual(valid);
  });

  it("is null for garbage, and for a blob missing its overview or timestamp", () => {
    expect(coerceSummary(null)).toBeNull();
    expect(coerceSummary("text")).toBeNull();
    expect(coerceSummary({ ...valid, overview: "" })).toBeNull();
    expect(coerceSummary({ ...valid, generatedAt: "yesterday" })).toBeNull();
  });

  it("drops malformed theme blocks and list items, keeps the rest, and clamps lengths", () => {
    const got = coerceSummary({
      ...valid,
      themes: [...valid.themes, { title: "" }, "nope", { themeId: "T9", title: "Orphaned theme", risks: [1, "kept"] }],
      tensions: ["ok", 3, ""],
      cardCount: "7",
      overview: "x".repeat(SUMMARY_LIMITS.overview + 50),
    })!;
    expect(got.themes.map((t) => t.title)).toEqual(["Trust", "Orphaned theme"]);
    expect(got.themes[1]).toMatchObject({ about: "", atStake: "", risks: ["kept"], opportunities: [] });
    expect(got.tensions).toEqual(["ok"]);
    expect(got.cardCount).toBe(0);
    expect(got.overview).toHaveLength(SUMMARY_LIMITS.overview);
  });
});

describe("summaryDigest", () => {
  const board = () =>
    ex([
      theme("A", "Trust moves to people", {
        description: "Who people listen to",
        answers: [{ ...row("b", "Livestream hosts"), kind: "benefit", label: "Who benefits, and how?" }],
        risks: [stake("r", "Bad actors buy trust")],
        opportunities: [stake("o", "Ride existing trust routes")],
      }),
      theme("B", "Clinics shrink"),
    ]);

  it("keys themes t1, t2… and maps them back to ids", () => {
    const d = summaryDigest(board());
    expect(d.themes.map((t) => t.key)).toEqual(["t1", "t2"]);
    expect(d.keyToId).toEqual({ t1: "A", t2: "B" });
  });

  it("writes everything steps 1–2 put on a theme, labelled", () => {
    const d = summaryDigest(board());
    expect(d.text).toContain("Theme t1: Trust moves to people");
    expect(d.text).toContain("About: Who people listen to");
    expect(d.text).toContain("Q: Who benefits, and how? — Livestream hosts");
    expect(d.text).toContain("Risk: Bad actors buy trust");
    expect(d.text).toContain("Opportunity: Ride existing trust routes");
    expect(d.text).toContain("Theme t2: Clinics shrink");
  });

  it("leaves a theme out whole once the cap is reached, never cutting mid-theme", () => {
    const d = summaryDigest(board(), 60);
    expect(d.themes.map((t) => t.key)).toEqual(["t1"]); // the first always goes in
    expect(d.text).not.toContain("t2");
  });

  it("is empty for a board with no themes", () => {
    expect(summaryDigest(ex([]))).toEqual({ themes: [], text: "", keyToId: {} });
  });
});

describe("summaryInputHash", () => {
  it("is stable for the same board and changes when anything the model reads changes", () => {
    const a = ex([theme("t1", "Access"), theme("t2", "Trust")]);
    expect(summaryInputHash(a)).toBe(summaryInputHash(ex([theme("t1", "Access"), theme("t2", "Trust")])));
    // A renamed theme: same card count, different input.
    expect(summaryInputHash(ex([theme("t1", "Access to care"), theme("t2", "Trust")]))).not.toBe(summaryInputHash(a));
    // An added risk.
    expect(
      summaryInputHash(ex([theme("t1", "Access", { risks: [stake("r1", "Longer waits")] }), theme("t2", "Trust")]))
    ).not.toBe(summaryInputHash(a));
  });

  it("round-trips through coerceSummary, and is absent on an older summary", () => {
    expect(coerceSummary({ ...valid, inputHash: "1f-0a1b2c3d" })?.inputHash).toBe("1f-0a1b2c3d");
    expect(coerceSummary(valid)?.inputHash).toBeUndefined();
  });
});
