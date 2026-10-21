import { describe, it, expect } from "vitest";
import { buildGroupSummary, splitKeyChange, themesByStakes } from "./group-summary";
import type { SummaryTheme } from "./group-summary";
import type {
  CommitmentsExercise,
  ExerciseAnswers,
  StakeRow,
  SynthesisTheme,
} from "@/components/design-groups/AnswerPanels";
import type { CardOrder, RippleCard } from "./ripples-types";
import { COMMITMENTS_STEP_CHANGES, COMMITMENTS_STEP_MOVES } from "./exercise-types";

function card(id: string, order: CardOrder, opts: Partial<RippleCard> = {}): RippleCard {
  return {
    id,
    teamId: "t",
    authorPlayerId: null,
    order,
    parentId: null,
    text: id,
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
    createdTime: "2026-10-01T00:00:00Z",
    ...opts,
  };
}

const stake = (id: string, text: string, o: Partial<StakeRow> = {}): StakeRow => ({
  id,
  text,
  author: "You",
  createdAt: "2026-10-01T00:00:00Z",
  mechanism: null,
  shortlisted: false,
  ...o,
});

const theme = (id: string, text: string, o: Partial<SynthesisTheme> = {}): SynthesisTheme => ({
  id,
  text,
  description: null,
  implications: [],
  answers: [],
  risks: [],
  opportunities: [],
  chain: [],
  tensions: [],
  ...o,
});

// The strings below are the real key changes from the four groups' Session 2 boards, not
// simplified stand-ins: the first version of this splitter wanted an all-caps label and
// silently failed on "FUNDING and BUDGET", which a tidied-up fixture had hidden.
describe("splitKeyChange", () => {
  it("lifts an ALL-CAPS label out of the front", () => {
    expect(splitKeyChange("POWER: Power is in the hands of community members.")).toEqual({
      label: "POWER",
      body: "Power is in the hands of community members.",
    });
  });

  it("allows a lowercase connector inside the label", () => {
    expect(
      splitKeyChange(
        "FUNDING and BUDGET: Key local public health services are protected and funding for prevention has been assured in perpetuity."
      )
    ).toEqual({
      label: "FUNDING and BUDGET",
      body: "Key local public health services are protected and funding for prevention has been assured in perpetuity.",
    });
  });

  it("keeps a multi-word label with a slash", () => {
    expect(
      splitKeyChange(
        "CROSS-SECTOR WORK/SDOH: In this future public health is intentionally broad and integrated across sectors."
      )
    ).toEqual({
      label: "CROSS-SECTOR WORK/SDOH",
      body: "In this future public health is intentionally broad and integrated across sectors.",
    });
  });

  it("keeps DECISION MAKING/PLANNING", () => {
    const { label } = splitKeyChange(
      "DECISION MAKING/PLANNING: Funding is stable, so agencies invest in long term plans."
    );
    expect(label).toBe("DECISION MAKING/PLANNING");
  });

  it("drops leading numbering without inventing a label", () => {
    expect(splitKeyChange("4. Reduced incentive to provide public goods")).toEqual({
      label: null,
      body: "Reduced incentive to provide public goods",
    });
  });

  it("leaves a plain sentence alone", () => {
    expect(
      splitKeyChange("Public health information moves continuously and bidirectionally.")
    ).toEqual({
      label: null,
      body: "Public health information moves continuously and bidirectionally.",
    });
  });

  it("does not mistake a sentence's own colon for a label", () => {
    const t =
      "Transient population leading to: Funding issues, long term planning and building stable infrastructure, census data/tracking, etc.";
    expect(splitKeyChange(t)).toEqual({ label: null, body: t });
  });

  it("leaves Group 2's long unprefixed key change whole", () => {
    const t =
      "Community relationships are treated as essential infrastructure and receive sustained funding, which allows public health to reach those they previously struggled to reach while creating a new vulnerability: \"un-networked\" individuals and communities";
    expect(splitKeyChange(t)).toEqual({ label: null, body: t });
  });
});

describe("themesByStakes", () => {
  const t = (id: string, risks: number, opps: number): SummaryTheme => ({
    id,
    text: id,
    description: null,
    implications: 0,
    risks: Array.from({ length: risks }, (_, i) => stake(`${id}r${i}`, "r")),
    opportunities: Array.from({ length: opps }, (_, i) => stake(`${id}o${i}`, "o")),
  });

  it("puts the themes with the most at stake first", () => {
    const out = themesByStakes([t("A", 3, 2), t("B", 5, 5), t("C", 1, 1)]);
    expect(out.map((x) => [x.letter, x.theme.id])).toEqual([
      ["B", "B"],
      ["A", "A"],
      ["C", "C"],
    ]);
  });

  // Group 3 really has three themes at seven stakes each; they must not reshuffle.
  it("breaks ties on board order, so the sort is stable", () => {
    const out = themesByStakes([t("A", 3, 2), t("B", 5, 2), t("C", 5, 2), t("D", 3, 4)]);
    expect(out.map((x) => x.letter)).toEqual(["B", "C", "D", "A"]);
  });

  it("keeps the letter the board order gave each theme", () => {
    // D sorts to the front but is still "D" — the letter is identity, not position.
    const out = themesByStakes([t("A", 0, 0), t("B", 0, 0), t("C", 0, 0), t("D", 4, 4)]);
    expect(out[0]).toMatchObject({ letter: "D", boardIndex: 3 });
    expect(out.slice(1).map((x) => x.letter)).toEqual(["A", "B", "C"]);
  });

  it("leaves themes with no stakes at the back, in board order", () => {
    const out = themesByStakes([t("A", 0, 0), t("B", 2, 1), t("C", 0, 0)]);
    expect(out.map((x) => x.letter)).toEqual(["B", "A", "C"]);
  });
});

describe("buildGroupSummary", () => {
  const weeks: ExerciseAnswers[] = [
    {
      kind: "worksheet",
      exerciseId: "w1",
      title: "Session 1",
      questions: [
        {
          key: "assess-unclear",
          label: "What feels unclear?",
          kind: "question",
          answers: [{ id: "u1", text: "How would equity be considered?", author: "You", createdAt: "x" }],
        },
        {
          key: "assess-assumptions",
          label: "What does it assume?",
          kind: "question",
          answers: [{ id: "a1", text: "Public health is valuable", author: "You", createdAt: "x" }],
        },
        {
          key: "assess-missing",
          label: "What is missing?",
          kind: "question",
          answers: [{ id: "m1", text: "  ", author: "You", createdAt: "x" }],
        },
        {
          key: "reactions",
          label: "First reactions",
          kind: "brainstorm",
          answers: [{ id: "r1", text: "felt hopeful", author: "You", createdAt: "x" }],
        },
      ],
    },
    {
      kind: "implications",
      exerciseId: "w2",
      title: "Session 2",
      scenarioTitle: "The Public Works",
      cards: [
        card("kc1", "FIRST", { text: "POWER: Power sits locally.", plausibility: 2, impact: 3 }),
        card("kc2", "FIRST", { text: "FUNDING: Money is assured.", plausibility: 3, impact: 4 }),
        card("i1", "SECOND", { text: "Can plan longer", parentId: "kc2" }),
        card("i2", "SECOND", { text: "Fewer grants to write", parentId: "kc2" }),
        card("i3", "TERMINAL", { text: "Better evaluations", parentId: "i1" }),
        card("s1", "STICKY", { text: "sandbox note", section: "implication-sandbox" }),
      ],
      brainstorm: [],
      questions: [],
    },
    {
      kind: "synthesis",
      exerciseId: "w3",
      title: "Session 3",
      cards: [
        card("t1", "FIRST", { text: "Funding theme", cardKind: "theme" }),
        // Clustered copies. sourceCardId points back at the Session 2 cards above, so the
        // lineage runs i1 → kc2 and i3 → i1 → kc2. ic3 carries no source, as a facilitator
        // addition would not.
        card("ic1", "SECOND", { text: "Can plan longer", parentId: "t1", sourceCardId: "i1" }),
        card("ic2", "SECOND", { text: "Better evaluations", parentId: "t1", sourceCardId: "i3" }),
        card("ic3", "SECOND", { text: "Added later", parentId: "t1", sourceCardId: null }),
        card("f1", "FIRST", { text: "We fear drift", cardKind: "fear" }),
        card("f2", "FIRST", { text: "We fear silence", cardKind: "fear" }),
        card("h1", "SECOND", { text: "We hope it holds", cardKind: "hope", parentId: "f1" }),
        card("h2", "FIRST", { text: "We hope upstream work lands", cardKind: "hope" }),
        card("b1", "SECOND", { text: "Who benefits answer", cardKind: "benefit", parentId: "t1" }),
      ],
      themes: [
        theme("t1", "Funding theme", {
          implications: [
            { id: "ic1", text: "Can plan longer", author: "You", createdAt: "x" },
            { id: "ic2", text: "Better evaluations", author: "You", createdAt: "x" },
            { id: "ic3", text: "Added later", author: "You", createdAt: "x" },
          ],
          risks: [stake("r1", "Fund gets raided", { mechanism: "one source" })],
          opportunities: [stake("o1", "Upstream investment", { shortlisted: true })],
        }),
        theme("t2", "Workforce theme"),
      ],
      hopesFears: [],
      role: [],
      unclustered: [{ id: "uc", text: "stray", author: "You", createdAt: "x" }],
      parked: [],
      orphans: [],
      questions: [],
      summary: null,
    },
  ];

  const s = buildGroupSummary(weeks, { name: "Group 1 | The Public Works", scenarioTitle: "The Public Works" });

  it("reports which weeks carry work", () => {
    expect(s.has).toEqual({
      assessment: true,
      implications: true,
      synthesis: true,
      commitments: false,
    });
  });

  it("reads the key changes with their scores and labels", () => {
    expect(s.keyChanges).toEqual([
      { id: "kc1", label: "POWER", body: "Power sits locally.", plausibility: 2, impact: 3 },
      { id: "kc2", label: "FUNDING", body: "Money is assured.", plausibility: 3, impact: 4 },
    ]);
  });

  it("counts tree depths by their reader-facing label and ignores stickies", () => {
    expect(s.orderCounts).toEqual([
      { label: "Key change", n: 2 },
      { label: "1st order", n: 2 },
      { label: "2nd order", n: 1 },
    ]);
    expect(s.totalImplicationCards).toBe(6);
  });

  it("pairs every fear with the hopes flipped from it, and keeps unflipped fears", () => {
    expect(s.flips).toEqual([
      { id: "f1", fear: "We fear drift", hopes: ["We hope it holds"] },
      { id: "f2", fear: "We fear silence", hopes: [] },
    ]);
  });

  it("separates a hope written on its own from a flip", () => {
    expect(s.standaloneHopes).toEqual(["We hope upstream work lands"]);
  });

  it("counts the empty slots rather than hiding them", () => {
    expect(s.gaps).toEqual({
      explorationAnswers: 1,
      explorationSlots: 8, // 2 themes × 4 questions
      mechanisms: 1,
      stakes: 2,
      starred: 1,
      themeDescriptions: 0,
      themes: 2,
    });
  });

  it("gathers the unsettled questions and drops blank answers", () => {
    expect(s.unsettled).toEqual([
      { bucket: "Unclear", text: "How would equity be considered?" },
      { bucket: "Assumed", text: "Public health is valuable" },
    ]);
  });

  it("carries the theme stakes through and counts unclustered implications", () => {
    expect(s.themes.map((t) => [t.text, t.implications, t.risks.length, t.opportunities.length])).toEqual([
      ["Funding theme", 3, 1, 1],
      ["Workforce theme", 0, 0, 0],
    ]);
    expect(s.unclustered).toBe(1);
  });

  it("traces each clustered implication back to the key change it came from", () => {
    // kc2 → i1 → i3 in Session 2; the Session 3 copies carry sourceCardId back to those.
    const f = s.clusterFlow;
    expect(f.keyChanges.map((k) => [k.label, k.total])).toEqual([["FUNDING", 2]]);
    expect(f.themes.map((t) => [t.label, t.total])).toEqual([
      ["Funding theme", 2],
      ["Workforce theme", 0],
    ]);
    expect(f.links).toEqual([{ sourceId: "kc2", themeIndex: 0, count: 2 }]);
    expect([f.traced, f.untraced]).toEqual([2, 1]);
  });

  it("says a week is empty rather than inventing one", () => {
    const bare = buildGroupSummary([], { name: "Group 9" });
    expect(bare.has).toEqual({
      assessment: false,
      implications: false,
      synthesis: false,
      commitments: false,
    });
    expect(bare.keyChanges).toEqual([]);
    expect(bare.gaps.explorationSlots).toBe(0);
    // A group that has not run Session 4 still renders: the deck shows an outlined slot
    // rather than going quietly shorter.
    expect(bare.changes).toEqual([]);
    expect(bare.role).toEqual([]);
    expect(bare.placements).toEqual([]);
    expect(bare.boldMoves).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Week 4
// ---------------------------------------------------------------------------
describe("buildGroupSummary · Session 4", () => {
  const week4 = (over: Partial<CommitmentsExercise> = {}): CommitmentsExercise => ({
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
    submittedAt: null,
    submittedBy: null,
    ...over,
  });
  const row = (id: string, text: string) => ({ id, text, author: "Ana", createdAt: "2026-01-01" });

  it("splits the written work on its authored step, so each slide gets its own half", () => {
    // Not fixed fields: the prompts are authored sections, so a reworded or re-counted
    // step must still come through. The SPLIT is what matters here — step 1 and step 4 are
    // different slides, and all four prompts in one list would put step 4 above step 2.
    const s = buildGroupSummary(
      [
        week4({
          cards: [{ id: "c" } as never],
          questions: [
            { key: "w4-summary", label: "Summarize the key changes.", kind: "question", step: COMMITMENTS_STEP_CHANGES, answers: [row("a1", "Budgets are set with residents.")] },
            { key: "w4-assumptions", label: "What no longer holds?", kind: "question", step: COMMITMENTS_STEP_CHANGES, answers: [row("a2", "That evidence decides."), row("a3", "That funding is annual.")] },
            { key: "w4-role", label: "What role is public health playing?", kind: "question", step: COMMITMENTS_STEP_MOVES, answers: [row("a4", "Convenor of the evidence.")] },
            { key: "w4-bold-moves", label: "Three bold moves", kind: "question", step: COMMITMENTS_STEP_MOVES, answers: [row("a5", "Pool prevention budgets."), row("a6", "Publish every score.")] },
          ],
        }),
      ],
      { name: "G" }
    );
    expect(s.has.commitments).toBe(true);
    expect(s.changes).toEqual([
      { key: "w4-summary", label: "Summarize the key changes.", answers: ["Budgets are set with residents."] },
      { key: "w4-assumptions", label: "What no longer holds?", answers: ["That evidence decides.", "That funding is annual."] },
    ]);
    // `key` rides along so the deck can tell the role from the moves by identity rather
    // than by position. See "keeps the role and the moves apart" below.
    expect(s.role).toEqual([
      { key: "w4-role", label: "What role is public health playing?", answers: ["Convenor of the evidence."] },
      { key: "w4-bold-moves", label: "Three bold moves", answers: ["Pool prevention budgets.", "Publish every score."] },
    ]);
  });

  it("drops empty blocks, and keeps a stepless block with the changes", () => {
    // A question an admin adds in the program editor carries no step. It must not vanish,
    // and it must not land on the role slide.
    const s = buildGroupSummary(
      [
        week4({
          cards: [{ id: "c" } as never],
          questions: [
            { key: "w4-summary", label: "Summarize", kind: "question", step: COMMITMENTS_STEP_CHANGES, answers: [] },
            { key: "extra", label: "Anything else?", kind: "question", answers: [row("x", "One more thing.")] },
          ],
        }),
      ],
      { name: "G" }
    );
    expect(s.changes).toEqual([{ key: "extra", label: "Anything else?", answers: ["One more thing."] }]);
    expect(s.role).toEqual([]);
  });

  it("keeps the role and the moves apart when only the moves are answered", () => {
    // The deck used to split step 4 POSITIONALLY: first block is the role, rest are the
    // moves. Empty blocks are dropped here, so a group that answered the moves and skipped
    // the role made the moves element zero, and three bold moves were published under
    // "The role you would argue for". The key is the stable thing to split on.
    const s = buildGroupSummary(
      [
        week4({
          cards: [{ id: "c" } as never],
          questions: [
            { key: "w4-role", label: "The role", kind: "question", step: COMMITMENTS_STEP_MOVES, answers: [] },
            { key: "w4-bold-moves", label: "Bold moves", kind: "question", step: COMMITMENTS_STEP_MOVES, answers: [row("m1", "Pool prevention budgets.")] },
          ],
        }),
      ],
      { name: "G" }
    );
    expect(s.role).toEqual([
      { key: "w4-bold-moves", label: "Bold moves", answers: ["Pool prevention budgets."] },
    ]);
    // The thing that matters: nothing here is keyed as the role, so the deck draws no
    // role slide rather than drawing the moves as one.
    expect(s.role.some((b) => b.key === "w4-role")).toBe(false);
  });

  it("keeps every period on a lane, so a gap stays visible", () => {
    const s = buildGroupSummary(
      [
        week4({
          cards: [{ id: "c" } as never],
          lanes: [
            {
              move: row("m", "Pool prevention budgets regionally"),
              periods: [
                { key: "w4-p1", label: "2027–28", milestones: [row("x", "Statute drafted")] },
                { key: "w4-p2", label: "2029–30", milestones: [] },
                { key: "w4-p3", label: "2031–32", milestones: [row("y", "Fund holds two years")] },
              ],
            },
          ],
        }),
      ],
      { name: "G" }
    );
    expect(s.boldMoves).toHaveLength(1);
    expect(s.boldMoves[0].placed).toBe(2);
    expect(s.boldMoves[0].periods.map((p) => p.milestones.length)).toEqual([1, 0, 1]);
    expect(s.boldMoves[0].periods[1].label).toBe("2029–30");
  });

  it("counts a week with only an aspiration as worked", () => {
    // The aspiration lives in question blocks and the rest in cards, so neither alone is
    // the test for whether the group turned up.
    const s = buildGroupSummary(
      [
        week4({
          questions: [
            { key: "aspiration-statement", label: "Aspiring to?", kind: "question", answers: [row("a", "Something")] },
          ],
        }),
      ],
      { name: "G" }
    );
    expect(s.has.commitments).toBe(true);
    expect(s.boldMoves).toEqual([]);
  });
});

describe("buildGroupSummary · the curated handoff", () => {
  const row = (id: string, text: string) => ({ id, text, author: "Ana", createdAt: "2026-01-01" });
  // A step-2 matrix placement. Unscored unless a test says otherwise: the star on the deck
  // is derived from the placement existing, not from how it was scored.
  const mark = (id: string, text: string, sourceId: string, p: number | null = null, i: number | null = null) => ({
    ...row(id, text),
    sourceId,
    plausibility: p,
    impact: i,
    rank: p !== null && i !== null ? p * i : null,
  });
  const stake = (id: string, text: string) => ({ ...row(id, text), mechanism: null, shortlisted: false });
  const w4 = (over: Partial<CommitmentsExercise>): CommitmentsExercise => ({
    kind: "commitments", exerciseId: "EX4", title: "Session 4", cards: [{ id: "c" } as never],
    responses: [], boldMoves: [], lanes: [], stranded: [],
    picks: [], settledMarks: [], orphans: [], questions: [],
    submittedAt: null, submittedBy: null,
    ...over,
  });
  const w3 = (): ExerciseAnswers => ({
    kind: "synthesis", exerciseId: "EX3", title: "Session 3", cards: [], themes: [
      {
        id: "t1", text: "A theme", description: null, implications: [],
        answers: [], tensions: [], chain: [],
        risks: [stake("r1", "starred risk"), stake("r2", "plain risk")],
        opportunities: [stake("o1", "starred opp"), stake("o2", "plain opp")],
      },
    ],
    hopesFears: [], role: [], unclustered: [], parked: [], orphans: [], questions: [], summary: null,
  });
  const w1 = (): ExerciseAnswers => ({
    kind: "worksheet", exerciseId: "EX1", title: "Session 1",
    questions: [
      { key: "assess-important", label: "Most important", kind: "question", answers: [row("i1", "Power is local")] },
      { key: "assess-unclear", label: "Unclear", kind: "question", answers: [row("u1", "Who funds it?"), row("u2", "Who decides?")] },
    ],
  });

  it("derives each placement's kind from Week 3's own walls, and ranks them", () => {
    // A pick stores its source's id and words, never its kind, so this builder is the only
    // place that can say which wall a placement came from. Getting it wrong would paint an
    // opportunity coral on the deck.
    const s = buildGroupSummary(
      [
        w1(),
        w3(),
        w4({
          picks: [
            mark("m1", "plain risk", "r2", 2, 5),
            mark("m2", "starred opp", "o1", 5, 4),
            mark("m3", "starred risk", "r1"), // placed, never scored
          ],
        }),
      ],
      { name: "G" }
    );
    // Strongest first, regardless of the order the picks arrived in, and the unscored last.
    expect(s.placements).toEqual([
      { id: "o1", text: "starred opp", kind: "opportunity", plausibility: 5, impact: 4, rank: 20 },
      { id: "r2", text: "plain risk", kind: "risk", plausibility: 2, impact: 5, rank: 10 },
      { id: "r1", text: "starred risk", kind: "risk", plausibility: null, impact: null, rank: null },
    ]);
  });

  it("drops a placement whose Session 3 source is gone rather than guessing its kind", () => {
    // An admin deleted the risk after the group placed it. A coral chip that is really an
    // opportunity is worse on a handoff than a missing one.
    const s = buildGroupSummary(
      [w1(), w3(), w4({ picks: [mark("m1", "a deleted risk", "gone", 4, 4)] })],
      { name: "G" }
    );
    expect(s.placements).toEqual([]);
  });

  it("has no placements when Session 3 was never run", () => {
    const s = buildGroupSummary([w1(), w4({ picks: [mark("m1", "x", "r1", 3, 3)] })], { name: "G" });
    expect(s.placements).toEqual([]);
  });

  it("derives the star on a Session 3 card from a Session 4 pick", () => {
    // The star is NOT stored on the risk. Week 4 writes only to its own board, so the
    // handoff deck has to project it, and this is the test that keeps it projecting.
    const s = buildGroupSummary([w1(), w3(), w4({ picks: [mark("mark0", "mark 0", "r1"), mark("mark1", "mark 1", "o1")] })], { name: "G" });
    const t = s.themes[0];
    expect(t.risks.map((r) => [r.text, r.shortlisted])).toEqual([
      ["starred risk", true],
      ["plain risk", false],
    ]);
    expect(t.opportunities.map((o) => [o.text, o.shortlisted])).toEqual([
      ["starred opp", true],
      ["plain opp", false],
    ]);
  });

  it("never lets Week 3's own shortlist light a handoff star", () => {
    // A star on this deck means "Session 4 chose this", full stop. The earlier version
    // short-circuited on an empty pick set, so a dormant Week 3 `shortlisted` flag showed
    // stars the group never chose, and a single Session 4 pick then wiped them.
    const w3Starred = (): ExerciseAnswers => {
      const base = w3() as Extract<ExerciseAnswers, { kind: "synthesis" }>;
      base.themes[0].risks[0] = { ...base.themes[0].risks[0], shortlisted: true };
      return base;
    };
    const noPicks = buildGroupSummary([w1(), w3Starred(), w4({})], { name: "G" });
    expect(noPicks.themes[0].risks.every((r) => !r.shortlisted)).toBe(true);

    // And one Session 4 pick stars exactly that one, not the Week 3 leftover.
    const picked = buildGroupSummary(
      [w1(), w3Starred(), w4({ picks: [mark("m", "x", "r2")] })],
      { name: "G" }
    );
    expect(picked.themes[0].risks.map((r) => [r.id, r.shortlisted])).toEqual([
      ["r1", false],
      ["r2", true],
    ]);
    // `gaps` stays a Week 3 metric, so it still sees Week 3's own flag.
    expect(picked.gaps.starred).toBe(1);
  });

  it("leaves Session 3 alone when Session 4 has not been run", () => {
    const s = buildGroupSummary([w1(), w3()], { name: "G" });
    expect(s.themes[0].risks.every((r) => !r.shortlisted)).toBe(true);
    expect(s.settledCount).toBe(0);
  });

  it("drops the uncertainties the group marked settled, and counts them", () => {
    const s = buildGroupSummary([w1(), w3(), w4({ settledMarks: [mark("smark0", "settled 0", "u1")] })], { name: "G" });
    expect(s.unsettled.map((u) => u.text)).toEqual(["Who decides?"]);
    expect(s.settledCount).toBe(1);
  });

  it("keeps every uncertainty open by default", () => {
    // Doing nothing on step 5 must hand over the whole list, not an empty one.
    const s = buildGroupSummary([w1(), w3(), w4({})], { name: "G" });
    expect(s.unsettled).toHaveLength(2);
    expect(s.settledCount).toBe(0);
  });

  it("surfaces Session 1's read of the world, which nothing else shows", () => {
    const s = buildGroupSummary([w1(), w3()], { name: "G" });
    expect(s.worldReading).toEqual([
      { label: "What feels most important or distinctive", answers: ["Power is local"] },
    ]);
  });
});
