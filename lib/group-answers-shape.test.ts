import { describe, it, expect } from "vitest";
import { shapeFromView, type ShapeableExercise } from "./group-answers-shape";
import { EXERCISE_TYPES, type WorksheetSection } from "./exercise-types";
import { DEFAULT_RIPPLES_CONFIG, type CardOrder, type RippleCard, type RipplesView } from "./ripples-types";

// Tiny builders. createdTime is a zero-padded counter so ordering is deterministic.
function card(
  id: string,
  order: CardOrder,
  opts: {
    section?: string | null;
    seq?: number;
    sort?: number;
    author?: string | null;
    parentId?: string;
    cardKind?: RippleCard["cardKind"];
    parked?: boolean;
    description?: string | null;
    shortlisted?: boolean;
  } = {}
): RippleCard {
  return {
    id,
    teamId: "T",
    authorPlayerId: opts.author === undefined ? "P1" : opts.author,
    order,
    parentId: opts.parentId ?? null,
    text: `${id}-text`,
    lensId: null,
    flagged: false,
    greyed: false,
    sort: opts.sort ?? 0,
    section: opts.section ?? null,
    sourceCardId: null,
    sourceLabel: null,
    plausibility: null,
    impact: null,
    cardKind: opts.cardKind ?? null,
    parked: opts.parked ?? false,
    description: opts.description ?? null,
    shortlisted: opts.shortlisted ?? false,
    twinKey: null,
    createdTime: `2026-01-01T00:00:${String(opts.seq ?? 0).padStart(2, "0")}Z`,
  };
}

function view(cards: RippleCard[], scenarioTitle = ""): RipplesView {
  return {
    session: {} as RipplesView["session"],
    config: { ...DEFAULT_RIPPLES_CONFIG, scenarioTitle },
    teams: [],
    players: [
      { id: "P1", teamId: "T", displayName: "Ana", lensId: null, answers: {}, submittedAt: null, createdTime: "" },
    ],
    cards,
    chips: [],
    fetchedAt: 0,
  };
}

const q = (key: string, label = key): WorksheetSection => ({ key, kind: "question", label });
const ex = (type: string, sections: WorksheetSection[] = []): ShapeableExercise => ({
  id: "EX",
  title: "Week",
  type,
  sections,
});

describe("shapeFromView — worksheet weeks", () => {
  it("groups STICKY answers by section key, oldest first, with author names", () => {
    const out = shapeFromView(
      ex("worksheet", [q("a", "Question A"), q("b")]),
      view([
        card("a2", "STICKY", { section: "a", seq: 2 }),
        card("a1", "STICKY", { section: "a", seq: 1, author: null }),
        card("b1", "STICKY", { section: "b", seq: 3 }),
      ])
    );
    expect(out.kind).toBe("worksheet");
    if (out.kind !== "worksheet") return;
    expect(out.questions.map((x) => [x.key, x.label, x.answers.map((a) => a.id)])).toEqual([
      ["a", "Question A", ["a1", "a2"]],
      ["b", "b", ["b1"]],
    ]);
    expect(out.questions[0].answers.map((a) => a.author)).toEqual(["", "Ana"]); // null author → ""
  });

  it("falls back to the type template when the week has no sections of its own", () => {
    const out = shapeFromView(ex("scenario-assessment", []), view([]));
    if (out.kind !== "worksheet") throw new Error("expected worksheet");
    const template = EXERCISE_TYPES["scenario-assessment"].sections ?? [];
    expect(template.length).toBeGreaterThan(0);
    expect(out.questions.map((x) => x.key)).toEqual(template.map((s) => s.key));
  });

  it("hides answers under removed questions unless includeRemoved", () => {
    const cards = [card("x1", "STICKY", { section: "gone" }), card("a1", "STICKY", { section: "a" })];
    const member = shapeFromView(ex("worksheet", [q("a")]), view(cards));
    const admin = shapeFromView(ex("worksheet", [q("a")]), view(cards), { includeRemoved: true });
    if (member.kind !== "worksheet" || admin.kind !== "worksheet") throw new Error("expected worksheet");
    expect(member.questions.map((x) => x.key)).toEqual(["a"]);
    expect(admin.questions.map((x) => [x.key, x.removed ?? false, x.answers.length])).toEqual([
      ["a", false, 1],
      ["gone", true, 1],
    ]);
  });

  it("ignores tree cards and the unsectioned brainstorm pad", () => {
    const out = shapeFromView(
      ex("worksheet", [q("a")]),
      view([card("f", "FIRST"), card("pad", "STICKY"), card("a1", "STICKY", { section: "a" })])
    );
    if (out.kind !== "worksheet") throw new Error("expected worksheet");
    expect(out.questions[0].answers.map((a) => a.id)).toEqual(["a1"]);
  });

  it("still lists the questions (unanswered) when the board is missing", () => {
    const out = shapeFromView(ex("worksheet", [q("a")]), null);
    if (out.kind !== "worksheet") throw new Error("expected worksheet");
    expect(out.questions).toEqual([{ key: "a", label: "a", kind: "question", answers: [] }]);
  });
});

describe("shapeFromView — implications weeks", () => {
  it("splits the brainstorm pad (by sort) from section blocks, keeping every card for the map", () => {
    const cards = [
      card("f1", "FIRST", { seq: 1 }),
      card("s1", "SECOND", { seq: 2, parentId: "f1" }),
      card("padB", "STICKY", { sort: 2, seq: 3 }),
      card("padA", "STICKY", { sort: 1, seq: 4 }),
      card("qa", "STICKY", { section: "a", seq: 5 }),
    ];
    const out = shapeFromView(ex("implications", [q("a")]), view(cards, "The World"));
    if (out.kind !== "implications") throw new Error("expected implications");
    expect(out.cards.map((c) => c.id)).toEqual(cards.map((c) => c.id));
    expect(out.brainstorm.map((b) => b.id)).toEqual(["padA", "padB"]);
    expect(out.questions.map((x) => [x.key, x.answers.map((a) => a.id)])).toEqual([["a", ["qa"]]]);
    expect(out.scenarioTitle).toBe("The World");
  });

  it("falls back to the group's scenario title when the board has none", () => {
    const out = shapeFromView(ex("implications"), view([]), { scenarioTitle: "Group scenario" });
    if (out.kind !== "implications") throw new Error("expected implications");
    expect(out.scenarioTitle).toBe("Group scenario");
  });

  it("becomes a placeholder when the board is missing", () => {
    expect(shapeFromView(ex("implications"), null)).toEqual({ kind: "placeholder", exerciseId: "EX", title: "Week" });
  });

  // Every pre-existing Session-2 row stores sections = [], so the Sandbox block only
  // surfaces here if the shaping falls back to the type's code template.
  it("falls back to the type template when the week stores no sections", () => {
    const cards = [card("s1", "STICKY", { section: "implication-sandbox", seq: 1 })];
    const out = shapeFromView(ex("implications", []), view(cards));
    if (out.kind !== "implications") throw new Error("expected implications");
    expect(out.questions.map((q) => q.key)).toEqual(["implication-sandbox"]);
    // …and an answer already on the board binds to its block rather than reading as orphaned.
    const sandbox = out.questions.find((q) => q.key === "implication-sandbox");
    expect(sandbox?.removed).toBeFalsy();
    expect(sandbox?.answers.map((a) => a.id)).toEqual(["s1"]);
  });
});

describe("shapeFromView — other types", () => {
  it("placeholder and unknown types shape to a placeholder", () => {
    expect(shapeFromView(ex("placeholder"), null).kind).toBe("placeholder");
    expect(shapeFromView(ex("no-such-type"), view([])).kind).toBe("placeholder");
  });
});

describe("shapeFromView — synthesis weeks", () => {
  // TH1 ─ I1 (clustered implication)
  //     └ H1(hope) ─ F1(fear)
  // I2 unsorted; PK parked; two risks/opps answers.
  const board = () => [
    card("TH1", "FIRST", { seq: 1, cardKind: "theme" }),
    card("I1", "SECOND", { seq: 2, parentId: "TH1" }),
    card("H1", "SECOND", { seq: 3, parentId: "TH1", cardKind: "hope" }),
    card("F1", "TERMINAL", { seq: 4, parentId: "H1", cardKind: "fear" }),
    card("I2", "FIRST", { seq: 5 }),
    card("PK", "FIRST", { seq: 6, parked: true }),
    card("N1", "STICKY", { seq: 7, section: "synthesis-sandbox" }),
  ];

  it("shapes themes with their implications and their hope/fear chain", () => {
    const out = shapeFromView(ex("synthesis"), view(board()));
    expect(out.kind).toBe("synthesis");
    if (out.kind !== "synthesis") return;
    expect(out.themes).toHaveLength(1);
    expect(out.themes[0].text).toBe("TH1-text");
    expect(out.themes[0].implications.map((a) => a.id)).toEqual(["I1"]);
    // Depth-first, so the indentation in the panel reads as the chain.
    expect(out.themes[0].chain).toEqual([
      expect.objectContaining({ id: "H1", cardKind: "hope", depth: 1 }),
      expect.objectContaining({ id: "F1", cardKind: "fear", depth: 2 }),
    ]);
  });

  it("separates the unsorted tray from the parked pile", () => {
    const out = shapeFromView(ex("synthesis"), view(board()));
    if (out.kind !== "synthesis") return;
    expect(out.unclustered.map((a) => a.id)).toEqual(["I2"]);
    expect(out.parked.map((a) => a.id)).toEqual(["PK"]);
  });

  it("has no question blocks — every step of the week is code now", () => {
    const out = shapeFromView(ex("synthesis"), view(board()));
    if (out.kind !== "synthesis") return;
    expect(out.questions).toEqual([]);
  });

  // The safety net for every retired key. A note written into the old Sandbox, or into the
  // Risks/Opportunities boards before those were replaced by cards on a theme, must still
  // be readable by a facilitator — the admin surfaces pass includeRemoved for exactly this.
  it("still surfaces a note written under a retired key, as a removed block", () => {
    const out = shapeFromView(ex("synthesis"), view(board()), { includeRemoved: true });
    if (out.kind !== "synthesis") return;
    expect(out.questions).toHaveLength(1);
    expect(out.questions[0]).toMatchObject({ key: "synthesis-sandbox", removed: true });
    expect(out.questions[0].answers.map((a) => a.id)).toEqual(["N1"]);
  });

  it("omits a hope unreachable from any theme, matching what the board draws", () => {
    const out = shapeFromView(
      ex("synthesis"),
      view([...board(), card("GHOST", "TERMINAL", { seq: 9, parentId: "I1", cardKind: "hope" })])
    );
    if (out.kind !== "synthesis") return;
    expect(out.themes[0].chain.map((c) => c.id)).not.toContain("GHOST");
  });

  it("carries the theme's description and every answered question in step order, and the board's role", () => {
    const out = shapeFromView(
      ex("synthesis"),
      view([
        card("TH1", "FIRST", { seq: 1, cardKind: "theme", description: "What the group means" }),
        card("R1", "FIRST", { seq: 2, cardKind: "risk" }),
        card("D1", "FIRST", { seq: 3, cardKind: "desired_role" }),
        card("B1", "SECOND", { seq: 4, parentId: "TH1", cardKind: "benefit" }),
        card("C1", "SECOND", { seq: 5, parentId: "TH1", cardKind: "condition" }),
        card("T1", "SECOND", { seq: 6, parentId: "TH1", cardKind: "tension" }),
      ])
    );
    if (out.kind !== "synthesis") return;
    const t = out.themes[0];
    expect(t.description).toBe("What the group means");
    // Step order, not creation order.
    expect(t.answers.map((a) => a.kind)).toEqual(["benefit", "condition"]);
    expect(t.tensions.map((r) => r.id)).toEqual(["T1"]);
    // The role is the board's, in question order, not a theme's.
    expect(out.role.map((a) => a.kind)).toEqual(["desired_role", "risk"]);
    expect(out.role[0]).toMatchObject({ text: "D1-text", label: "A desirable role for public health" });
  });

  it("lists every answer to one of the theme's four questions, in board order", () => {
    const out = shapeFromView(
      ex("synthesis"),
      view([
        card("TH1", "FIRST", { seq: 1, cardKind: "theme" }),
        card("B1", "SECOND", { seq: 2, parentId: "TH1", cardKind: "benefit" }),
        card("M1", "SECOND", { seq: 3, parentId: "TH1", cardKind: "mechanism" }),
        card("B2", "SECOND", { seq: 4, parentId: "TH1", cardKind: "benefit" }),
        card("B3", "SECOND", { seq: 5, parentId: "TH1", cardKind: "benefit" }),
      ])
    );
    if (out.kind !== "synthesis") return;
    const t = out.themes[0];
    // Three answers to "who benefits?", each its own row, still ahead of the mechanism:
    // step order between questions, board order within one.
    expect(t.answers.map((a) => [a.id, a.kind])).toEqual([
      ["B1", "benefit"],
      ["B2", "benefit"],
      ["B3", "benefit"],
      ["M1", "mechanism"],
    ]);
    // Every row carries the question's label, so the viewer and the CSV can group them.
    expect(new Set(t.answers.slice(0, 3).map((a) => a.label)).size).toBe(1);
  });

  it("keeps the one-answer questions to one row each", () => {
    const out = shapeFromView(
      ex("synthesis"),
      view([
        card("TH1", "FIRST", { seq: 1, cardKind: "theme" }),
        card("C1", "SECOND", { seq: 2, parentId: "TH1", cardKind: "condition" }),
        card("C2", "SECOND", { seq: 3, parentId: "TH1", cardKind: "condition" }),
      ])
    );
    if (out.kind !== "synthesis") return;
    // Part B is still one answer per question (the 0027 index still covers `condition`),
    // so a stray second card does not double the row.
    expect(out.themes[0].answers.map((a) => a.id)).toEqual(["C1"]);
  });

  it("carries who a hope concerns beside it", () => {
    const out = shapeFromView(
      ex("synthesis"),
      view([
        card("TH1", "FIRST", { seq: 1, cardKind: "theme" }),
        card("H1", "SECOND", { seq: 2, parentId: "TH1", cardKind: "hope" }),
        card("C1", "TERMINAL", { seq: 3, parentId: "H1", cardKind: "concerns" }),
      ])
    );
    if (out.kind !== "synthesis") return;
    expect(out.themes[0].chain[0]).toMatchObject({ id: "H1", concerns: "C1-text" });
  });

  it("hangs assumptions on their hope, and the value with it", () => {
    const out = shapeFromView(
      ex("synthesis"),
      view([
        card("TH1", "FIRST", { seq: 1, cardKind: "theme" }),
        card("H1", "SECOND", { seq: 2, parentId: "TH1", cardKind: "hope", description: "because trust matters" }),
        card("A1", "TERMINAL", { seq: 3, parentId: "H1", cardKind: "assumption" }),
      ])
    );
    if (out.kind !== "synthesis") return;
    const [hope] = out.themes[0].chain;
    expect(hope.value).toBe("because trust matters");
    expect(hope.assumptions.map((a) => a.id)).toEqual(["A1"]);
    // Not a chain row of its own — the colour maps and the CSV Kind column depend on this.
    expect(out.themes[0].chain.map((c) => c.id)).toEqual(["H1"]);
  });

  it("carries the board's hopes and fears, a flipped hope right after its fear", () => {
    const out = shapeFromView(
      ex("synthesis"),
      view([
        card("TH1", "FIRST", { seq: 1, cardKind: "theme" }),
        card("F1", "FIRST", { seq: 2, cardKind: "fear" }),
        card("H1", "FIRST", { seq: 3, cardKind: "hope" }),
        card("H2", "SECOND", { seq: 4, parentId: "F1", cardKind: "hope" }),
      ])
    );
    if (out.kind !== "synthesis") return;
    expect(out.hopesFears).toEqual([
      expect.objectContaining({ id: "F1", cardKind: "fear", depth: 1 }),
      expect.objectContaining({ id: "H2", cardKind: "hope", depth: 2 }),
      expect.objectContaining({ id: "H1", cardKind: "hope", depth: 1 }),
    ]);
    expect(out.orphans).toEqual([]);
    // Not a theme's — the board's.
    expect(out.themes[0].chain).toEqual([]);
  });

  it("carries a theme's risks and opportunities as its own, not the board's role", () => {
    const out = shapeFromView(
      ex("synthesis"),
      view([
        card("TH1", "FIRST", { seq: 1, cardKind: "theme" }),
        card("R1", "SECOND", { seq: 2, parentId: "TH1", cardKind: "risk" }),
        card("O1", "SECOND", { seq: 3, parentId: "TH1", cardKind: "opportunity", description: "via x" }),
      ])
    );
    if (out.kind !== "synthesis") return;
    expect(out.themes[0].risks.map((r) => r.id)).toEqual(["R1"]);
    expect(out.themes[0].opportunities[0]).toMatchObject({ id: "O1", mechanism: "via x" });
    expect(out.role).toEqual([]);
    // …and ONLY as its risks and opportunities. `risk` and `opportunity` are also two of
    // the retired role step's answer kinds, and reading them as answers as well listed the
    // first of each twice on the sheet and in the CSV.
    expect(out.themes[0].answers).toEqual([]);
  });

  it("still reads the retired role step's other two answers on a theme", () => {
    const out = shapeFromView(
      ex("synthesis"),
      view([
        card("TH1", "FIRST", { seq: 1, cardKind: "theme" }),
        card("D1", "SECOND", { seq: 2, parentId: "TH1", cardKind: "desired_role" }),
        card("R1", "SECOND", { seq: 3, parentId: "TH1", cardKind: "risk" }),
      ])
    );
    if (out.kind !== "synthesis") return;
    expect(out.themes[0].answers.map((a) => a.kind)).toEqual(["desired_role"]);
    expect(out.themes[0].risks.map((r) => r.id)).toEqual(["R1"]);
  });

  it("surfaces unplaceable cards rather than dropping them", () => {
    const out = shapeFromView(
      ex("synthesis"),
      view([
        card("TH1", "FIRST", { seq: 1, cardKind: "theme" }),
        card("I1", "SECOND", { seq: 2, parentId: "TH1" }),
        card("LOOSE", "TERMINAL", { seq: 3, parentId: "I1", cardKind: "hope" }), // under an implication
      ])
    );
    if (out.kind !== "synthesis") return;
    expect(out.orphans.map((a) => a.id)).toEqual(["LOOSE"]);
  });

  it("carries the facilitator's summary from the board's config", () => {
    const summary = {
      overview: "Trust moves to people.",
      themes: [],
      tensions: [],
      generatedAt: "2026-10-05T12:00:00.000Z",
      cardCount: 1,
    };
    const v = view(board());
    const out = shapeFromView(ex("synthesis"), { ...v, config: { ...v.config, summary } });
    if (out.kind !== "synthesis") return;
    expect(out.summary).toEqual(summary);
  });

  it("degrades to a placeholder when the board could not be loaded", () => {
    expect(shapeFromView(ex("synthesis"), null).kind).toBe("placeholder");
  });
});

describe("shapeFromView — commitments weeks (Week 4)", () => {
  const response = (id: string, seq: number, opts: { sort?: number; shortlisted?: boolean } = {}) =>
    card(id, "FIRST", { cardKind: "response", seq, ...opts });
  const milestone = (id: string, parentId: string, period: string, seq: number) =>
    card(id, "SECOND", { cardKind: "milestone", parentId, section: period, seq });

  it("shapes the wall, the picks and one lane per bold move", () => {
    const shaped = shapeFromView(
      ex("commitments"),
      view([
        response("r1", 1, { sort: 1000, shortlisted: true }),
        response("r2", 2, { sort: 2000 }),
        milestone("m1", "r1", "w4-p1", 3),
        milestone("m2", "r1", "w4-p5", 4),
      ])
    );
    if (shaped.kind !== "commitments") throw new Error(`expected commitments, got ${shaped.kind}`);

    expect(shaped.responses.map((r) => [r.text, r.shortlisted])).toEqual([
      ["r1-text", true],
      ["r2-text", false],
    ]);
    expect(shaped.boldMoves.map((m) => m.text)).toEqual(["r1-text"]);
    // One lane, because only one response was picked.
    expect(shaped.lanes).toHaveLength(1);
    expect(shaped.lanes[0].move.text).toBe("r1-text");
    expect(shaped.orphans).toEqual([]);
    expect(shaped.stranded).toEqual([]);
    // Author names resolve the same way every other week's do.
    expect(shaped.responses[0].author).toBe("Ana");
  });

  it("keeps every period on a lane, including the empty ones", () => {
    // Where a group clustered its milestones and where it left a gap is part of the
    // finding, so an empty cell is a cell, not an omission.
    const shaped = shapeFromView(
      ex("commitments"),
      view([response("r1", 1, { shortlisted: true }), milestone("m1", "r1", "w4-p3", 2)])
    );
    if (shaped.kind !== "commitments") throw new Error("expected commitments");

    const lane = shaped.lanes[0];
    expect(lane.periods.map((p) => p.key)).toEqual(["w4-p1", "w4-p2", "w4-p3", "w4-p4", "w4-p5"]);
    expect(lane.periods.map((p) => p.milestones.length)).toEqual([0, 0, 1, 0, 0]);
    expect(lane.periods[2].label).toBe("2031–32");
  });

  it("reports milestones whose move is no longer picked, rather than dropping them", () => {
    const shaped = shapeFromView(
      ex("commitments"),
      view([response("r1", 1), milestone("m1", "r1", "w4-p2", 2)])
    );
    if (shaped.kind !== "commitments") throw new Error("expected commitments");

    expect(shaped.lanes).toEqual([]); // nothing picked, so no timeline
    expect(shaped.stranded.map((m) => m.text)).toEqual(["m1-text"]);
    expect(shaped.orphans).toEqual([]);
  });

  it("surfaces a milestone the board could not place", () => {
    const shaped = shapeFromView(
      ex("commitments"),
      view([response("r1", 1, { shortlisted: true }), milestone("bad", "r1", "w4-p9", 2)])
    );
    if (shaped.kind !== "commitments") throw new Error("expected commitments");
    expect(shaped.orphans.map((o) => o.text)).toEqual(["bad-text"]);
  });

  it("falls back to the type's section template when the week was never customized", () => {
    // The bug this guards: reading ex.sections (which is []) instead of the effective set
    // would make act 1 — everything the group wrote — invisible in the admin viewer.
    const shaped = shapeFromView(
      ex("commitments", []),
      view([card("a1", "STICKY", { section: "w4-attention", seq: 1 })])
    );
    if (shaped.kind !== "commitments") throw new Error("expected commitments");

    const template = EXERCISE_TYPES.commitments.sections ?? [];
    expect(shaped.questions.map((q) => q.key)).toEqual(template.map((s) => s.key));
    const first = shaped.questions.find((q) => q.key === "w4-attention");
    expect(first?.answers.map((a) => a.text)).toEqual(["a1-text"]);
    expect(first?.label).toBe(template[0].label);
  });

  it("still surfaces an answer written under a key the rebuild retired", () => {
    // The six-activity rebuild retired `w4-summary`, `w4-assumptions` and `w4-bold-moves`.
    // Groups that ran the old Week 4 have real answers under them, and those must not
    // vanish from the admin viewer just because the question is no longer asked — the same
    // contract the three aspiration keys got when the week was last restructured.
    const shaped = shapeFromView(
      ex("commitments", []),
      view([card("old", "STICKY", { section: "w4-bold-moves", seq: 1 })]),
      { includeRemoved: true }
    );
    if (shaped.kind !== "commitments") throw new Error("expected commitments");

    const retired = shaped.questions.find((q) => q.key === "w4-bold-moves");
    expect(retired?.removed).toBe(true);
    expect(retired?.answers.map((a) => a.text)).toEqual(["old-text"]);
  });

  it("shapes an empty board as a commitments week, not a placeholder", () => {
    const shaped = shapeFromView(ex("commitments"), view([]));
    expect(shaped.kind).toBe("commitments");
  });

  it("is a placeholder when the board could not be loaded", () => {
    // The `&& view` guard: a board-backed week whose view failed to load has no answers to
    // show, and saying "placeholder" is honest where an empty commitments week would not be.
    expect(shapeFromView(ex("commitments"), null).kind).toBe("placeholder");
  });
});
