import { describe, expect, it } from "vitest";
import { buildProjectDeck, type ProjectDeckInput } from "@/lib/project-deck";
import type { GroupSummary, SummaryDirection, SummaryPlacement } from "@/lib/group-summary";

// A GroupSummary is wide and this file only exercises a few of its fields, so the fixture
// fills the rest with the empty shape rather than making every test carry them.
const EMPTY: GroupSummary = {
  groupName: "",
  scenarioTitle: null,
  has: { assessment: false, implications: false, synthesis: false, commitments: false },
  keyChanges: [],
  orderCounts: [],
  totalImplicationCards: 0,
  themes: [],
  riskCount: 0,
  opportunityCount: 0,
  clusterFlow: { themes: [], links: [], roots: [] },
  unclustered: 0,
  flips: [],
  standaloneHopes: [],
  gaps: { stakes: 0, hopes: 0, fears: 0, themesWithoutStakes: 0 },
  unsettled: [],
  settledCount: 0,
  worldReading: [],
  grounding: [],
  overlook: [],
  outcomes: [],
  outcomesByPriority: [],
  vision: [],
  together: [],
  placements: [],
  priorities: [],
  disputed: [],
  directions: [],
  boldMoves: [],
} as unknown as GroupSummary;

const move = (id: string, text: string): SummaryDirection => ({ id, text, fields: [] });

const place = (
  id: string,
  text: string,
  kind: "risk" | "opportunity",
  p: number | null,
  i: number | null,
  confirmed = false
): SummaryPlacement => ({
  id,
  text,
  kind,
  plausibility: p,
  impact: i,
  rank: p !== null && i !== null ? p * i : null,
  note: null,
  confirmed,
});

const group = (name: string, over: Partial<GroupSummary>) => ({
  summary: { ...EMPTY, groupName: name, ...over } as GroupSummary,
  scenarioRef: `${name.toLowerCase().replace(/\W+/g, "-")}-ref`,
  scenarioTitle: `${name} scenario`,
});

const input = (groups: ProjectDeckInput["groups"]): ProjectDeckInput => ({
  project: { slug: "public-health", name: "Public Health" },
  groups,
  scenarios: [],
  drivers: [],
});

describe("buildProjectDeck · bold moves", () => {
  it("collects every move there is and never pads a group to three", () => {
    // THE REAL SHAPE OF THIS PROGRAM: 3/2/1/1, not 3/3/3/3. A deck that assumes three per
    // group prints an empty card for two of the four groups, which reads as a group that
    // failed rather than a group that ran out of time.
    const deck = buildProjectDeck(
      input([
        group("G1", { directions: [move("a", "Move A"), move("b", "Move B"), move("c", "Move C")] }),
        group("G2", { directions: [move("d", "Move D"), move("e", "Move E")] }),
        group("G3", { directions: [move("f", "Move F")] }),
        group("G4", { directions: [] }),
      ])
    );

    expect(deck.aggregate.boldMoves).toHaveLength(6);
    expect(deck.aggregate.boldMoves.map((m) => m.text)).toEqual([
      "Move A",
      "Move B",
      "Move C",
      "Move D",
      "Move E",
      "Move F",
    ]);
    // Each one says whose it is, because the whole point of the slide is reading across.
    expect(deck.aggregate.boldMoves.map((m) => m.groupName)).toEqual([
      "G1",
      "G1",
      "G1",
      "G2",
      "G2",
      "G3",
    ]);
    // A group with none contributes none; it is not represented by a blank.
    expect(deck.aggregate.boldMoves.some((m) => m.groupName === "G4")).toBe(false);
  });

  it("counts moves per group so a slide can say 3/2/1/1 without recounting", () => {
    const deck = buildProjectDeck(
      input([
        group("G1", { directions: [move("a", "A"), move("b", "B")] }),
        group("G2", { directions: [] }),
      ])
    );
    expect(deck.aggregate.movesByGroup).toEqual([
      { groupName: "G1", count: 2 },
      { groupName: "G2", count: 0 },
    ]);
  });
});

describe("buildProjectDeck · priorities", () => {
  it("carries confirmed-versus-suggested, because only one group ratified its three", () => {
    // In the real program exactly one group pressed Keep. Flattening that away would tell a
    // committee that four rooms each chose three priorities, when three of them are the
    // ranking's choice that nobody confirmed.
    const deck = buildProjectDeck(
      input([
        group("G1", { priorities: [place("p1", "Chosen", "risk", 5, 5, true)] }),
        group("G2", { priorities: [place("p2", "Ranked", "risk", 5, 5, false)] }),
      ])
    );
    expect(deck.aggregate.priorities).toEqual([
      expect.objectContaining({ groupName: "G1", text: "Chosen", confirmed: true, rank: 25 }),
      expect.objectContaining({ groupName: "G2", text: "Ranked", confirmed: false, rank: 25 }),
    ]);
    expect(deck.aggregate.anyConfirmed).toBe(true);
    expect(deck.aggregate.allConfirmed).toBe(false);
  });

  it("reports allConfirmed only when every priority was ratified", () => {
    const deck = buildProjectDeck(
      input([group("G1", { priorities: [place("p", "x", "risk", 1, 1, true)] })])
    );
    expect(deck.aggregate.allConfirmed).toBe(true);
  });
});

describe("buildProjectDeck · stakes across groups", () => {
  it("ranks every group's risks and opportunities together, strongest first", () => {
    const deck = buildProjectDeck(
      input([
        group("G1", {
          placements: [place("a", "weak", "risk", 2, 2), place("b", "strong", "opportunity", 5, 5)],
        }),
        group("G2", { placements: [place("c", "middling", "risk", 4, 4)] }),
      ])
    );
    expect(deck.aggregate.stakes.map((s) => [s.text, s.rank, s.groupName])).toEqual([
      ["strong", 25, "G1"],
      ["middling", 16, "G2"],
      ["weak", 4, "G1"],
    ]);
  });

  it("sinks an unscored stake rather than dropping it or ranking it top", () => {
    // An unscored row sorts last. A stake with no score is still something a room
    // raised, so it belongs on the wall; it just cannot claim a position it never earned.
    const deck = buildProjectDeck(
      input([
        group("G1", { placements: [place("a", "unscored", "risk", null, null)] }),
        group("G2", { placements: [place("b", "scored", "risk", 1, 1)] }),
      ])
    );
    expect(deck.aggregate.stakes.map((s) => s.text)).toEqual(["scored", "unscored"]);
  });

  it("survives stakes that tie all the way down, which real groups produce constantly", () => {
    // THE BUG THIS EXISTS FOR. An earlier version borrowed `compareByRank`, whose last
    // tiebreak is `createdTime` — a field a RippleCard has and a SummaryPlacement does not.
    // Every fixture above happens to differ before that line is reached, so the suite was
    // green while the real export threw on the first pair of equal scores. One group alone
    // has four picks at 5x5.
    const tied = (id: string) => place(id, id, "risk", 5, 5);
    const deck = buildProjectDeck(
      input([
        group("G1", { placements: [tied("a"), tied("b"), tied("c")] }),
        group("G2", { placements: [tied("d")] }),
      ])
    );
    expect(deck.aggregate.stakes).toHaveLength(4);
    // Stable: a dead heat keeps the order it came in, which is group order then board order.
    expect(deck.aggregate.stakes.map((s) => s.text)).toEqual(["a", "b", "c", "d"]);
  });

  it("breaks a tie on impact, matching how each group's own deck orders its placements", () => {
    const deck = buildProjectDeck(
      input([
        group("G1", {
          placements: [place("a", "3x5", "risk", 3, 5), place("b", "5x3", "risk", 5, 3)],
        }),
      ])
    );
    // Both rank 15; the heavier impact leads, as in lib/group-summary.ts.
    expect(deck.aggregate.stakes.map((s) => s.text)).toEqual(["3x5", "5x3"]);
  });

  it("splits risks from opportunities without re-sorting either", () => {
    const deck = buildProjectDeck(
      input([
        group("G1", {
          placements: [
            place("a", "r-low", "risk", 1, 1),
            place("b", "o-high", "opportunity", 5, 5),
            place("c", "r-high", "risk", 4, 4),
          ],
        }),
      ])
    );
    expect(deck.aggregate.topRisks.map((s) => s.text)).toEqual(["r-high", "r-low"]);
    expect(deck.aggregate.topOpportunities.map((s) => s.text)).toEqual(["o-high"]);
  });
});

describe("buildProjectDeck · the shape as a whole", () => {
  it("keeps a per-group chapter in the order the groups were given", () => {
    const deck = buildProjectDeck(
      input([group("G1", {}), group("G2", {}), group("G3", {}), group("G4", {})])
    );
    expect(deck.groups.map((g) => g.summary.groupName)).toEqual(["G1", "G2", "G3", "G4"]);
    expect(deck.groups[0].scenarioRef).toBe("g1-ref");
  });

  it("derives its headline counts rather than being told them", () => {
    // One number cannot drift from the list it claims to count if it is computed from it.
    const deck = buildProjectDeck(
      input([
        group("G1", {
          riskCount: 9,
          opportunityCount: 8,
          themes: [{ id: "t", text: "T", description: null, implications: 0, risks: [], opportunities: [] }],
          directions: [move("a", "A")],
        }),
        group("G2", { riskCount: 8, opportunityCount: 6, themes: [], directions: [] }),
      ])
    );
    expect(deck.counts).toEqual({
      groups: 2,
      themes: 1,
      risks: 17,
      opportunities: 14,
      boldMoves: 1,
    });
  });

  it("survives a project with no groups at all rather than throwing", () => {
    const deck = buildProjectDeck(input([]));
    expect(deck.groups).toEqual([]);
    expect(deck.aggregate.boldMoves).toEqual([]);
    expect(deck.counts.groups).toBe(0);
    expect(deck.aggregate.anyConfirmed).toBe(false);
  });

  it("leaves the convergence note empty rather than inventing one", () => {
    // Clustering is deliberately out of v1. The field exists so a drafted or hand-written
    // reading drops in as DATA later and no renderer changes; it must not be faked here.
    const deck = buildProjectDeck(input([group("G1", {})]));
    expect(deck.aggregate.convergenceNote).toBeNull();
  });
});
