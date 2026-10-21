import { describe, it, expect } from "vitest";
import {
  CROSS_GROUP_CSV_HEADER,
  GROUP_ANSWERS_CSV_HEADER,
  commitmentsCsvRows,
  exerciseCsvRows,
  implicationsCsvRows,
  synthesisCsvRows,
  worksheetCsvRows,
} from "./group-answers-csv";
import type {
  CommitmentsExercise,
  ExerciseAnswers,
  ImplicationsExercise,
  QuestionBlock,
  SynthesisExercise,
  WorksheetExercise,
} from "@/components/design-groups/AnswerPanels";
import type { RippleCard } from "@/lib/ripples-types";

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

  it("gives every answer to one question its own row", () => {
    const rows = synthesisCsvRows(
      ex({
        themes: [
          theme({
            answers: [
              answer("b1", "benefit", "Residents who attend"),
              answer("b2", "benefit", "The clinics they already use"),
              answer("b3", "benefit", "Whoever runs the panel"),
            ],
          }),
        ],
      })
    );
    // The theme's own row, then one row per answer — nothing folded into a single cell, so a
    // group that read "who benefits?" three ways has three rows to sort and filter.
    expect(rows.slice(1).map((r) => [r[2], r[3]])).toEqual([
      ["benefit", "Q(benefit) — Residents who attend"],
      ["benefit", "Q(benefit) — The clinics they already use"],
      ["benefit", "Q(benefit) — Whoever runs the panel"],
    ]);
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

// --- the extracted worksheet / implications / dispatcher rows -------------------
//
// These were inlined in AdminGroupAnswers.tsx until the cross-group export needed them
// too. Tested here for the same reason synthesisCsvRows is: they push untyped string
// arrays, so a dropped field fails nothing at compile time.

const wrow = (id: string, text: string) => ({ id, text, author: "Ana", createdAt: "2026-01-01" });
// A Week 4 mark: a step-2 matrix placement, or a settled uncertainty, which is never scored.
const wmark = (id: string, text: string, sourceId: string, p: number | null = null, i: number | null = null) => ({
  ...wrow(id, text),
  sourceId,
  plausibility: p,
  impact: i,
  rank: p !== null && i !== null ? p * i : null,
});

const qblock = (
  key: string,
  over: Partial<QuestionBlock> = {}
): QuestionBlock => ({
  key,
  label: `Label for ${key}`,
  kind: "question",
  answers: [],
  ...over,
});

const wex = (over: Partial<WorksheetExercise> = {}): WorksheetExercise => ({
  kind: "worksheet",
  exerciseId: "EX1",
  title: "Session 1",
  questions: [],
  ...over,
});

const iex = (over: Partial<ImplicationsExercise> = {}): ImplicationsExercise => ({
  kind: "implications",
  exerciseId: "EX2",
  title: "Session 2",
  scenarioTitle: "The Public Works",
  cards: [],
  brainstorm: [],
  questions: [],
  ...over,
});

function icard(id: string, order: RippleCard["order"], parentId: string | null = null): RippleCard {
  return {
    id,
    teamId: "T1",
    authorPlayerId: "P1",
    order,
    parentId,
    text: `${id}-text`,
    lensId: null,
    flagged: false,
    greyed: false,
    sort: 0,
    section: null,
    sourceCardId: null,
    sourceLabel: null,
    plausibility: null,
    impact: null,
    cardKind: null,
    parked: false,
    description: null,
    shortlisted: false,
    twinKey: null,
    createdTime: "2026-01-01T00:00:00Z",
  };
}

describe("worksheetCsvRows", () => {
  it("emits one row per answer, with the week, label, kind, author and time", () => {
    const rows = worksheetCsvRows(
      wex({ questions: [qblock("six-changes", { answers: [wrow("a1", "Fewer staff")] })] })
    );
    expect(rows).toEqual([
      ["Session 1", "Label for six-changes", "question", "Fewer staff", "Ana", "2026-01-01"],
    ]);
  });

  it("falls back to the section key when a block has no label", () => {
    const rows = worksheetCsvRows(
      wex({ questions: [qblock("parking-lot", { label: "", answers: [wrow("a1", "note")] })] })
    );
    expect(rows[0][1]).toBe("parking-lot");
  });

  it("emits nothing for a block with no answers", () => {
    expect(worksheetCsvRows(wex({ questions: [qblock("empty")] }))).toEqual([]);
  });

  it("keeps answers under a removed section — they are still the group's work", () => {
    const rows = worksheetCsvRows(
      wex({ questions: [qblock("retired", { removed: true, answers: [wrow("a1", "kept")] })] })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0][3]).toBe("kept");
  });
});

describe("implicationsCsvRows", () => {
  it("emits one row per root-to-leaf chain, joined with arrows", () => {
    const rows = implicationsCsvRows(
      iex({ cards: [icard("r", "FIRST"), icard("c", "SECOND", "r")] })
    );
    expect(rows).toEqual([
      ["Session 2", "Implication chain", "implications", "r-text → c-text", "", ""],
    ]);
  });

  it("emits brainstorm notes and question answers alongside the chains", () => {
    const rows = implicationsCsvRows(
      iex({
        cards: [icard("r", "FIRST")],
        brainstorm: [wrow("b1", "sandbox note")],
        questions: [qblock("implication-sandbox", { answers: [wrow("q1", "an answer")] })],
      })
    );
    expect(rows.map((r) => r[1])).toEqual([
      "Implication chain",
      "Brainstorm",
      "Label for implication-sandbox",
    ]);
    expect(rows[1]).toEqual(["Session 2", "Brainstorm", "brainstorm", "sandbox note", "Ana", "2026-01-01"]);
  });

  it("emits no chain rows for an empty board", () => {
    expect(implicationsCsvRows(iex())).toEqual([]);
  });
});

describe("exerciseCsvRows", () => {
  it("dispatches each exercise kind to its own row builder", () => {
    expect(exerciseCsvRows(wex({ questions: [qblock("k", { answers: [wrow("a", "w")] })] })))
      .toHaveLength(1);
    expect(exerciseCsvRows(iex({ cards: [icard("r", "FIRST")] }))).toHaveLength(1);
    expect(exerciseCsvRows(ex({ themes: [theme()] }))).toHaveLength(1);
    expect(exerciseCsvRows(cex({ responses: [stake("r", "fund it")] }))).toHaveLength(1);
  });

  it("emits nothing for a placeholder week rather than throwing", () => {
    expect(exerciseCsvRows({ kind: "placeholder", exerciseId: "EX4", title: "Session 4" })).toEqual([]);
  });

  // The guard that makes the header comment's failure mode impossible: a new member of the
  // ExerciseAnswers union has to be handled here or this stops compiling. Asserted at
  // runtime too, so an `as` cast somewhere upstream cannot slip a kind past it silently.
  it("throws on an unknown exercise kind instead of dropping it", () => {
    expect(() => exerciseCsvRows({ kind: "mystery" } as unknown as ExerciseAnswers)).toThrow(/mystery/);
  });
});

describe("CSV headers", () => {
  it("the cross-group header is the per-group one with Group in front", () => {
    expect(CROSS_GROUP_CSV_HEADER).toEqual(["Group", ...GROUP_ANSWERS_CSV_HEADER]);
  });

  it("every row builder emits exactly as many cells as the header has columns", () => {
    const rows = [
      ...worksheetCsvRows(wex({ questions: [qblock("k", { answers: [wrow("a", "w")] })] })),
      ...implicationsCsvRows(iex({ cards: [icard("r", "FIRST")], brainstorm: [wrow("b", "n")] })),
      ...synthesisCsvRows(ex({ themes: [theme({ risks: [stake("r1", "a risk")] })] })),
    ];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r).toHaveLength(GROUP_ANSWERS_CSV_HEADER.length);
  });
});

// --- Week 4 ------------------------------------------------------------------
const cex = (over: Partial<CommitmentsExercise> = {}): CommitmentsExercise => ({
  kind: "commitments",
  exerciseId: "EX4",
  title: "Session 4",
  cards: [],
  responses: [],
  boldMoves: [],
  lanes: [],
  stranded: [],
  picks: [],
  settledMarks: [],
  orphans: [],
  questions: [],
  ...over,
});

describe("commitmentsCsvRows", () => {
  it("emits six cells per row, in header order", () => {
    const rows = commitmentsCsvRows(cex({ responses: [stake("r1", "fund joint posts")] }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(GROUP_ANSWERS_CSV_HEADER.length);
    expect(rows[0]).toEqual(["Session 4", "Strategic responses", "response", "fund joint posts", "Ana", "2026-01-01"]);
  });

  it("stars a bold move on its own row rather than giving it a second one", () => {
    // A bold move IS a response carrying `shortlisted`. Emitting it twice would double
    // every picked move in any count taken off the sheet.
    const rows = commitmentsCsvRows(
      cex({
        responses: [stake("r1", "picked", { shortlisted: true }), stake("r2", "not picked")],
        boldMoves: [row("r1", "picked")],
      })
    );
    expect(rows.map((r) => [r[2], r[3]])).toEqual([
      ["response ★", "picked"],
      ["response", "not picked"],
    ]);
  });

  it("carries the period label and the move on every milestone row", () => {
    // A milestone read alone says when something happens but not what it is a step
    // towards, so the sheet has to stand on its own without the app.
    const rows = commitmentsCsvRows(
      cex({
        lanes: [
          {
            move: row("r1", "build the data-share agreement"),
            periods: [
              { key: "w4-p1", label: "2027–28", milestones: [row("m1", "draft the MOU")] },
              { key: "w4-p2", label: "2029–30", milestones: [] },
            ],
          },
        ],
      })
    );
    expect(rows).toEqual([
      [
        "Session 4",
        "Timeline · 2027–28",
        "milestone",
        "build the data-share agreement — draft the MOU",
        "Ana",
        "2026-01-01",
      ],
    ]);
  });

  it("exports work that is stranded or unplaced rather than leaving a silent gap", () => {
    const rows = commitmentsCsvRows(
      cex({ stranded: [row("m1", "orphan beat")], orphans: [row("m2", "no period")] })
    );
    expect(rows.map((r) => [r[1], r[2], r[3]])).toEqual([
      ["Timeline · move not picked", "milestone", "orphan beat"],
      ["Unplaced", "orphan", "no period"],
    ]);
  });

  it("emits the aspiration prompts under the labels the group saw", () => {
    const rows = commitmentsCsvRows(
      cex({ questions: [qblock("aspiration-statement", { label: "What are we aspiring to?", answers: [wrow("a1", "By 2035, every county has...")] })] })
    );
    expect(rows[0].slice(1, 4)).toEqual(["What are we aspiring to?", "question", "By 2035, every county has..."]);
  });

  it("emits a row for what step 5 curated, in the mark's stored words", () => {
    // Without these the facilitator's sheet had no trace of which three risks the group
    // chose for the committee, or which Session 1 uncertainties it declared answered.
    const rows = commitmentsCsvRows(
      cex({
        picks: [wmark("p1", "PH funding comes from one source", "r1")],
        settledMarks: [wmark("s1", "How would equity be considered?", "u1")],
      })
    );
    expect(rows.map((r) => [r[1], r[2], r[3]])).toEqual([
      ["Chosen for the committee", "pick", "PH funding comes from one source"],
      ["Settled since Session 1", "settled", "How would equity be considered?"],
    ]);
    for (const r of rows) expect(r).toHaveLength(GROUP_ANSWERS_CSV_HEADER.length);
  });

  it("emits nothing for an untouched board", () => {
    expect(commitmentsCsvRows(cex())).toEqual([]);
  });
});
