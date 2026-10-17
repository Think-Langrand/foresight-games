import { describe, it, expect } from "vitest";
import {
  POOL_SOURCES,
  itemsFromBoard,
  poolSourceLabel,
  poolSourceRender,
  type PoolSource,
} from "./cohort-pool-shape";
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
    section: null,
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
    ]);
    expect(poolSourceRender("implications")).toBe("implications");
    for (const s of POOL_SOURCES.filter((s) => s !== "implications")) {
      expect(poolSourceRender(s)).toBe("synthesis");
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
