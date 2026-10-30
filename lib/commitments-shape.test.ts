import { describe, it, expect } from "vitest";
import type { CardOrder, RippleCard } from "./ripples-types";
import {
  MAX_BOLD_MOVES,
  MAX_PICKS_PER_KIND,
  allOutcomes,
  isPicked,
  isPriority,
  isStillOpen,
  outcomeCoverage,
  outcomesFor,
  prioritySlots,
  priorities,
  replaceCandidates,
  responsesFor,
  strayOutcomes,
  MILESTONES_PER_MOVE,
  PERIODS,
  PERIOD_KEYS,
  RESPONSES_FOR_DONE,
  canAddMilestone,
  indexCommitmentsBoard,
  isCommitmentPeriod,
  milestoneCount,
  milestonesFor,
  strandedMilestones,
} from "./commitments-shape";

function card(
  id: string,
  order: CardOrder,
  parentId: string | null,
  seq: number,
  extra?: Partial<RippleCard>
): RippleCard {
  return {
    id,
    teamId: "T1",
    authorPlayerId: null,
    order,
    parentId,
    sort: 0,
    text: `${id}-text`,
    lensId: null,
    flagged: false,
    greyed: false,
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
    createdTime: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
    ...extra,
  };
}

const response = (id: string, seq: number, extra?: Partial<RippleCard>) =>
  card(id, "FIRST", null, seq, { cardKind: "response", ...extra });

const milestone = (
  id: string,
  parentId: string,
  period: string | null,
  seq: number,
  extra?: Partial<RippleCard>
) => card(id, "SECOND", parentId, seq, { cardKind: "milestone", section: period, ...extra });

describe("the period vocabulary", () => {
  // A LOCK TEST. These five strings are written onto every milestone's `section` and are the
  // only link back to its column, so renaming one orphans every card ever filed under it.
  // If this test fails, the fix is almost never to update the test.
  it("is exactly the five documented keys, in order", () => {
    expect(PERIOD_KEYS).toEqual(["w4-p1", "w4-p2", "w4-p3", "w4-p4", "w4-p5"]);
  });

  it("labels a ten-year span in two-year steps", () => {
    expect(PERIODS.map((p) => p.label)).toEqual([
      "2027–28",
      "2029–30",
      "2031–32",
      "2033–34",
      "2035–36",
    ]);
  });

  it("recognises its own keys and nothing else", () => {
    for (const k of PERIOD_KEYS) expect(isCommitmentPeriod(k)).toBe(true);
    // An off-by-one key, a worksheet section key, and the shapes a bad write arrives in.
    for (const bad of ["", "w4-p0", "w4-p6", "sec_a1b2c3d4", "assess-unclear", "W4-P1"]) {
      expect(isCommitmentPeriod(bad)).toBe(false);
    }
    for (const bad of [null, undefined, 1, {}]) expect(isCommitmentPeriod(bad)).toBe(false);
  });

});

describe("indexCommitmentsBoard", () => {
  it("buckets responses and their milestones by move and period", () => {
    const board = indexCommitmentsBoard([
      response("r1", 1),
      response("r2", 2),
      milestone("m1", "r1", "w4-p1", 3),
      milestone("m2", "r1", "w4-p1", 4),
      milestone("m3", "r1", "w4-p5", 5),
      milestone("m4", "r2", "w4-p3", 6),
    ]);

    expect(board.responses.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(board.orphans).toEqual([]);
    expect(milestonesFor(board, "r1", "w4-p1").map((c) => c.id)).toEqual(["m1", "m2"]);
    expect(milestonesFor(board, "r1", "w4-p5").map((c) => c.id)).toEqual(["m3"]);
    expect(milestonesFor(board, "r1", "w4-p3")).toEqual([]);
    expect(milestonesFor(board, "r2", "w4-p3").map((c) => c.id)).toEqual(["m4"]);
    expect(milestoneCount(board, "r1")).toBe(3);
    expect(milestoneCount(board, "r2")).toBe(1);
    expect(milestoneCount(board, "nobody")).toBe(0);
  });

  it("leaves step 1's answers alone", () => {
    // The aspiration prompts are authored worksheet sections, so their answers are stickies
    // carrying a section key. This board must not mistake one for a milestone.
    const board = indexCommitmentsBoard([
      card("a1", "STICKY", null, 1, { section: "sec_a1b2c3d4" }),
      card("a2", "STICKY", null, 2, { section: "w4-p1" }),
      response("r1", 3),
    ]);
    expect(board.responses.map((r) => r.id)).toEqual(["r1"]);
    expect(board.orphans).toEqual([]);
    expect(board.milestones.size).toBe(0);
  });

  it("sets aside a parked response rather than putting it on the wall", () => {
    const board = indexCommitmentsBoard([response("r1", 1), response("r2", 2, { parked: true })]);
    expect(board.responses.map((r) => r.id)).toEqual(["r1"]);
    expect(board.parked.map((r) => r.id)).toEqual(["r2"]);
    expect(board.orphans).toEqual([]);
  });

  it("orders responses by sort, then creation time", () => {
    const board = indexCommitmentsBoard([
      response("c", 3, { sort: 3000 }),
      response("a", 1, { sort: 1000 }),
      response("b", 2, { sort: 2000 }),
      // Two at the same sort fall back to creation order, which is how an unreordered
      // board reads: every card starts at sort 0.
      response("e", 5, { sort: 0 }),
      response("d", 4, { sort: 0 }),
    ]);
    expect(board.responses.map((r) => r.id)).toEqual(["d", "e", "a", "b", "c"]);
  });

  it("orders the cards inside a period cell by sort, then creation time", () => {
    const board = indexCommitmentsBoard([
      response("r1", 1),
      milestone("late", "r1", "w4-p1", 2, { sort: 2000 }),
      milestone("early", "r1", "w4-p1", 3, { sort: 1000 }),
    ]);
    expect(milestonesFor(board, "r1", "w4-p1").map((c) => c.id)).toEqual(["early", "late"]);
  });
});

// A card in the database that no view draws is visible to nobody and deletable by nobody.
// Every one of these would be exactly that, so the board surfaces them instead.
describe("indexCommitmentsBoard orphans rather than drops", () => {
  it("a response hung off something", () => {
    const board = indexCommitmentsBoard([
      response("r1", 1),
      card("r2", "SECOND", "r1", 2, { cardKind: "response" }),
    ]);
    expect(board.responses.map((r) => r.id)).toEqual(["r1"]);
    expect(board.orphans.map((c) => c.id)).toEqual(["r2"]);
  });

  it("a milestone with no move above it", () => {
    const board = indexCommitmentsBoard([
      response("r1", 1),
      card("m1", "FIRST", null, 2, { cardKind: "milestone", section: "w4-p1" }),
    ]);
    expect(board.orphans.map((c) => c.id)).toEqual(["m1"]);
    expect(board.milestones.size).toBe(0);
  });

  it("a milestone with no period, or an unrecognised one", () => {
    const board = indexCommitmentsBoard([
      response("r1", 1),
      milestone("none", "r1", null, 2),
      milestone("junk", "r1", "w4-p9", 3),
      milestone("good", "r1", "w4-p2", 4),
    ]);
    expect(board.orphans.map((c) => c.id)).toEqual(["none", "junk"]);
    expect(milestoneCount(board, "r1")).toBe(1);
    expect(milestonesFor(board, "r1", "w4-p2").map((c) => c.id)).toEqual(["good"]);
  });

  it("a milestone under a card that is not a live response", () => {
    const board = indexCommitmentsBoard([
      response("r1", 1),
      response("parkedMove", 2, { parked: true }),
      milestone("underMilestone", "m1", "w4-p1", 3),
      milestone("underParked", "parkedMove", "w4-p1", 4),
      milestone("underNothing", "ghost", "w4-p1", 5),
      milestone("m1", "r1", "w4-p1", 6),
    ]);
    expect(board.orphans.map((c) => c.id).sort()).toEqual([
      "underMilestone",
      "underNothing",
      "underParked",
    ]);
    // The one good milestone survives its neighbours being broken.
    expect(milestonesFor(board, "r1", "w4-p1").map((c) => c.id)).toEqual(["m1"]);
  });
});

describe("bold moves", () => {
  it("are the shortlisted responses, in the wall's own order", () => {
    // Out-of-order sort values on purpose: the lanes read down in wall order, so if these
    // two ever disagree a lane's position stops matching its card's.
    const board = indexCommitmentsBoard([
      response("third", 1, { sort: 3000, shortlisted: true }),
      response("first", 2, { sort: 1000, shortlisted: true }),
      response("notPicked", 3, { sort: 1500 }),
      response("second", 4, { sort: 2000, shortlisted: true }),
    ]);
    expect(board.boldMoves.map((m) => m.id)).toEqual(["first", "second", "third"]);
    expect(board.boldMoves).toHaveLength(MAX_BOLD_MOVES);
  });

  it("report a fourth pick rather than hiding it", () => {
    // The cap is enforced in the UI, not by the database: two people ticking at once can
    // land a fourth. The shape's job is to say so.
    const board = indexCommitmentsBoard(
      ["a", "b", "c", "d"].map((id, i) => response(id, i + 1, { sort: (i + 1) * 1000, shortlisted: true }))
    );
    // The shape never hides an over-pick: the UI holds the cap, so a concurrent fourth
    // tick has to be visible rather than silently trimmed here.
    expect(board.boldMoves).toHaveLength(4);
    expect(board.boldMoves.length).toBeGreaterThan(MAX_BOLD_MOVES);
  });

  it("keep a stranded move's milestones, so un-ticking is reversible", () => {
    // Un-ticking must not destroy work. The cards stay under their response and come back
    // the moment it is picked again; they are reported so the UI can say where they went.
    const cards = [
      response("picked", 1, { sort: 1000, shortlisted: true }),
      response("dropped", 2, { sort: 2000 }),
      milestone("kept", "picked", "w4-p1", 3),
      milestone("stranded", "dropped", "w4-p2", 4),
    ];
    const board = indexCommitmentsBoard(cards);

    expect(board.orphans).toEqual([]);
    expect(milestoneCount(board, "dropped")).toBe(1);
    expect(strandedMilestones(board).map((c) => c.id)).toEqual(["stranded"]);
    expect(milestoneCount(board, "picked")).toBe(1); // only the picked lane is on the timeline

    // Tick it back and the milestone is simply there again.
    const repicked = indexCommitmentsBoard(
      cards.map((c) => (c.id === "dropped" ? { ...c, shortlisted: true } : c))
    );
    expect(strandedMilestones(repicked)).toEqual([]);
    expect(milestonesFor(repicked, "dropped", "w4-p2").map((c) => c.id)).toEqual(["stranded"]);
  });
});

describe("the five-per-move cap", () => {
  it("counts the whole span, not a cell, and closes at the cap", () => {
    const full = [
      response("r1", 1, { shortlisted: true }),
      // Clustered, not one per period: four in the first bucket and one in the last is a
      // legal shape and must still count as five.
      milestone("m1", "r1", "w4-p1", 2),
      milestone("m2", "r1", "w4-p1", 3),
      milestone("m3", "r1", "w4-p1", 4),
      milestone("m4", "r1", "w4-p1", 5),
      milestone("m5", "r1", "w4-p5", 6),
    ];
    const atCap = indexCommitmentsBoard(full);
    expect(milestoneCount(atCap, "r1")).toBe(MILESTONES_PER_MOVE);
    expect(canAddMilestone(atCap, "r1")).toBe(false);

    const underCap = indexCommitmentsBoard(full.slice(0, -1));
    expect(milestoneCount(underCap, "r1")).toBe(4);
    expect(canAddMilestone(underCap, "r1")).toBe(true);

    // A move with nothing on it, and a move that does not exist, both have room.
    expect(canAddMilestone(atCap, "nobody")).toBe(true);
  });

  it("is per move, so one full lane does not close another", () => {
    const board = indexCommitmentsBoard([
      response("full", 1, { sort: 1000, shortlisted: true }),
      response("empty", 2, { sort: 2000, shortlisted: true }),
      ...[1, 2, 3, 4, 5].map((n) => milestone(`m${n}`, "full", "w4-p1", n + 2)),
    ]);
    expect(canAddMilestone(board, "full")).toBe(false);
    expect(canAddMilestone(board, "empty")).toBe(true);
  });
});

describe("an empty board", () => {
  it("reads as empty everywhere rather than throwing", () => {
    const board = indexCommitmentsBoard([]);
    expect(board.responses).toEqual([]);
    expect(board.looseResponses).toEqual([]);
    expect(board.outcomes.size).toBe(0);
    expect(board.responsesByOutcome.size).toBe(0);
    expect(board.boldMoves).toEqual([]);
    expect(board.parked).toEqual([]);
    expect(board.orphans).toEqual([]);
    expect(board.milestones.size).toBe(0);
    expect(prioritySlots(board)).toEqual([]);
    expect(allOutcomes(board)).toEqual([]);
    expect(strayOutcomes(board)).toEqual([]);
    expect(outcomeCoverage(board)).toBe(0);
    expect(milestoneCount(board, "anything")).toBe(0);
    expect(strandedMilestones(board)).toEqual([]);
  });
});

describe("step 5, the handoff marks", () => {
  const mark = (id: string, kind: "pick" | "settled", sourceId: string | null, seq: number) =>
    card(id, "FIRST", null, seq, { cardKind: kind, sourceCardId: sourceId });

  it("keys both kinds by the earlier card they point at", () => {
    const board = indexCommitmentsBoard([
      mark("p1", "pick", "s3-risk-a", 1),
      mark("p2", "pick", "s3-opp-b", 2),
      mark("x1", "settled", "s1-unclear-a", 3),
    ]);
    expect([...board.picks.keys()].sort()).toEqual(["s3-opp-b", "s3-risk-a"]);
    expect([...board.settled.keys()]).toEqual(["s1-unclear-a"]);
    expect(board.orphans).toEqual([]);
    expect(isPicked(board, "s3-risk-a")).toBe(true);
    expect(isPicked(board, "never-picked")).toBe(false);
  });

  it("orphans a mark that points at nothing", () => {
    // A mark with no source is a finding about nothing, and no view can draw it.
    const board = indexCommitmentsBoard([
      mark("good", "pick", "s3-risk-a", 1),
      mark("bad", "pick", null, 2),
      mark("alsoBad", "settled", null, 3),
    ]);
    expect(board.picks.size).toBe(1);
    expect(board.settled.size).toBe(0);
    expect(board.orphans.map((c) => c.id).sort()).toEqual(["alsoBad", "bad"]);
  });

  it("treats an uncertainty as STILL OPEN until the group says otherwise", () => {
    // The default is the whole point: a group that never opens step 5 hands over every
    // uncertainty it ever wrote, which is honest, where an empty star list would not be.
    const empty = indexCommitmentsBoard([]);
    expect(isStillOpen(empty, "s1-unclear-a")).toBe(true);

    const board = indexCommitmentsBoard([mark("x", "settled", "s1-unclear-a", 1)]);
    expect(isStillOpen(board, "s1-unclear-a")).toBe(false);
    expect(isStillOpen(board, "s1-unclear-b")).toBe(true);
  });


  it("orphans the loser when one source somehow carries two marks of a kind", () => {
    // 0018's unique index makes this unreachable from the UI, but an earlier version let the
    // older mark fall into NO bucket, which is the exact loss this module's orphan contract
    // exists to prevent.
    const board = indexCommitmentsBoard([
      mark("older", "pick", "same-source", 1),
      mark("newer", "pick", "same-source", 2),
    ]);
    expect(board.picks.get("same-source")?.id).toBe("newer");
    expect(board.orphans.map((c) => c.id)).toEqual(["older"]);
  });

  it("does not confuse a pick with a settled mark on the same id", () => {
    const board = indexCommitmentsBoard([
      mark("p", "pick", "shared", 1),
      mark("x", "settled", "shared", 2),
    ]);
    // 0018's unique index makes this impossible on one board, but the shape stays total.
    expect(isPicked(board, "shared")).toBe(true);
    expect(isStillOpen(board, "shared")).toBe(false);
  });
});

// Act 1.2: the scores suggest three, the group confirms.
describe("prioritySlots", () => {
  const pick = (
    id: string,
    seq: number,
    p: number | null,
    i: number | null,
    extra?: Partial<RippleCard>
  ) =>
    card(id, "FIRST", null, seq, {
      cardKind: "pick",
      sourceCardId: `src-${id}`,
      plausibility: p,
      impact: i,
      ...extra,
    });

  it("suggests the three highest-scoring picks when nothing is confirmed", () => {
    const board = indexCommitmentsBoard([
      pick("a", 1, 5, 5),
      pick("b", 2, 4, 4),
      pick("c", 3, 3, 3),
      pick("d", 4, 2, 2),
    ]);
    expect(prioritySlots(board)).toEqual([
      { card: board.picks.get("src-a"), status: "suggested" },
      { card: board.picks.get("src-b"), status: "suggested" },
      { card: board.picks.get("src-c"), status: "suggested" },
    ]);
    expect(isPriority(board, "src-c")).toBe(true);
    expect(isPriority(board, "src-d")).toBe(false);
    expect(replaceCandidates(board).map((c) => c.id)).toEqual(["d"]);
  });

  it("never suggests an unscored pick, so there can be fewer than three", () => {
    const board = indexCommitmentsBoard([
      pick("a", 1, 5, 5),
      pick("half", 2, 3, null),
      pick("none", 3, null, null),
    ]);
    expect(prioritySlots(board).map((s) => s.card.id)).toEqual(["a"]);
    expect(replaceCandidates(board)).toEqual([]);
  });

  it("gives a confirmed pick a slot whatever it scored, but orders every slot by rank", () => {
    // CONFIRMING WINS SELECTION, NOT POSITION. `small` is a 1x1 the group confirmed: it
    // takes a slot over `low`, a 2x2 it did not, which is the whole point of confirming.
    // What it does not do is float above the suggestions — the rows read strongest first
    // and the badge is the only thing saying which slot is the group's own.
    const board = indexCommitmentsBoard([
      pick("big", 1, 5, 5),
      pick("mid", 2, 4, 4),
      pick("small", 3, 1, 1, { shortlisted: true }),
      pick("low", 4, 2, 2),
    ]);
    expect(prioritySlots(board)).toEqual([
      { card: board.picks.get("src-big"), status: "suggested" },
      { card: board.picks.get("src-mid"), status: "suggested" },
      { card: board.picks.get("src-small"), status: "confirmed" },
    ]);
    expect(priorities(board).map((c) => c.id)).toEqual(["big", "mid", "small"]);
    // The 2x2 it did not confirm stays out, outscoring the 1x1 or not.
    expect(isPriority(board, "src-low")).toBe(false);
  });

  it("does not move a pick the group did not touch when another is confirmed", () => {
    // The reason the rows order on rank alone. Status used to be said by position as well
    // as by the chip, so confirming ANY pick re-sorted it into a block above the
    // suggestions and shoved its neighbours down a row for reasons nobody could see. Undo
    // made it worse: walking back a Replace moves three cards between the blocks one at a
    // time. Rank does not change when a pick is confirmed, so neither does the order.
    const scores = [
      ["a", 5, 5],
      ["b", 4, 4],
      ["c", 3, 3],
    ] as const;
    const order = (confirmedId?: string) =>
      prioritySlots(
        indexCommitmentsBoard(
          scores.map(([id, p, i], n) =>
            pick(id, n + 1, p, i, id === confirmedId ? { shortlisted: true } : undefined)
          )
        )
      ).map((s) => s.card.id);

    expect(order()).toEqual(["a", "b", "c"]);
    // Confirming the middle one, the weakest one, or the strongest one: same rows, same
    // order, every time. Only the status changes.
    expect(order("b")).toEqual(["a", "b", "c"]);
    expect(order("c")).toEqual(["a", "b", "c"]);
    expect(order("a")).toEqual(["a", "b", "c"]);
  });

  it("keeps a confirmed pick in its slot even after its scores are cleared, sunk to the end", () => {
    const board = indexCommitmentsBoard([
      pick("kept", 1, null, null, { shortlisted: true }),
      pick("a", 2, 5, 5),
    ]);
    // Still holds a slot: clearing the scores does not evict what the group confirmed.
    // But an unscored card has no rank, so it reads last rather than at a position that
    // would imply a score it does not have.
    expect(prioritySlots(board).map((s) => [s.card.id, s.status])).toEqual([
      ["a", "suggested"],
      ["kept", "confirmed"],
    ]);
  });

  it("stops suggesting once three are confirmed, and reports a fourth rather than hiding it", () => {
    const three = indexCommitmentsBoard([
      pick("a", 1, 1, 1, { shortlisted: true }),
      pick("b", 2, 1, 2, { shortlisted: true }),
      pick("c", 3, 2, 1, { shortlisted: true }),
      pick("best", 4, 5, 5),
    ]);
    expect(prioritySlots(three).every((s) => s.status === "confirmed")).toBe(true);
    expect(prioritySlots(three)).toHaveLength(3);
    expect(replaceCandidates(three).map((c) => c.id)).toEqual(["best"]);

    const four = indexCommitmentsBoard([
      pick("a", 1, 1, 1, { shortlisted: true }),
      pick("b", 2, 1, 2, { shortlisted: true }),
      pick("c", 3, 2, 1, { shortlisted: true }),
      pick("d", 4, 5, 5, { shortlisted: true }),
    ]);
    expect(prioritySlots(four)).toHaveLength(4);
  });

  it("does not extend the cut on a tie: a suggestion is a suggestion", () => {
    const board = indexCommitmentsBoard([
      pick("a", 1, 5, 5),
      pick("b", 2, 4, 5),
      pick("c", 3, 3, 5),
      pick("d", 4, 3, 5),
    ]);
    expect(prioritySlots(board)).toHaveLength(3);
  });
});

// Acts 2.1 and 2.2: outcomes under a priority, responses under an outcome.
describe("outcomes and nested responses", () => {
  const pick = (id: string, seq: number, p: number, i: number, extra?: Partial<RippleCard>) =>
    card(id, "FIRST", null, seq, {
      cardKind: "pick",
      sourceCardId: `src-${id}`,
      plausibility: p,
      impact: i,
      ...extra,
    });
  const outcome = (id: string, parentId: string, seq: number, extra?: Partial<RippleCard>) =>
    card(id, "SECOND", parentId, seq, { cardKind: "outcome", ...extra });
  const nested = (id: string, parentId: string, seq: number, extra?: Partial<RippleCard>) =>
    card(id, "TERMINAL", parentId, seq, { cardKind: "response", ...extra });

  it("files outcomes under their pick and responses under their outcome, in order", () => {
    const board = indexCommitmentsBoard([
      pick("p1", 1, 5, 5),
      outcome("o2", "p1", 3, { sort: 2000 }),
      outcome("o1", "p1", 2, { sort: 1000 }),
      nested("r2", "o1", 5, { sort: 2000 }),
      nested("r1", "o1", 4, { sort: 1000 }),
      nested("r3", "o2", 6),
    ]);
    expect(outcomesFor(board, "p1").map((c) => c.id)).toEqual(["o1", "o2"]);
    expect(responsesFor(board, "o1").map((c) => c.id)).toEqual(["r1", "r2"]);
    expect(responsesFor(board, "o2").map((c) => c.id)).toEqual(["r3"]);
    // The pool is every response, so counts and the rail see all three.
    expect(board.responses.map((c) => c.id)).toEqual(["r1", "r2", "r3"]);
    expect(board.looseResponses).toEqual([]);
    expect(board.orphans).toEqual([]);
  });

  it("keeps a legacy root response on the loose wall, ahead of the nested ones", () => {
    const board = indexCommitmentsBoard([
      pick("p1", 1, 5, 5),
      outcome("o1", "p1", 2),
      nested("r1", "o1", 3),
      response("loose", 4),
    ]);
    expect(board.looseResponses.map((c) => c.id)).toEqual(["loose"]);
    expect(board.responses.map((c) => c.id)).toEqual(["loose", "r1"]);
  });

  it("orphans an outcome under something that is not a live pick, and its responses with it", () => {
    const board = indexCommitmentsBoard([
      response("r0", 1),
      outcome("o-under-response", "r0", 2),
      outcome("o-under-nothing", "ghost", 3),
      nested("r-under-ghost", "o-under-nothing", 4),
    ]);
    expect(board.outcomes.size).toBe(0);
    expect(board.orphans.map((c) => c.id).sort()).toEqual([
      "o-under-nothing",
      "o-under-response",
      "r-under-ghost",
    ]);
  });

  it("reads outcomes in slot order, and reports the ones under a de-prioritised pick", () => {
    const board = indexCommitmentsBoard([
      pick("low", 1, 1, 1),
      pick("a", 2, 5, 5),
      pick("b", 3, 4, 4),
      pick("c", 4, 3, 3),
      outcome("o-low", "low", 5),
      outcome("o-a", "a", 6),
      outcome("o-c", "c", 7),
    ]);
    expect(allOutcomes(board).map((c) => c.id)).toEqual(["o-a", "o-c"]);
    expect(strayOutcomes(board).map((s) => [s.pick.id, s.outcomes.map((o) => o.id)])).toEqual([
      ["low", ["o-low"]],
    ]);
    // Two of three priorities carry an outcome.
    expect(outcomeCoverage(board)).toBe(2);
  });
});
