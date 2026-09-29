import { describe, it, expect } from "vitest";
import { synthesisCsvRows } from "./group-answers-csv";
import type { SynthesisExercise } from "@/components/design-groups/AnswerPanels";

const row = (id: string, text: string) => ({ id, text, author: "Ana", createdAt: "2026-01-01" });
const stake = (id: string, text: string, extra: Partial<{ mechanism: string | null; shortlisted: boolean }> = {}) => ({
  ...row(id, text),
  mechanism: extra.mechanism ?? null,
  shortlisted: extra.shortlisted ?? false,
});

const ex = (over: Partial<SynthesisExercise> = {}): SynthesisExercise => ({
  kind: "synthesis",
  exerciseId: "EX",
  title: "Session 3",
  cards: [],
  themes: [],
  unclustered: [],
  parked: [],
  orphans: [],
  questions: [],
  ...over,
});

const theme = (over: Partial<SynthesisExercise["themes"][number]> = {}) => ({
  id: "T",
  text: "Recognition over authority",
  description: null,
  implications: [],
  risks: [],
  opportunities: [],
  tensions: [],
  chain: [],
  ...over,
});

const kinds = (rows: string[][]) => rows.map((r) => r[2]);
const content = (rows: string[][]) => rows.map((r) => r[3]);

describe("synthesisCsvRows", () => {
  it("exports every card kind — the whole reason this is extracted", () => {
    const rows = synthesisCsvRows(
      ex({
        themes: [
          theme({
            description: "Who people listen to",
            implications: [row("i", "An implication")],
            risks: [stake("r", "A risk")],
            opportunities: [stake("o", "An opportunity")],
            tensions: [stake("t", "A disagreement")],
            chain: [
              {
                ...row("h", "A hope"),
                cardKind: "hope" as const,
                depth: 1,
                value: "because trust matters",
                assumptions: [row("a", "We assume trust transfers")],
              },
            ],
          }),
        ],
        unclustered: [row("u", "Unsorted")],
        parked: [row("p", "Parked")],
        orphans: [row("x", "Unplaceable")],
        questions: [{ key: "synthesis-sandbox", label: "Sandbox", kind: "brainstorm" as const, answers: [row("s", "A note")] }],
      })
    );
    expect(kinds(rows)).toEqual([
      "theme",
      "theme description",
      "implication",
      "risk",
      "opportunity",
      "tension",
      "hope",
      "assumption",
      "implication",
      "brainstorm",
      "parked",
      "orphan",
    ]);
  });

  it("keeps a stake card's mechanism on the same row as the finding", () => {
    const rows = synthesisCsvRows(
      ex({ themes: [theme({ risks: [stake("r", "Response stalls", { mechanism: "Through slower sign-off" })] })] })
    );
    expect(content(rows)).toContain("Response stalls — Through slower sign-off");
  });

  it("marks a shortlisted card so the committee picks survive the export", () => {
    const rows = synthesisCsvRows(
      ex({ themes: [theme({ risks: [stake("r", "Response stalls", { shortlisted: true })] })] })
    );
    expect(content(rows).some((c) => c.startsWith("★ "))).toBe(true);
  });

  it("keeps a hope's value with it and indents the chain by depth", () => {
    const rows = synthesisCsvRows(
      ex({
        themes: [
          theme({
            chain: [
              { ...row("h", "A hope"), cardKind: "hope" as const, depth: 1, value: "because X", assumptions: [] },
              { ...row("f", "A fear"), cardKind: "fear" as const, depth: 2, value: null, assumptions: [] },
            ],
          }),
        ],
      })
    );
    expect(content(rows)).toEqual(["Recognition over authority", "A hope — because X", "→ A fear"]);
  });

  it("names the theme on every row belonging to it", () => {
    const rows = synthesisCsvRows(
      ex({ themes: [theme({ risks: [stake("r", "A risk")], implications: [row("i", "An implication")] })] })
    );
    expect(rows.slice(1).every((r) => r[1] === "Theme: Recognition over authority")).toBe(true);
  });

  it("returns nothing for an empty week", () => {
    expect(synthesisCsvRows(ex())).toEqual([]);
  });
});
