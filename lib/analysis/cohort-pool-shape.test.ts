import { describe, it, expect } from "vitest";
import {
  POOL_SOURCES,
  PURPOSE_FIELD,
  itemsFromBoard,
  poolSourceLabel,
  poolSourceRender,
  type PoolSource,
} from "./cohort-pool-shape";
import { COMMITMENTS_KEY_VISION } from "@/lib/exercise-types";
import { DIRECTION_FIELDS } from "@/lib/commitments-shape";
import type { CardKind, CardOrder, RippleCard } from "@/lib/ripples-types";

function card(
  id: string,
  over: Partial<RippleCard> & { order?: CardOrder; cardKind?: CardKind | null } = {}
): RippleCard {
  return {
    id,
    teamId: "T",
    authorPlayerId: "P1",
    order: over.order ?? "FIRST",
    parentId: over.parentId ?? null,
    text: over.text ?? `${id}-text`,
    lensId: null,
    flagged: false,
    greyed: over.greyed ?? false,
    sort: over.sort ?? 0,
    // Overridable: Session 4 keeps the vision in a worksheet section and a bold move's
    // explaining fields in `section` too, so a helper that pinned this to null could not
    // build a realistic commitments board.
    section: over.section ?? null,
    sourceCardId: over.sourceCardId ?? null,
    sourceLabel: null,
    plausibility: over.plausibility ?? null,
    impact: over.impact ?? null,
    cardKind: over.cardKind ?? null,
    parked: over.parked ?? false,
    description: over.description ?? null,
    shortlisted: over.shortlisted ?? false,
    twinKey: over.twinKey ?? null,
    createdTime: over.createdTime ?? "2026-01-01T00:00:00Z",
  };
}

// A synthesis board: two themes, each with a risk and an opportunity; a fear flipped into a
// hope; a second fear left standing; a bare hope written straight on the board.
function synthesisBoard(): RippleCard[] {
  return [
    card("t1", { cardKind: "theme", text: "Workforce capacity" }),
    card("t2", { cardKind: "theme", text: "" }), // unnamed, as real boards often are
    card("r1", { cardKind: "risk", parentId: "t1", text: "staff leave faster than hiring" }),
    card("r2", { cardKind: "risk", parentId: "t2", text: "procurement cannot keep up" }),
    card("o1", { cardKind: "opportunity", parentId: "t1", text: "cross-training" }),
    card("f1", { cardKind: "fear", text: "people will not get the services they need" }),
    card("f2", { cardKind: "fear", text: "everything stays exactly the same" }),
    card("h1", { cardKind: "hope", parentId: "f1", text: "services reach who needs them" }),
    card("h2", { cardKind: "hope", text: "maybe that is ok" }),
  ];
}

// A Session 2 board: a key-change root with two implications under it.
function implicationsBoard(): RippleCard[] {
  return [
    card("k1", { order: "FIRST", text: "fewer staff", plausibility: 4, impact: 5 }),
    card("i1", { order: "SECOND", parentId: "k1", text: "services get rationed" }),
    card("i2", { order: "TERMINAL", parentId: "i1", text: "rural clinics close" }),
  ];
}

describe("pool sources", () => {
  it("names every source and routes it to the week it comes from", () => {
    expect([...POOL_SOURCES]).toEqual([
      "implications",
      "risks",
      "opportunities",
      "stakes",
      "hopes",
      "fears",
      "priorities",
      "outcomes",
      "responses",
      "moves",
      "aspirations",
    ]);
    expect(poolSourceRender("implications")).toBe("implications");
    for (const s of ["risks", "opportunities", "stakes", "hopes", "fears"] as const) {
      expect(poolSourceRender(s)).toBe("synthesis");
    }
    for (const s of ["priorities", "outcomes", "responses", "moves", "aspirations"] as const) {
      expect(poolSourceRender(s)).toBe("commitments");
    }
  });

  // The routing table and the extractor are separate functions, and a source added to one
  // and not the other is the failure this catches: it would pool from whichever board the
  // week selector happened to land on.
  it("routes every declared source somewhere", () => {
    for (const s of POOL_SOURCES) {
      expect(["implications", "synthesis", "commitments"]).toContain(poolSourceRender(s));
    }
  });

  it("gives every source a label a facilitator can read", () => {
    for (const s of POOL_SOURCES) expect(poolSourceLabel(s)).toMatch(/\S/);
  });
});

describe("itemsFromBoard", () => {
  it("pools implications exactly as the existing cohort run does, with their key change", () => {
    const items = itemsFromBoard(implicationsBoard(), "implications", "g1");
    expect(items.map((i) => i.text)).toEqual(["services get rationed", "rural clinics close"]);
    expect(items.every((i) => i.keyChange === "fewer staff")).toBe(true);
    expect(items.every((i) => i.groupId === "g1")).toBe(true);
    // Implications carry no polarity -- they are neither a risk nor an opportunity.
    expect(items.every((i) => i.polarity === undefined)).toBe(true);
  });

  it("pools risks with the theme they sit on as context, and marks their polarity", () => {
    const items = itemsFromBoard(synthesisBoard(), "risks", "g1");
    expect(items.map((i) => i.text).sort()).toEqual([
      "procurement cannot keep up",
      "staff leave faster than hiring",
    ]);
    expect(items.find((i) => i.id === "r1")?.keyChange).toBe("Workforce capacity");
    expect(items.every((i) => i.polarity === "risk")).toBe(true);
  });

  it("labels an unnamed theme by position rather than leaving the context blank", () => {
    const items = itemsFromBoard(synthesisBoard(), "risks", "g1");
    expect(items.find((i) => i.id === "r2")?.keyChange).toBe("Theme 2");
  });

  it("pools opportunities separately from risks", () => {
    const items = itemsFromBoard(synthesisBoard(), "opportunities", "g1");
    expect(items.map((i) => i.id)).toEqual(["o1"]);
    expect(items[0].polarity).toBe("opportunity");
  });

  it("pools stakes as risks and opportunities together, each keeping its own polarity", () => {
    const items = itemsFromBoard(synthesisBoard(), "stakes", "g1");
    expect(items.map((i) => i.id).sort()).toEqual(["o1", "r1", "r2"]);
    expect(items.filter((i) => i.polarity === "risk")).toHaveLength(2);
    expect(items.filter((i) => i.polarity === "opportunity")).toHaveLength(1);
  });

  it("pools fears, including one that was never flipped", () => {
    const items = itemsFromBoard(synthesisBoard(), "fears", "g1");
    expect(items.map((i) => i.id).sort()).toEqual(["f1", "f2"]);
    expect(items.every((i) => i.polarity === "fear")).toBe(true);
  });

  // The flip is step 4: a hope written as a child of the fear it answers. It is a hope and
  // has to pool as one, or "what the rooms hoped for" silently omits everything they
  // actually worked to turn around -- which is the most interesting thing on the board.
  it("pools a flipped hope as a hope, with the fear it answers as its context", () => {
    const items = itemsFromBoard(synthesisBoard(), "hopes", "g1");
    expect(items.map((i) => i.id).sort()).toEqual(["h1", "h2"]);
    const flipped = items.find((i) => i.id === "h1");
    expect(flipped?.keyChange).toBe("people will not get the services they need");
    expect(flipped?.polarity).toBe("hope");
  });

  it("leaves the context empty for a hope written straight on the board", () => {
    const items = itemsFromBoard(synthesisBoard(), "hopes", "g1");
    expect(items.find((i) => i.id === "h2")?.keyChange).toBe("");
  });

  // Older boards wrote hopes and fears UNDER A THEME rather than on the board, and
  // lib/synthesis-shape.ts keeps that placement working rather than migrating it. Group 1
  // on the dev database is such a board: it pooled as having zero hopes while its fears
  // pooled fine, because board.hopesFears holds roots only. A pool that silently drops a
  // whole group's hopes would read as "Group 1 never hoped for anything", which is a
  // finding, and a false one.
  it("pools a hope or fear written on a theme, not just on the board", () => {
    const cards = [
      card("t1", { cardKind: "theme", text: "Workforce capacity" }),
      card("th1", { cardKind: "hope", parentId: "t1", text: "better services" }),
      card("tf1", { cardKind: "fear", parentId: "t1", text: "worse services" }),
    ];
    const hopes = itemsFromBoard(cards, "hopes", "g1");
    expect(hopes.map((i) => i.id)).toEqual(["th1"]);
    expect(hopes[0].keyChange).toBe("Workforce capacity");
    expect(itemsFromBoard(cards, "fears", "g1").map((i) => i.id)).toEqual(["tf1"]);
  });

  it("pools a flip under a theme's fear with that fear as its context", () => {
    const cards = [
      card("t1", { cardKind: "theme", text: "Workforce capacity" }),
      card("tf1", { cardKind: "fear", parentId: "t1", text: "worse services" }),
      card("th1", { cardKind: "hope", parentId: "tf1", text: "services hold up" }),
    ];
    const hopes = itemsFromBoard(cards, "hopes", "g1");
    expect(hopes.map((i) => i.id)).toEqual(["th1"]);
    expect(hopes[0].keyChange).toBe("worse services");
  });

  it("never pools the same hope twice, whichever placement it has", () => {
    const items = itemsFromBoard(synthesisBoard(), "hopes", "g1");
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it("skips blank cards, which a board accumulates from a mis-tap", () => {
    const cards = [
      ...synthesisBoard(),
      card("r9", { cardKind: "risk", parentId: "t1", text: "   " }),
    ];
    expect(itemsFromBoard(cards, "risks", "g1").map((i) => i.id)).not.toContain("r9");
  });

  it("returns nothing, rather than throwing, for a board with none of that kind", () => {
    for (const s of POOL_SOURCES) {
      expect(itemsFromBoard([], s as PoolSource, "g1")).toEqual([]);
    }
    expect(itemsFromBoard(implicationsBoard(), "risks", "g1")).toEqual([]);
    expect(itemsFromBoard(implicationsBoard(), "hopes", "g1")).toEqual([]);
  });

  // What stops an implications pool from reading a Session 3 board is poolSourceRender
  // sending it to the implications week, NOT anything in the extractor: on a synthesis
  // board, implicationSeedCandidates sees risks and hopes as ordinary non-root cards and
  // happily returns them. Asserted so the week routing is understood as load-bearing
  // rather than incidental.
  it("relies on week routing, not the extractor, to keep sources off the wrong board", () => {
    expect(poolSourceRender("implications")).toBe("implications");
    expect(itemsFromBoard(synthesisBoard(), "implications", "g1").length).toBeGreaterThan(0);
  });

  it("is deterministic: the same board pools in the same order twice", () => {
    const a = itemsFromBoard(synthesisBoard(), "stakes", "g1").map((i) => i.id);
    const b = itemsFromBoard(synthesisBoard(), "stakes", "g1").map((i) => i.id);
    expect(a).toEqual(b);
  });
});

// A Session 4 (commitments) board.
//
// Three picks, two of them confirmed as priorities and one left unscored so it is neither
// confirmed nor suggested; outcomes under a priority and under a demoted pick; responses
// under an outcome and one legacy root; two bold moves with their purpose answers; and the
// vision as a STICKY section answer, which is the one piece indexCommitmentsBoard cannot
// see.
function commitmentsBoard(): RippleCard[] {
  return [
    // 1.2 — the picks. `shortlisted` is the group's confirmation.
    card("p1", {
      cardKind: "pick",
      sourceCardId: "w3-r1",
      text: "staff leave faster than hiring",
      description: "it undercuts everything else we might do",
      shortlisted: true,
      plausibility: 5,
      impact: 5,
    }),
    card("p2", {
      cardKind: "pick",
      sourceCardId: "w3-o1",
      text: "cross-training could cover gaps",
      shortlisted: true,
      plausibility: 3,
      impact: 4,
    }),
    // Demoted: carries an outcome but is not one of the three.
    card("p3", {
      cardKind: "pick",
      sourceCardId: "w3-r2",
      text: "procurement cannot keep up",
      shortlisted: false,
    }),
    // 2.1 — outcomes, SECOND under a pick.
    card("oc1", { order: "SECOND", parentId: "p1", cardKind: "outcome", text: "we retain the staff we have" }),
    card("oc2", { order: "SECOND", parentId: "p2", cardKind: "outcome", text: "any team can cover any shift" }),
    card("oc3", { order: "SECOND", parentId: "p3", cardKind: "outcome", text: "we buy what we need in time" }),
    // 2.2 — responses, TERMINAL under an outcome, plus one legacy ROOT.
    card("rs1", { order: "TERMINAL", parentId: "oc1", cardKind: "response", text: "fund retention bonuses" }),
    card("rs2", { order: "TERMINAL", parentId: "oc2", cardKind: "response", text: "build a shared skills matrix" }),
    card("rs3", { order: "FIRST", cardKind: "response", text: "an idea from the old untagged wall" }),
    // 3.2 — the bold moves and their purpose answers.
    card("d1", { order: "FIRST", cardKind: "direction", text: "stand up a regional workforce compact" }),
    card("d2", { order: "FIRST", cardKind: "direction", text: "put community orgs on the payroll" }),
    card("sh1", {
      order: "SECOND",
      parentId: "d1",
      cardKind: "sharpen",
      section: PURPOSE_FIELD,
      text: "it is how public health keeps the capacity to act",
    }),
    // 3.1 — the vision, a STICKY section answer.
    card("v1", {
      order: "STICKY",
      section: COMMITMENTS_KEY_VISION,
      text: "Public health becomes the connective tissue communities rely on.",
    }),
  ];
}

describe("itemsFromBoard — Session 4", () => {
  it("names a purpose field that DIRECTION_FIELDS actually has", () => {
    // PURPOSE_FIELD is matched by key so reordering the fields cannot change what a move is
    // grouped against. That only holds while the key exists.
    expect(DIRECTION_FIELDS.map((f) => f.key)).toContain(PURPOSE_FIELD);
  });

  it("pools THE THREE priorities, not every pick that was scored", () => {
    const items = itemsFromBoard(commitmentsBoard(), "priorities", "g1");
    expect(items.map((i) => i.text)).toEqual([
      "staff leave faster than hiring",
      "cross-training could cover gaps",
    ]);
    // The unscored, unconfirmed pick is neither confirmed nor suggested, so it is not one.
    expect(items.map((i) => i.text)).not.toContain("procurement cannot keep up");
  });

  it("gives a priority the group's own note on why it needs attention as context", () => {
    const items = itemsFromBoard(commitmentsBoard(), "priorities", "g1");
    expect(items[0].keyChange).toBe("it undercuts everything else we might do");
    // No note written is an empty context, never the string "null".
    expect(items[1].keyChange).toBe("");
  });

  it("leaves a priority's polarity undefined, because a pick cannot say which it was", () => {
    const items = itemsFromBoard(commitmentsBoard(), "priorities", "g1");
    expect(items.every((i) => i.polarity === undefined)).toBe(true);
  });

  it("pools outcomes under their priority, and keeps one under a demoted pick", () => {
    const items = itemsFromBoard(commitmentsBoard(), "outcomes", "g1");
    expect(items.map((i) => i.text)).toEqual([
      "we retain the staff we have",
      "any team can cover any shift",
      "we buy what we need in time",
    ]);
    // The priority it was written for is the context.
    expect(items[0].keyChange).toBe("staff leave faster than hiring");
    // A demoted priority's outcome is intact and comes back if it is promoted again, so
    // pooling must not lose it — a group whose priorities all moved would otherwise read as
    // having written nothing.
    expect(items[2].keyChange).toBe("procurement cannot keep up");
  });

  it("never pools one outcome twice, though priorities are walked before the other picks", () => {
    const items = itemsFromBoard(commitmentsBoard(), "outcomes", "g1");
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it("pools responses with the outcome they advance, and keeps a legacy root", () => {
    const items = itemsFromBoard(commitmentsBoard(), "responses", "g1");
    const byText = new Map(items.map((i) => [i.text, i.keyChange]));
    expect(byText.get("fund retention bonuses")).toBe("we retain the staff we have");
    expect(byText.get("build a shared skills matrix")).toBe("any team can cover any shift");
    // A root response came from the untagged wall and sits under no outcome: pooled with an
    // empty context rather than dropped.
    expect(byText.get("an idea from the old untagged wall")).toBe("");
  });

  it("pools bold moves with the part of the vision they advance", () => {
    const items = itemsFromBoard(commitmentsBoard(), "moves", "g1");
    expect(items.map((i) => i.text)).toEqual([
      "stand up a regional workforce compact",
      "put community orgs on the payroll",
    ]);
    expect(items[0].keyChange).toBe("it is how public health keeps the capacity to act");
    // A move whose purpose is unanswered still pools — it is the move that matters.
    expect(items[1].keyChange).toBe("");
  });

  it("pools the vision, which is a section answer and not a card kind", () => {
    const items = itemsFromBoard(commitmentsBoard(), "aspirations", "g1");
    expect(items.map((i) => i.text)).toEqual([
      "Public health becomes the connective tissue communities rely on.",
    ]);
    expect(items[0].groupId).toBe("g1");
  });

  it("does not mistake another section's answers for the vision", () => {
    const cards = [
      card("n1", { order: "STICKY", section: "w4-notes", text: "a reconnect note" }),
      card("v1", { order: "STICKY", section: COMMITMENTS_KEY_VISION, text: "the real vision" }),
    ];
    const items = itemsFromBoard(cards, "aspirations", "g1");
    expect(items.map((i) => i.text)).toEqual(["the real vision"]);
  });

  it("ignores parked and blank Session 4 material", () => {
    const cards = [
      card("v1", { order: "STICKY", section: COMMITMENTS_KEY_VISION, text: "   " }),
      card("v2", { order: "STICKY", section: COMMITMENTS_KEY_VISION, text: "kept", parked: false }),
      card("v3", { order: "STICKY", section: COMMITMENTS_KEY_VISION, text: "set aside", parked: true }),
      card("d1", { order: "FIRST", cardKind: "direction", text: "" }),
    ];
    expect(itemsFromBoard(cards, "aspirations", "g1").map((i) => i.text)).toEqual(["kept"]);
    expect(itemsFromBoard(cards, "moves", "g1")).toEqual([]);
  });

  it("returns nothing, rather than throwing, when a Session 4 board is untouched", () => {
    for (const s of ["priorities", "outcomes", "responses", "moves", "aspirations"] as const) {
      expect(itemsFromBoard([], s, "g1")).toEqual([]);
    }
  });

  it("is deterministic: the same Session 4 board pools in the same order twice", () => {
    for (const s of ["priorities", "outcomes", "responses", "moves", "aspirations"] as const) {
      const a = itemsFromBoard(commitmentsBoard(), s, "g1").map((i) => i.id);
      const b = itemsFromBoard(commitmentsBoard(), s, "g1").map((i) => i.id);
      expect(a).toEqual(b);
    }
  });
});
