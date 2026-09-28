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
    card("R1", "STICKY", { seq: 7, section: "synthesis-risks" }),
    card("O1", "STICKY", { seq: 8, section: "synthesis-opportunities" }),
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

  it("falls back to the code template so risks/opportunities answers stay visible", () => {
    // An un-customized week stores sections: [] — the raw column would show no blocks.
    const out = shapeFromView(ex("synthesis"), view(board()));
    if (out.kind !== "synthesis") return;
    expect(out.questions.map((q) => q.key)).toEqual([
      "synthesis-risks",
      "synthesis-opportunities",
    ]);
    expect(out.questions[0].answers.map((a) => a.id)).toEqual(["R1"]);
    expect(out.questions[1].answers.map((a) => a.id)).toEqual(["O1"]);
  });

  it("omits a hope unreachable from any theme, matching what the board draws", () => {
    const out = shapeFromView(
      ex("synthesis"),
      view([...board(), card("GHOST", "TERMINAL", { seq: 9, parentId: "I1", cardKind: "hope" })])
    );
    if (out.kind !== "synthesis") return;
    expect(out.themes[0].chain.map((c) => c.id)).not.toContain("GHOST");
  });

  it("degrades to a placeholder when the board could not be loaded", () => {
    expect(shapeFromView(ex("synthesis"), null).kind).toBe("placeholder");
  });
});
