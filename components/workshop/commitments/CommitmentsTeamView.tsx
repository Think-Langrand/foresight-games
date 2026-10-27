"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ScenarioPanel } from "@/components/workshop/ScenarioPanel";
import { ScenarioToggle } from "@/components/workshop/ScenarioToggle";
import { SessionHeaderActions, useInSessionTabs } from "@/components/design-groups/SessionHeader";
import { WorksheetSections } from "@/components/workshop/WorksheetSections";
import { Centered, Flash, Panel, PhaseHeader, Shell } from "@/components/workshop/BoardShell";
import { Week3Reference } from "@/components/workshop/commitments/Week3Reference";
import { ResponseBoard } from "@/components/workshop/commitments/ResponseBoard";
import { Week4Reference } from "@/components/workshop/commitments/Week4Reference";
import { PriorityRecap } from "@/components/workshop/commitments/PriorityRecap";
import { MovesBoard } from "@/components/workshop/commitments/MovesBoard";
import { MatrixBoard } from "@/components/workshop/commitments/MatrixBoard";
import { StepProgress } from "@/components/workshop/commitments/StepProgress";
import ExecSummaryComposer from "@/components/design-groups/ExecSummaryComposer";
import HandoffGuideLocked from "@/components/design-groups/HandoffGuideLocked";
import { coerceExecSummary, execSummaryReadiness } from "@/lib/exec-summary-shape";
import { ReviewBoard } from "@/components/workshop/commitments/ReviewBoard";
import {
  useRipplesView,
  useOptimisticCards,
  deleteRippleCard,
  describeRippleCard,
  disputeRippleCard,
  editRippleCard,
  postRippleCard,
  shortlistRippleCard,
  scoreRippleCard,
  reorderRippleCard,
  submitRippleBoard,
  unsubmitRippleBoard,
} from "@/components/workshop/hooks";
import { useSharedBoardMembership } from "@/components/workshop/membership";
import type { PublicDriverCard, Scenario } from "@/lib/foresight/types";
import type { RippleCard, RipplePhase } from "@/lib/ripples-types";
import type { ScorePatchInput } from "@/lib/ripples-scoring";
import { cardScores } from "@/lib/ripples-scoring";
import { SORT_STEP } from "@/lib/synthesis-shape";
import {
  DIRECTION_FIELDS,
  DISPUTED_SECTION,
  indexCommitmentsBoard,
  isSharpened,
  priorities,
  sharpenFor,
  type DirectionFieldKey,
} from "@/lib/commitments-shape";
import {
  commitmentsSectionsFor,
  type CommitmentsSectionStep,
  type WorksheetSection,
} from "@/lib/exercise-types";
import { RailWidth } from "@/components/workshop/synthesis/boardGutters";

// Session 4, the COMMITMENTS board. Five steps on one shared board, and the whole week
// builds the handoff rather than curating it in a step of its own:
//
//   1. Structure & assumptions   how this world works, and what it stops making true
//   2. Risks & opps              Session 3's stakes on the impact x plausibility matrix
//   3. Responses                 a wall of moves
//   4. Identity & direction      the role public health plays here, and the moves there
//   5. Handoff                   what is being handed over, then submit
//
// Steps 1 and 4 ride the section substrate, so their prompts are the facilitator's and are
// edited in the program editor rather than here. Steps 2, 3 and 5 are code. See
// lib/commitments-shape's header for why the week is split that way.
//
// THE STEP NAMES ABOVE ARE DISPLAY ONLY. Underneath, a section's `step` is still the string
// it was stored as — "Key changes" and "Bold moves" — because that value is persisted and
// every split in the app is an equality test against it. See COMMITMENTS_STEP_CHANGES.
//
// PARKED, NOT DELETED. The backcasting timeline and the three-move down-select are wanted
// for the next workshop, so `BacktrackTimeline` and `MovesBoard` stay in the tree, their
// card kinds stay in CARD_KINDS, and their write paths stay on the routes. They are simply
// not in COMMIT_STEPS. Putting either back is adding its entry here and its branch below.

const NO_CARDS: RippleCard[] = [];

// What a step is FOR, standing above its board or its questions.
//
// NOT THE `Directions` FOLD, which is how the tool works and is collapsed by default. This
// is what the activity is, and it has to be read before anyone starts rather than opened
// by the one person who thinks to look. Hardcoded rather than authored because nothing is
// written under it: giving it an answer box is the misreading it exists to prevent.
function StepIntro({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="max-w-[72ch] rounded-[3px] border-l-[3px] border-ink bg-card px-4 py-3">
      {title && (
        <h3 className="m-0 mb-1.5 text-[15px] font-extrabold uppercase tracking-tight">
          {title}
        </h3>
      )}
      <div className="flex flex-col gap-2 text-[14px] leading-[1.5]">{children}</div>
    </div>
  );
}

// Steps 1 and 4 both render sections, so both can be empty, and both said this in their own
// copy of the markup. One component, used twice.
function NoPrompts() {
  return (
    <p className="text-[13px] italic text-muted">
      No prompts are set up for this step yet. A facilitator can add them in the program
      editor.
    </p>
  );
}

// The six activities, plus the handoff. Local to this file, the way Week 3 keeps its own:
// these are the TABS, and which authored sections land on one is the separate question
// COMMITMENTS_SECTION_STEPS answers in lib/exercise-types. Three tabs render sections,
// three are boards, and the last is the review.
type CommitStep =
  | "reconnect"
  | "prioritize"
  | "outcomes"
  | "responses"
  | "vision"
  | "directions"
  | "review";
const COMMIT_STEPS: readonly CommitStep[] = [
  "reconnect",
  "prioritize",
  "outcomes",
  "responses",
  "vision",
  "directions",
  "review",
];
// Short on purpose: seven tabs share one row, and the number is what a facilitator calls
// out in the room ("everyone on 4"). The full activity name is the slide's heading.
const STEP_LABELS: Record<CommitStep, string> = {
  reconnect: "1 \u00b7 Reconnect",
  prioritize: "2 \u00b7 Prioritize",
  outcomes: "3 \u00b7 Desired outcomes",
  responses: "4 \u00b7 Strategic responses",
  vision: "5 \u00b7 Vision",
  directions: "6 \u00b7 Three directions",
  review: "7 \u00b7 Handoff",
};

export function CommitmentsTeamView({
  code,
  basePath,
  scenario,
  drivers = [],
  hiddenSections,
  sections = [],
  week3Cards = [],
  week2Cards = [],
  summaryHref,
  submittedAt: submittedAtProp = null,
  submittedBy: submittedByProp = null,
  title,
}: {
  code: string;
  basePath?: string;
  scenario?: Scenario | null;
  drivers?: PublicDriverCard[];
  hiddenSections?: string[];
  sections?: WorksheetSection[];
  // Session 3's whole board, read-only, so the week can show the group its own hopes,
  // flips, risks and opportunities beside the steps that build on them. Shaped
  // server-side from the earlier-week answers the page already loads; nothing from it is
  // copied onto this board. See Week3Reference.
  week3Cards?: RippleCard[];
  // Session 2's board, for the key changes in the rail. Roots only are used; see
  // Week3Reference. Shaped server-side on the page like week3Cards, and never copied here.
  week2Cards?: RippleCard[];
  // Session 1's three uncertainty questions, shaped on the page: a worksheet week arrives
  // as question blocks rather than cards, so there is nothing to index here.
  // Where the group's handoff deck lives. Built on the page, which knows the project slug
  // and the group id; the board should not have to rebuild a route.
  summaryHref?: string;
  // The GROUP's submit stamp (migration 0029), read server-side on the page. Seeds local
  // state rather than being read directly: it is not on the board's realtime channel, so
  // after a press the client is the only thing that knows until the next page load.
  submittedAt?: string | null;
  submittedBy?: string | null;
  title?: string;
}) {
  const { view, error, loading, refresh } = useRipplesView(code);
  const { pid, playerId } = useSharedBoardMembership(code, view, refresh);
  const {
    cards,
    addLocal,
    removeLocal,
    unremoveLocal,
    reorderLocal,
    editLocal,
    describeLocal,
    shortlistLocal,
    sectionLocal,
    scoreLocal,
    settleScoreLocal,
    dropScoreLocal,
  } = useOptimisticCards(view?.cards ?? NO_CARDS);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [showScenario, setShowScenario] = useState(true);
  // Declared up here with the other state, NOT inside the build branch below — several
  // early returns sit between the two, and a hook after one of them would break the order.
  const [step, setStep] = useState<CommitStep>("reconnect");
  // Step 5's marks, keyed `<kind>:<sourceCardId>`, while their write is in flight. A mark
  // has no id until the server mints one, so it cannot ride the card overlay the way every
  // other write on this board does; without this the board showed nothing at all for the
  // length of a round trip, the cap read stale, and a group ticking four risks quickly got
  // all four.
  const [markPending, setMarkPending] = useState<Set<string>>(() => new Set());
  // Step 2's bridge: scores clicked on a Session 3 card whose pick does not exist yet,
  // keyed by SOURCE id. It lives for one round trip and is dropped the moment the pick is
  // in the optimistic cards, so there is never a stale entry waiting to be un-shadowed if
  // that pick is later deleted — by this viewer or by a teammate. Dropped on the mint
  // failing too, since then no pick is coming. See scoreStake.
  const [pendingScores, setPendingScores] = useState<Map<string, ScorePatchInput>>(
    () => new Map()
  );
  // The in-flight create per source id, so two fast score clicks on one card mint one pick
  // rather than racing. A ref, not state: nothing renders from it and a re-render between
  // the two clicks must not lose it.
  const mintingPick = useRef<Map<string, Promise<string>>>(new Map());
  // Source ids whose in-flight mint has been cancelled by Clear. A create cannot be
  // recalled, so clearStake takes ownership of deleting whatever it mints and every
  // scoreStake still awaiting that promise bails on this set rather than scoring it.
  const cancelledMints = useRef<Set<string>>(new Set());
  // Step 5's submit stamp. Seeded from the server and then owned here, because the press
  // and its Undo both resolve to a value the response carries. See ReviewBoard's header for
  // why this is not realtime.
  const [submitted, setSubmitted] = useState<{ at: string | null; by: string | null }>({
    at: submittedAtProp,
    by: submittedByProp,
  });

  const inTabs = useInSessionTabs();

  // Runs one board action, showing a failure as the flash. Resolves to whether it
  // succeeded, so a composer can keep its draft when the write did not land (AddCardForm)
  // instead of clearing the text and leaving only the toast.
  const run = useCallback(async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setFlash(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  // One index for all four steps; every Session 4 selector reads it.
  const board = useMemo(() => indexCommitmentsBoard(cards), [cards]);

  // A resolved `mintingPick` entry is kept on purpose (see ensurePick) to bridge the window
  // between addLocal and React committing. Once the pick is actually in `board.picks` that
  // bridge is done and ensurePick's first branch answers every later call, so the promise
  // is pruned here. Keeping it past this point is what let a DELETED pick hand the next
  // score click a dead card id: `board.picks` empties again, the retained promise is
  // consulted, and the score is sent for a row the server no longer has.
  useEffect(() => {
    for (const sourceId of [...mintingPick.current.keys()]) {
      if (board.picks.has(sourceId)) mintingPick.current.delete(sourceId);
    }
  }, [board]);

  if (loading)
    return (
      <Centered>
        <div className="text-[13px] text-muted">Loading your group&rsquo;s board…</div>
      </Centered>
    );
  if (error)
    return (
      <Centered>
        <div className="text-center">
          <div className="text-[18px] font-bold">Session {code} not found</div>
          <div className="mt-2 text-[13px] text-muted">{error}</div>
          <Link href={basePath || "/workshop"} className="mt-4 inline-block text-blue underline">
            Try another code
          </Link>
        </div>
      </Centered>
    );
  if (!view) return null;

  const { config, players, session } = view;
  const phase = session.phase as RipplePhase;
  const myPlayer = players.find((p) => p.id === playerId);
  const playerNames = new Map(players.map((p) => [p.id, p.displayName]));
  const building = phase === "BUILD";
  const editable = building && Boolean(myPlayer);
  // The group co-owns every card on a shared board, matching the server rule exactly — so
  // the UI never offers a control the route will refuse. Seeded cards have no author at
  // all, so an author-only rule would make them uneditable by everyone.
  const canEditCard = config.sharedTeam ? () => true : (c: RippleCard) => c.authorPlayerId === myPlayer?.id;


  if (!myPlayer) {
    return (
      <Shell wide>
        {!inTabs && (
          <PhaseHeader phase={phase} title={title || config.scenarioTitle} kindLabel="Commitments" />
        )}
        <Panel>
          <p className="text-[14px] text-muted">Joining your group&rsquo;s board…</p>
        </Panel>
        {flash && <Flash msg={flash} />}
      </Shell>
    );
  }

  // ---- card operations -------------------------------------------------------
  // Each one shows the change locally first and reverts if the server refuses, so a write
  // lands instantly instead of waiting on the realtime round-trip.

  const addSectionCard = (section: string, text: string) =>
    run(async () => {
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: "STICKY",
        text,
        section,
        sort: Date.now(),
      });
      if (res?.card) addLocal(res.card as RippleCard);
    });

  const reorderSectionCard = (cardId: string, sort: number) => {
    const prev = cards.find((c) => c.id === cardId)?.sort;
    reorderLocal(cardId, sort);
    run(async () => {
      try {
        await reorderRippleCard(code, cardId, { participantId: pid, sort });
      } catch (e) {
        if (prev !== undefined) reorderLocal(cardId, prev);
        throw e;
      }
    });
  };

  // Keyed by id, because WorksheetSections edits by id; `editCard` below adapts it for
  // CardWall, which hands whole cards around, rather than keeping a second copy of the
  // revert logic.
  const editCardById = (cardId: string, text: string) => {
    const prev = cards.find((c) => c.id === cardId)?.text;
    editLocal(cardId, text);
    run(async () => {
      try {
        await editRippleCard(code, cardId, { participantId: pid, text });
      } catch (e) {
        if (prev !== undefined) editLocal(cardId, prev);
        throw e;
      }
    });
  };
  const editCard = (card: RippleCard, text: string) => editCardById(card.id, text);

  const removeCard = (card: RippleCard) => {
    removeLocal(card.id);
    run(async () => {
      try {
        await deleteRippleCard(code, card.id, { participantId: pid });
      } catch (e) {
        unremoveLocal(card.id);
        throw e;
      }
    });
  };

  // The board sorts by (sort, createdTime), so anything created at sort 0 would sit ahead
  // of every card that has ever been dragged. A new response gets a sort past the end of
  // the wall, so it appends — and because the wall's order IS the lane order on step 4,
  // this is also what keeps the timeline's lanes in the order the group sees them.
  const endSort = (list: RippleCard[]) => (list.length + 1) * SORT_STEP;

  const addResponse = (text: string) =>
    run(async () => {
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: "FIRST",
        cardKind: "response",
        text,
        sort: endSort(board.responses),
      });
      if (res?.card) addLocal(res.card as RippleCard);
    });




  // A handoff mark: a card on THIS board pointing at an earlier week's card. Nothing on
  // Session 1's or Session 3's board is touched, so the star the handoff deck draws is
  // derived rather than stored. `on` false deletes the mark that already exists.
  const markKey = (kind: "pick" | "settled", sourceId: string) => `${kind}:${sourceId}`;

  // What the board should SHOW, with an in-flight write folded in. XOR: a mark that exists
  // with a write pending is being deleted, so it reads as gone; one that does not exist with
  // a write pending is being created, so it reads as present.
  const isStarred = (sourceId: string) =>
    board.picks.has(sourceId) !== markPending.has(markKey("pick", sourceId));

  const toggleMark = (
    kind: "pick" | "settled",
    source: { id: string; text: string },
    on: boolean
  ) => {
    const key = markKey(kind, source.id);
    // One write per mark at a time. Without this a double-click sends two creates for one
    // source, the second trips 0018's unique index, and the group is told someone else
    // answered when nobody did.
    if (markPending.has(key)) return;
    const existing = (kind === "pick" ? board.picks : board.settled).get(source.id);
    if (on === Boolean(existing)) return;
    const hold = () => setMarkPending((p) => new Set(p).add(key));
    const release = () =>
      setMarkPending((p) => {
        if (!p.has(key)) return p;
        const next = new Set(p);
        next.delete(key);
        return next;
      });
    if (existing) {
      hold();
      removeLocal(existing.id);
      run(async () => {
        try {
          await deleteRippleCard(code, existing.id, { participantId: pid });
        } catch (e) {
          unremoveLocal(existing.id);
          throw e;
        }
      }).finally(release);
      return;
    }
    hold();
    run(async () => {
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: "FIRST",
        cardKind: kind,
        sourceCardId: source.id,
        // The source's own words ride along, so the handoff reads without a join back to
        // a board the deck may not have loaded.
        text: source.text,
      });
      if (res?.card) addLocal(res.card as RippleCard);
    }).finally(release);
  };

  // Score a pick that already exists. The same shape as Week 2's scoreKeyChange, including
  // the three-part overlay: `scoreLocal` merges so the two axis rows do not wipe each
  // other, and the overlay's `inflight` counter is what stops this viewer being pinned to a
  // number a teammate has since overwritten.
  const scorePick = (pickId: string, patch: ScorePatchInput) => {
    const axes = Object.keys(patch) as (keyof ScorePatchInput)[];
    scoreLocal(pickId, patch);
    run(async () => {
      try {
        await scoreRippleCard(code, pickId, { participantId: pid, ...patch });
        settleScoreLocal(pickId);
      } catch (e) {
        dropScoreLocal(pickId, axes);
        throw e;
      }
    });
  };

  // The pick standing for a Session 3 card, with a create still in flight already counted
  // so the counters do not lag a round trip behind the click.
  const pickFor = (sourceId: string) =>
    isStarred(sourceId) ? board.picks.get(sourceId) : undefined;

  // ---- step 2: scoring is placing --------------------------------------------
  //
  // Step 2 shows both scales on every Session 3 card, so the FIRST click on a card has to
  // paint before the pick that will hold the score exists. These two pieces bridge that
  // gap, and only that gap: once the pick is on the board the ordinary `scores` overlay
  // takes over and `pendingScores` drops the entry.
  //
  // `mintingPick` is keyed by source id and holds the in-flight create itself, not a
  // boolean. Both scales clicked in quick succession must not send two creates, and 0018's
  // unique (code, source_card_id) would turn the second into a 409 the group would read as
  // someone else's edit. The second click awaits the same promise the first started.
  const ensurePick = (source: { id: string; text: string }): Promise<string> => {
    const existing = board.picks.get(source.id);
    if (existing) return Promise.resolve(existing.id);
    const inFlight = mintingPick.current.get(source.id);
    if (inFlight) return inFlight;
    const p = postRippleCard(code, {
      participantId: pid,
      cardOrder: "FIRST",
      cardKind: "pick",
      sourceCardId: source.id,
      // The source's own words ride along, so the handoff reads without a join back to a
      // board the deck may not have loaded.
      text: source.text,
    })
      .then((res) => {
        const card = res?.card as RippleCard | undefined;
        if (!card) throw new Error("The board did not accept that.");
        addLocal(card);
        return card.id;
      })
      // KEPT ON SUCCESS, deliberately. Clearing it in a `finally` released the guard a
      // microtask after addLocal and before React had committed, so a click landing in
      // that gap saw neither the pick nor the guard and posted a SECOND pick — the exact
      // 409 the guard exists to prevent. A settled promise is a perfectly good guard: a
      // later caller awaits it and gets the id the first call minted.
      //
      // Dropped only on failure, so a retry can mint, and in clearStake, where the pick it
      // names is deleted and the resolved id would be dead.
      .catch((e) => {
        mintingPick.current.delete(source.id);
        throw e;
      });
    mintingPick.current.set(source.id, p);
    return p;
  };

  const dropPending = (sourceId: string) =>
    setPendingScores((m) => {
      if (!m.has(sourceId)) return m;
      const next = new Map(m);
      next.delete(sourceId);
      return next;
    });

  const scoreStake = (card: RippleCard, patch: ScorePatchInput) => {
    const axes = Object.keys(patch) as (keyof ScorePatchInput)[];
    const existing = board.picks.get(card.id);
    if (existing) {
      scorePick(existing.id, patch);
      return;
    }
    // No pick yet: paint against the SOURCE id, mint, then hand off to the real overlay.
    setPendingScores((m) => new Map(m).set(card.id, { ...m.get(card.id), ...patch }));
    run(async () => {
      const pickId = await ensurePick({ id: card.id, text: card.text });
      // Clear was pressed while this mint was in flight. The pick exists now, but the group
      // has already said it does not want it: clearStake owns deleting it, and scoring it
      // here is what used to leave a scored placement on a row the group had cleared,
      // visible in the review pane, the CSV and the handoff deck.
      if (cancelledMints.current.has(card.id)) return;
      // `ensurePick` has already called addLocal, so the pick is in the optimistic cards
      // and `scoresFor` will read it rather than the bridge from the very next render.
      // Both of these are state updates in one tick, so there is no frame where the scale
      // has neither and blinks back to empty.
      scoreLocal(pickId, patch);
      dropPending(card.id);
      try {
        await scoreRippleCard(code, pickId, { participantId: pid, ...patch });
        settleScoreLocal(pickId);
      } catch (e) {
        dropScoreLocal(pickId, axes);
        throw e;
      }
    }).then((ok) => {
      // The mint itself failed, so there is no pick to shadow the bridge entry and it has
      // to go or the scale shows a score the board never took.
      if (!ok) dropPending(card.id);
    });
  };

  // Take a scored card back off the matrix. There is no placement act to undo any more, but
  // a mis-click still has to be reversible, and deleting the pick is what clears both axes
  // at once: the score route has no "unset" and writing nulls through it is not a thing it
  // offers.
  const clearStake = (card: RippleCard) => {
    // Both caches name a pick that is about to stop existing. The bridge entry is normally
    // shadowed by the pick, but deleting the pick un-shadows it and the score comes
    // straight back on screen; the minted promise would hand the next click a dead id.
    dropPending(card.id);
    const inFlight = mintingPick.current.get(card.id);
    mintingPick.current.delete(card.id);

    // MID-MINT. `toggleMark` deletes by looking the pick up in `board.picks`, and during a
    // mint there is nothing there yet, so it returned without doing anything and the create
    // landed and got scored regardless. Clear is reachable in exactly this window: the
    // scales are not gated on `busy`, and the bridge entry makes the row read as touched.
    // So wait for the create this viewer already started and delete what it minted.
    if (inFlight && !board.picks.has(card.id)) {
      cancelledMints.current.add(card.id);
      run(async () => {
        let pickId: string;
        try {
          pickId = await inFlight;
        } catch {
          // The mint itself failed, so there is no pick to delete and scoreStake's own
          // run() has already shown the group why.
          cancelledMints.current.delete(card.id);
          return;
        }
        try {
          removeLocal(pickId);
          await deleteRippleCard(code, pickId, { participantId: pid });
        } catch (e) {
          unremoveLocal(pickId);
          throw e;
        } finally {
          cancelledMints.current.delete(card.id);
        }
      });
      return;
    }

    toggleMark("pick", { id: card.id, text: card.text }, false);
  };

  // --- act 2: naming the three priorities, and flagging a dispute ----------------------
  //
  // BOTH MARKERS RIDE ON THE PICK, which is forced rather than chosen: 0018's unique
  // (code, source_card_id) permits exactly one Week 4 card per Session 3 source, so a
  // separate "priority" or "disputed" card pointing at a risk that already has a pick
  // could not be written. `ensurePick` is the same mint the matrix uses, so starring a row
  // nobody scored brings the pick into being exactly as a first score click would.
  //
  // THE CAP IS NOT ENFORCED HERE. canAddPriority is what the board reads to disable a
  // fourth star; a group that gets one anyway (two people clicking at once) sees it
  // reported rather than silently dropped, the same call every other cap on this week
  // makes.
  const togglePriority = (card: RippleCard, on: boolean) =>
    run(async () => {
      const pickId = await ensurePick({ id: card.id, text: card.text });
      if (cancelledMints.current.has(card.id)) return;
      shortlistLocal(pickId, on);
      try {
        await shortlistRippleCard(code, pickId, { participantId: pid, shortlisted: on });
      } catch (e) {
        shortlistLocal(pickId, !on);
        throw e;
      }
    });

  const toggleDisputed = (card: RippleCard, on: boolean) =>
    run(async () => {
      const pickId = await ensurePick({ id: card.id, text: card.text });
      if (cancelledMints.current.has(card.id)) return;
      const before = board.picks.get(card.id)?.section ?? null;
      sectionLocal(pickId, on ? DISPUTED_SECTION : null);
      try {
        await disputeRippleCard(code, pickId, { participantId: pid, disputed: on });
      } catch (e) {
        sectionLocal(pickId, before);
        throw e;
      }
    });

  // Why the room could not agree. SEPARATE FROM THE FLAG so it survives being un-flagged
  // and comes back if the group changes its mind — the note is the group's writing and the
  // flag is a state, and losing the first to toggle the second would be the worse bug.
  const setDisputeNote = (card: RippleCard, note: string) =>
    run(async () => {
      const pickId = await ensurePick({ id: card.id, text: card.text });
      if (cancelledMints.current.has(card.id)) return;
      const before = board.picks.get(card.id)?.description ?? null;
      describeLocal(pickId, note);
      try {
        await describeRippleCard(code, pickId, { participantId: pid, description: note });
      } catch (e) {
        describeLocal(pickId, before);
        throw e;
      }
    });

  // --- act 6: choosing three directions, and sharpening each ---------------------------
  //
  // A DIRECTION IS A RESPONSE CARRYING `shortlisted`. No second card and no rank column —
  // see lib/commitments-shape — so a tick here is a real write that survives a reload and
  // that every member sees. Un-ticking strands the sharpening answers rather than deleting
  // them; they come back whole if the group re-chooses it, which is what
  // strandedSharpening reports.
  const toggleDirection = (card: RippleCard, on: boolean) =>
    run(async () => {
      shortlistLocal(card.id, on);
      try {
        await shortlistRippleCard(code, card.id, { participantId: pid, shortlisted: on });
      } catch (e) {
        shortlistLocal(card.id, !on);
        throw e;
      }
    });

  // One of a direction's three fields. Creates on first answer, edits in place after, and
  // DELETES when the text is cleared — an empty card would read as answered to every
  // counter on the board while showing nothing.
  const setSharpen = (
    direction: RippleCard,
    field: DirectionFieldKey,
    text: string
  ) =>
    run(async () => {
      const existing = sharpenFor(board, direction.id, field)[0];
      const next = text.trim();
      if (!next) {
        if (!existing) return;
        removeLocal(existing.id);
        try {
          await deleteRippleCard(code, existing.id, { participantId: pid });
        } catch (e) {
          unremoveLocal(existing.id);
          throw e;
        }
        return;
      }
      if (existing) {
        const before = existing.text;
        editLocal(existing.id, next);
        try {
          await editRippleCard(code, existing.id, { participantId: pid, text: next });
        } catch (e) {
          editLocal(existing.id, before);
          throw e;
        }
        return;
      }
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: "SECOND",
        cardKind: "sharpen",
        parentCardId: direction.id,
        section: field,
        text: next,
      });
      const created = res?.card as RippleCard | undefined;
      if (created) addLocal(created);
    });

  // What step 2 SHOWS for a Session 3 card: the pick's scores once it exists, and the
  // optimistic patch before it does.
  const scoresFor = (sourceId: string) => {
    const pick = board.picks.get(sourceId);
    if (pick) return cardScores(pick);
    const pending = pendingScores.get(sourceId);
    return {
      plausibility: pending?.plausibility ?? null,
      impact: pending?.impact ?? null,
    };
  };

  // ---- step 5 ----------------------------------------------------------------


  // The server's stamp is the authority on both of these: on a shared board two people can
  // press Submit seconds apart, and the response says whose press counted.
  const submitWeek = () =>
    run(async () => {
      const r = await submitRippleBoard(code, { participantId: pid });
      setSubmitted({ at: r.submittedAt, by: r.submittedBy });
    });

  const undoSubmit = () =>
    run(async () => {
      await unsubmitRippleBoard(code, { participantId: pid });
      setSubmitted({ at: null, by: null });
    });

  // ---- the steps -------------------------------------------------------------

  // THREE tabs carry written fields, and which sections land on one is the step registry's
  // call, not this file's — so a pre-rebuild board and an admin's hand-typed tab name are
  // handled in one place rather than re-guessed here. The buckets are disjoint, so no
  // section can render on two tabs at once.
  const sectionsFor = (step: CommitmentsSectionStep) =>
    commitmentsSectionsFor(sections, step);

  // How many of a step's prompts have been answered at all. The unit is the PROMPT, not the
  // answer: each takes as many answers as the group has, so counting answers would give a
  // number with no denominator and nothing to draw a bar against.
  const answeredCount = (spec: typeof sections) =>
    spec.filter((sec) =>
      cards.some((c) => c.order === "STICKY" && c.section === sec.key && c.text.trim())
    ).length;

  // Step 5's composer. Built here because this is the only place holding the four signals
  // the readiness gate reads, and the stored override, which lives on the session config
  // rather than on a card.
  //
  // RAW config, not resolveConfig(): execSummary is deliberately outside that whitelist so
  // a group's draft never ships in the payload every member's board fetches. On this board
  // it is already in hand, because this component holds the session row.
  const execReady = execSummaryReadiness({
    grounding: answeredCount(sectionsFor("reconnect")),
    groundingTotal: sectionsFor("reconnect").length,
    priorities: priorities(board).length,
    outcomes: answeredCount(sectionsFor("outcomes")),
    outcomesTotal: sectionsFor("outcomes").length,
    responses: board.responses.length,
    vision: answeredCount(sectionsFor("vision")),
    visionTotal: sectionsFor("vision").length,
    directions: board.boldMoves.length,
    sharpened: board.boldMoves.filter((m) => isSharpened(board, m.id)).length,
  });
  const execOverride = coerceExecSummary(
    (view?.session.config as Record<string, unknown> | undefined)?.execSummary
  );

  // THE STEP IS LOCKED until the four earlier ones are done.
  //
  // IT RE-LOCKS IF A STEP IS UNDONE, unless the group has written its own lead. The gate
  // exists to stop a summary being built out of nothing, so a group that deletes an answer
  // should see the checklist again — the first version kept the step open for ANY stored
  // draft, which meant undoing a step changed nothing and looked broken.
  //
  // An EDITED lead is different: that is the group's own writing, and hiding it behind a
  // checklist because they went back to fix a typo in step 4 would be taking their work
  // away. An untouched machine draft is not their work and costs nothing to rebuild.
  // THE FOUR STEPS, AND NOTHING ELSE. This used to read `!execReady.ready && !execEdited`,
  // so a stored note held the step open on a board that was not finished — and deleting
  // that note slammed it shut with no way back, because the only thing that had been
  // unlocking it was the thing just deleted. A group could write a note, delete it, and
  // never reach the box again short of finishing all four steps.
  //
  // The `execEdited` escape dates from when this override was the handoff's LEAD and the
  // rule was that a group's own writing must never be hidden behind a checklist. It is a
  // note alongside the deck now, not the deck's opening, and it is not lost when the step
  // closes: it stays stored, it still renders on the handoff, and it is there to edit again
  // the moment the four steps are done.
  const reviewLocked = !execReady.ready;
  const stepsDone = execReady.steps.length - execReady.missing.length;

  // The answers to one tab's prompts, flattened in board order. Used by the review step,
  // which reads the week back rather than editing it.
  const answersOn = (step: CommitmentsSectionStep) =>
    sectionsFor(step).flatMap((sec) =>
      cards
        .filter((c) => c.order === "STICKY" && c.section === sec.key && c.text.trim())
        .sort((a, b) => a.sort - b.sort)
        .map((c) => c.text.trim())
    );

  const visionAnswers = answersOn("vision");

  const execComposer = (
    <ExecSummaryComposer
      sessionCode={code}
      participantId={pid}
      override={execOverride}
      canEdit={editable}
      onStored={refresh}
    />
  );

  const worksheetFor = (spec: typeof sections) => (
    <WorksheetSections
      sections={spec}
      cards={cards}
      editable={editable}
      canEdit={canEditCard}
      busy={busy}
      playerNames={playerNames}
      onAdd={addSectionCard}
      onDelete={removeCard}
      onEdit={editCardById}
      onReorder={reorderSectionCard}
    />
  );

  const stepBody = (
    <div className="flex flex-col gap-8">
      {/* Same markup as RipplesTeamView's step tabs, SynthesisTeamView's and
          WorksheetSections' — the four read as one pattern. The aria-label is what
          distinguishes this from the outer past-weeks bar, which is styled identically.
          Steps are open from the start: a shared board is worked asynchronously, so
          gating one behind another strands people. */}
      <div
        role="tablist"
        aria-label="Commitments steps"
        className="flex flex-wrap gap-1 border-b border-[var(--rule)]"
      >
        {COMMIT_STEPS.map((sp) => {
          // Step 5 is the only one that can be shut. It is built FROM the other four, so
          // opening it early shows a locked box and a model call made out of nothing.
          const locked = sp === "review" && reviewLocked;
          return (
            <button
              key={sp}
              role="tab"
              aria-selected={step === sp}
              // CLICKABLE EVEN WHEN LOCKED. A padlock that does nothing on click tells a
              // group only that the page is broken; clicking it opens the list of what is
              // left, which is the question they clicked to ask.
              title={locked ? `Finish these first: ${execReady.missing.join(", ")}` : undefined}
              onClick={() => setStep(sp)}
              className={
                "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] font-bold uppercase tracking-[0.06em] transition-colors " +
                (locked
                  ? "rounded-t-[2px] bg-[var(--rule)] text-muted " +
                    (step === sp ? "border-ink" : "border-transparent hover:text-ink")
                  : step === sp
                    ? "border-ink text-ink"
                    : "border-transparent text-muted hover:text-ink")
              }
            >
              {locked && (
                // A padlock, inline rather than an icon font: two paths, and it has to sit
                // on the baseline of 12px uppercase text.
                <svg
                  aria-hidden
                  viewBox="0 0 10 12"
                  className="h-[11px] w-[9px] shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                >
                  <rect x="0.7" y="5" width="8.6" height="6.3" rx="1" />
                  <path d="M2.6 5V3.3a2.4 2.4 0 0 1 4.8 0V5" />
                </svg>
              )}
              {STEP_LABELS[sp]}
              {locked && (
                <span className="font-mono text-[10px] font-bold tabular-nums">
                  {stepsDone}/4
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Act 1. What needs attention, and what to keep in view — with the whole of the
          last three sessions in the rail, because "reconnect" is what the activity is. */}
      {step === "reconnect" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            {/* ABOVE THE QUESTIONS, NOT FOLDED UNDER THEM. This is how to run the ten
                minutes, and the talking is most of it — a group that opens two answer
                boxes and starts typing has skipped the activity. It is hardcoded rather
                than a section because it is not a prompt: nothing is written under it, and
                giving it an answer box is the exact misreading it exists to prevent.

                THE COUNT IS DERIVED. A facilitator can add a third prompt in the program
                editor, and "the two questions below" would then be quietly wrong. */}
            {sectionsFor("reconnect").length > 0 && (
              <StepIntro title="Reconnect with the scenario">
                <p className="m-0">
                  Take a few minutes to reconnect with your group&rsquo;s scenario. Think and
                  talk about the role of public health in this world and how it&rsquo;s
                  changed. Then answer the{" "}
                  {sectionsFor("reconnect").length === 2 ? "two " : ""}questions below.
                </p>
              </StepIntro>
            )}
            {sectionsFor("reconnect").length > 0 ? (
              worksheetFor(sectionsFor("reconnect"))
            ) : (
              <NoPrompts />
            )}
            {/* Counts PROMPTS with at least one answer, not answers: the prompts take as
                many as the group has, so a tally of answers would have no denominator and
                could not be a bar. */}
            <StepProgress
              done={answeredCount(sectionsFor("reconnect"))}
              total={sectionsFor("reconnect").length}
              noun="answered"
            />
          </div>
          <Week3Reference cards={week3Cards} week2Cards={week2Cards} scenario={scenario} />
        </div>
      )}

      {/* Act 2. Weigh the walls, then name three. The discussion prompts are guidance and
          live in the board's own Directions fold — the group's answer here is what it
          stars, not a paragraph it types. */}
      {step === "prioritize" && (
        <MatrixBoard
          week3Cards={week3Cards}
          board={board}
          pickFor={pickFor}
          scoresFor={scoresFor}
          editable={editable}
          busy={busy}
          onScore={scoreStake}
          onClear={clearStake}
          onTogglePriority={togglePriority}
          onToggleDisputed={toggleDisputed}
          onNote={setDisputeNote}
        />
      )}

      {/* Act 3. The priorities ride above as context rather than as headings to write
          under: the group was asked for outcomes for its top three, not one outcome per
          row, and nesting the boxes would have made the looser answer impossible. */}
      {step === "outcomes" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <PriorityRecap
              rows={priorities(board)}
              onGoToPriorities={() => setStep("prioritize")}
            />
            {sectionsFor("outcomes").length > 0 ? (
              worksheetFor(sectionsFor("outcomes"))
            ) : (
              <NoPrompts />
            )}
            <StepProgress
              done={answeredCount(sectionsFor("outcomes"))}
              total={sectionsFor("outcomes").length}
              noun="answered"
            />
          </div>
          {/* RISKS AND FEARS FIRST, THEN HOPES — the order the activity asks for. A group
              writing what it wants public health to make possible should meet what it is
              afraid of before what it hopes for, or the outcomes come out as restated
              hopes. */}
          <Week3Reference
            cards={week3Cards}
            week2Cards={week2Cards}
            scenario={scenario}
            variant="stakes-first"
          />
        </div>
      )}

      {step === "responses" && (
        <ResponseBoard
          board={board}
          sections={sectionsFor("outcomes")}
          cards={cards}
          week3Cards={week3Cards}
          week2Cards={week2Cards}
          scenario={scenario}
          editable={editable}
          busy={busy}
          onAdd={addResponse}
          onEdit={editCard}
          onDelete={removeCard}
          onGoToAspiration={() => setStep("outcomes")}
        />
      )}

      {/* Act 5. One short statement, with the outcomes and the response wall under it as
          the raw material it is drawn from. */}
      {/* Act 5. The outcomes and the response wall go in the RAIL rather than in a panel
          under the question. This step asks the group to look across both and say what it
          all adds up to, and material stacked below the writing meant scrolling away from
          the box you are meant to be writing in. What the step produces is on the question
          itself now, last, where it is read when it matters. */}
      {step === "vision" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            {sectionsFor("vision").length > 0 ? (
              worksheetFor(sectionsFor("vision"))
            ) : (
              <NoPrompts />
            )}
            <StepProgress
              done={answeredCount(sectionsFor("vision"))}
              total={sectionsFor("vision").length}
              noun="answered"
            />
          </div>
          <Week4Reference outcomes={answersOn("outcomes")} responses={board.responses} />
        </div>
      )}

      {/* Act 6. Choose three off the wall, then sharpen each. */}
      {step === "directions" && (
        <MovesBoard
          board={board}
          editable={editable}
          busy={busy}
          onToggle={toggleDirection}
          onSharpen={setSharpen}
          onGoToResponses={() => setStep("responses")}
        />
      )}

      {/* Step 5. It reads the same optimistic cards as every other step now: the pane that
          had to be shaped from the server's view was the read-back, and that is gone. What
          is left is the group's own two answers, where a line appearing the instant it is
          typed is the right behaviour rather than the wrong one. */}
      {step === "review" && reviewLocked && <HandoffGuideLocked steps={execReady.steps} />}

      {step === "review" && !reviewLocked && (
        <ReviewBoard
          summaryHref={summaryHref}
          composer={execComposer}
          vision={visionAnswers}
          directions={board.boldMoves.map((m) => ({
            text: m.text,
            fields: DIRECTION_FIELDS.map((f) => ({
              label: f.label,
              answers: sharpenFor(board, m.id, f.key).map((c) => c.text.trim()).filter(Boolean),
            })),
          }))}
          submittedAt={submitted.at}
          submittedBy={submitted.by}
          editable={editable}
          busy={busy}
          onSubmit={submitWeek}
          onUndo={undoSubmit}
        />
      )}
    </div>
  );

  const toggle = (
    <ScenarioToggle
      showingScenario={showScenario}
      exerciseLabel="Worksheet"
      onToggle={() => setShowScenario((v) => !v)}
      disabled={busy}
    />
  );

  return (
    <Shell wide fluid={!showScenario}>
      {inTabs ? (
        <SessionHeaderActions>{toggle}</SessionHeaderActions>
      ) : (
        <PhaseHeader
          phase={phase}
          title={title || config.scenarioTitle}
          kindLabel="Commitments"
          right={toggle}
        />
      )}

      {showScenario ? (
        <ScenarioPanel
          scenario={scenario ?? null}
          drivers={drivers}
          hiddenSections={hiddenSections}
          premise={config.premise}
        />
      ) : (
        <RailWidth wide={false}>{stepBody}</RailWidth>
      )}

      {flash && <Flash msg={flash} />}
    </Shell>
  );
}
