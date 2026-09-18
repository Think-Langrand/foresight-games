import { describe, it, expect } from "vitest";
import { shapeFromView, type ShapeableExercise } from "./group-answers-shape";
import { EXERCISE_TYPES, type WorksheetSection } from "./exercise-types";
import { DEFAULT_RIPPLES_CONFIG, type CardOrder, type RippleCard, type RipplesView } from "./ripples-types";

// Tiny builders. createdTime is a zero-padded counter so ordering is deterministic.
function card(
  id: string,
  order: CardOrder,
  opts: { section?: string | null; seq?: number; sort?: number; author?: string | null; parentId?: string } = {}
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
});

describe("shapeFromView — other types", () => {
  it("placeholder and unknown types shape to a placeholder", () => {
    expect(shapeFromView(ex("placeholder"), null).kind).toBe("placeholder");
    expect(shapeFromView(ex("no-such-type"), view([])).kind).toBe("placeholder");
  });
});
