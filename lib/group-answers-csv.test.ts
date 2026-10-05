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
  role: [],
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
  answers: [],
  chain: [],
  tensions: [],
  ...over,
});
const answer = (id: string, kind: SynthesisExercise["themes"][number]["answers"][number]["kind"], text: string) => ({
  ...row(id, text),
  kind,
  label: `Q(${kind})`,
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
            answers: [answer("b", "benefit", "Residents who attend"), answer("c", "condition", "Durable funding")],
            chain: [
              {
                ...row("h", "A hope"),
                cardKind: "hope" as const,
                depth: 1,
                concerns: "Night-shift workers",
                value: "because trust matters",
                assumptions: [row("a", "We assume trust transfers")],
              },
            ],
            tensions: [stake("t", "A disagreement")],
          }),
        ],
        role: [answer("d", "desired_role", "Convener"), answer("r", "risk", "Gatekeeping")],
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
      "benefit",
      "condition",
      "hope",
      "concerns",
      "assumption",
      "tension",
      "desired_role",
      "risk",
      "implication",
      "brainstorm",
      "parked",
      "orphan",
    ]);
  });

  it("puts the question on the row with its answer, so the sheet reads without the app", () => {
    const rows = synthesisCsvRows(ex({ themes: [theme({ answers: [answer("c", "condition", "Durable funding stays")] })] }));
    expect(content(rows)).toContain("Q(condition) — Durable funding stays");
  });

  it("keeps a sandbox note's mechanism on the same row", () => {
    const rows = synthesisCsvRows(
      ex({ themes: [theme({ tensions: [stake("t", "Response stalls", { mechanism: "Through slower sign-off" })] })] })
    );
    expect(content(rows)).toContain("Response stalls — Through slower sign-off");
  });

  it("writes the board's role answers under their own section", () => {
    const rows = synthesisCsvRows(ex({ role: [answer("d", "desired_role", "Convener")] }));
    expect(rows).toEqual([["Session 3", "Public health's role", "desired_role", "Q(desired_role) — Convener", "Ana", "2026-01-01"]]);
  });

  it("keeps a hope's value with it and indents the chain by depth", () => {
    const rows = synthesisCsvRows(
      ex({
        themes: [
          theme({
            chain: [
              { ...row("h", "A hope"), cardKind: "hope" as const, depth: 1, concerns: null, value: "because X", assumptions: [] },
              { ...row("f", "A fear"), cardKind: "fear" as const, depth: 2, concerns: null, value: null, assumptions: [] },
            ],
          }),
        ],
      })
    );
    expect(content(rows)).toEqual(["Recognition over authority", "A hope — because X", "→ A fear"]);
  });

  it("names the theme on every row belonging to it", () => {
    const rows = synthesisCsvRows(
      ex({ themes: [theme({ answers: [answer("r", "risk", "A risk")], implications: [row("i", "An implication")] })] })
    );
    expect(rows.slice(1).every((r) => r[1] === "Theme: Recognition over authority")).toBe(true);
  });

  it("returns nothing for an empty week", () => {
    expect(synthesisCsvRows(ex())).toEqual([]);
  });
});
