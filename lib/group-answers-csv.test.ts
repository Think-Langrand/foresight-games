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
  hopesFears: [],
  role: [],
  unclustered: [],
  parked: [],
  orphans: [],
  questions: [],
  summary: null,
  ...over,
});

const theme = (over: Partial<SynthesisExercise["themes"][number]> = {}) => ({
  id: "T",
  text: "Recognition over authority",
  description: null,
  implications: [],
  answers: [],
  risks: [],
  opportunities: [],
  chain: [],
  tensions: [],
  ...over,
});
const chainRow = (
  id: string,
  text: string,
  cardKind: "hope" | "fear",
  depth: number,
  extra: Partial<{ concerns: string | null; value: string | null; assumptions: ReturnType<typeof row>[] }> = {}
) => ({
  ...row(id, text),
  cardKind,
  depth,
  concerns: extra.concerns ?? null,
  concernsBy: null,
  value: extra.value ?? null,
  assumptions: extra.assumptions ?? [],
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
            risks: [stake("rk", "A risk")],
            opportunities: [stake("op", "An opportunity")],
            chain: [
              chainRow("h", "A hope", "hope", 1, {
                concerns: "Night-shift workers",
                value: "because trust matters",
                assumptions: [row("a", "We assume trust transfers")],
              }),
            ],
            tensions: [stake("t", "A disagreement")],
          }),
        ],
        hopesFears: [chainRow("bf", "A board fear", "fear", 1), chainRow("bh", "Its hope", "hope", 2)],
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
      "risk",
      "opportunity",
      "hope",
      "concerns",
      "assumption",
      "tension",
      "fear",
      "hope",
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
            chain: [chainRow("h", "A hope", "hope", 1, { value: "because X" }), chainRow("f", "A fear", "fear", 2)],
          }),
        ],
      })
    );
    expect(content(rows)).toEqual(["Recognition over authority", "A hope — because X", "→ A fear"]);
  });

  it("writes the board's hopes and fears under their own section, a flip indented under its fear", () => {
    const rows = synthesisCsvRows(
      ex({ hopesFears: [chainRow("f", "Clinics close", "fear", 1), chainRow("h", "Care comes to people", "hope", 2)] })
    );
    expect(rows).toEqual([
      ["Session 3", "Hopes & fears", "fear", "Clinics close", "Ana", "2026-01-01"],
      ["Session 3", "Hopes & fears", "hope", "→ Care comes to people", "Ana", "2026-01-01"],
    ]);
  });

  it("writes a theme's risks and opportunities on the theme", () => {
    const rows = synthesisCsvRows(
      ex({ themes: [theme({ risks: [stake("r", "Burnout")], opportunities: [stake("o", "New allies")] })] })
    );
    expect(rows.slice(1)).toEqual([
      ["Session 3", "Theme: Recognition over authority", "risk", "Burnout", "Ana", "2026-01-01"],
      ["Session 3", "Theme: Recognition over authority", "opportunity", "New allies", "Ana", "2026-01-01"],
    ]);
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

  it("writes the facilitator's summary first, under its own section, with no author", () => {
    const rows = synthesisCsvRows(
      ex({
        themes: [theme()],
        summary: {
          overview: "Trust moves to people.",
          themes: [{ themeId: "T", title: "Trust", about: "Who people listen to", atStake: "Hosts gain reach", risks: ["Bad actors"], opportunities: ["Trust routes"] }],
          tensions: ["Reach vs accountability"],
          generatedAt: "2026-10-05T12:00:00.000Z",
          cardCount: 4,
        },
      })
    );
    expect(rows.slice(0, 6)).toEqual([
      ["Session 3", "Summary", "summary", "Trust moves to people.", "", "2026-10-05T12:00:00.000Z"],
      ["Session 3", "Summary", "summary", "Trust — Who people listen to", "", "2026-10-05T12:00:00.000Z"],
      ["Session 3", "Summary", "summary", "Trust — at stake: Hosts gain reach", "", "2026-10-05T12:00:00.000Z"],
      ["Session 3", "Summary", "summary", "Trust — risk: Bad actors", "", "2026-10-05T12:00:00.000Z"],
      ["Session 3", "Summary", "summary", "Trust — opportunity: Trust routes", "", "2026-10-05T12:00:00.000Z"],
      ["Session 3", "Summary", "summary", "Tension: Reach vs accountability", "", "2026-10-05T12:00:00.000Z"],
    ]);
    expect(rows[6][2]).toBe("theme");
  });
});
