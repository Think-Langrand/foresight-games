"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ScenarioPanel } from "@/components/workshop/ScenarioPanel";
import { ScenarioToggle } from "@/components/workshop/ScenarioToggle";
import { SessionHeaderActions, useInSessionTabs } from "@/components/design-groups/SessionHeader";
import { WorksheetSections } from "@/components/workshop/WorksheetSections";
import { Centered, Flash, Panel, PhaseHeader, Shell } from "@/components/workshop/BoardShell";
import { ReferenceRail } from "@/components/workshop/commitments/ReferenceRail";
import { ResponseBoard } from "@/components/workshop/commitments/ResponseBoard";
import { OutcomesBoard } from "@/components/workshop/commitments/OutcomesBoard";
import { Week4Reference } from "@/components/workshop/commitments/Week4Reference";
import { MovesBoard, type AddMoveResult, type PendingFields } from "@/components/workshop/commitments/MovesBoard";
import { MatrixBoard } from "@/components/workshop/commitments/MatrixBoard";
import { StepTracker } from "@/components/workshop/commitments/StepTracker";
import { ActivityHeader } from "@/components/workshop/commitments/ActivityHeader";
import { StarterQuestions } from "@/components/workshop/commitments/StarterQuestions";
import { Checklist } from "@/components/workshop/commitments/Checklist";
import { Callout } from "@/components/workshop/commitments/Callout";
import { ContinueButton } from "@/components/workshop/commitments/ContinueButton";
import { SingleAnswer } from "@/components/workshop/commitments/SingleAnswer";
import {
  ACTIVITY_META,
  type ActivityStep,
  type CommitStep,
} from "@/components/workshop/commitments/activityMeta";
import ExecSummaryComposer from "@/components/design-groups/ExecSummaryComposer";
import HandoffGuideLocked from "@/components/design-groups/HandoffGuideLocked";
import { coerceExecSummary, execSummaryReadiness } from "@/lib/exec-summary-shape";
import { ReviewBoard } from "@/components/workshop/commitments/ReviewBoard";
import {
  useRipplesView,
  useOptimisticCards,
  deleteRippleCard,
  describeRippleCard,
  editRippleCard,
  postRippleCard,
  scoreRippleCard,
  reorderRippleCard,
  shortlistRippleCard,
  submitRippleBoard,
  unsubmitRippleBoard,
} from "@/components/workshop/hooks";
import { useSharedBoardMembership } from "@/components/workshop/membership";
import type { PublicDriverCard, Scenario } from "@/lib/foresight/types";
import type { RippleCard, RipplePhase } from "@/lib/ripples-types";
import type { ScorePatchInput } from "@/lib/ripples-scoring";
import { cardScores } from "@/lib/ripples-scoring";
import { SORT_STEP, indexSynthesisBoard, isUnnamedTheme, themeLabel } from "@/lib/synthesis-shape";
import {
  indexCommitmentsBoard,
  outcomeCoverage,
  outcomesFor,
  prioritySlots,
  priorities,
  sharpenFor,
  type DirectionFieldKey,
  type PrioritySlot,
} from "@/lib/commitments-shape";
import {
  COMMITMENTS_KEY_OVERLOOK,
  COMMITMENTS_KEY_TOGETHER,
  COMMITMENTS_KEY_VISION,
  commitmentsSectionsFor,
  type CommitmentsSectionStep,
  type WorksheetSection,
} from "@/lib/exercise-types";
import { RailWidth } from "@/components/workshop/synthesis/boardGutters";

// Session 4, "Synthesis" (internally still the COMMITMENTS board, which is what the render
// key and the card kinds say). Six activities in three steps, and a handoff the whole week
// builds rather than curating in a step of its own:
//
//   1.1 Reconnect             four starter questions, optional discussion notes
//   1.2 Prioritize            Session 3's stakes scored, three suggested, three confirmed
//   2.1 Desired outcomes      one or two outcomes under each priority
//   2.2 Strategic responses   response ideas under each outcome
//   3.1 Vision                one statement the group agrees on
//   3.2 Three bold moves      three moves, each explained by three questions, plus how
//                             they work together and a note to the committee
//   Handoff                   preview, then submit
//
// THE CHROME IS ONE REGISTRY. Every activity's eyebrow, minutes, headline, intro, starter
// questions, checklist and continue button come from ACTIVITY_META, and the tracker reads
// the same table, so the pill a group is on, the heading above it and the button under it
// cannot name three different things.
//
// FOUR BOXES RIDE THE SECTION SUBSTRATE (notes, overlook, vision, together), so a
// facilitator can reword them in the program editor and every reader picks them up through
// `commitmentsStepOf`. Everything else is a card of a kind; see lib/commitments-shape's
// header for where each activity's work lives.
//
// THE STORED STEP STRINGS ARE NOT THE TAB NAMES. A section carries the `step` STRING it was
// stored with, and `commitmentsStepOf` owns the mapping, including for pre-rebuild values.
//
// PARKED, NOT DELETED. The backcasting timeline is wanted for a future workshop, so
// `BacktrackTimeline` stays in the tree with its card kinds and write paths, simply not in
// the steps.

const NO_CARDS: RippleCard[] = [];

function NoPrompts() {
  return (
    <p className="text-[13px] italic text-muted">
      No prompts are set up for this step yet. A facilitator can add them in the program
      editor.
    </p>
  );
}

type Kind = "risk" | "opportunity";

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
  // copied onto this board. See ReferenceRail.
  week3Cards?: RippleCard[];
  // Session 2's board, for the key changes in the rail. Roots only are used.
  week2Cards?: RippleCard[];
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
  // A pick's create, while in flight, keyed by SOURCE id. A mark has no id until the server
  // mints one, so it cannot ride the card overlay the way every other write does.
  const [markPending, setMarkPending] = useState<Set<string>>(() => new Set());
  // Step 1.2's bridge: scores clicked on a Session 3 card whose pick does not exist yet,
  // keyed by SOURCE id. It lives for one round trip and is dropped the moment the pick is
  // in the optimistic cards. See scoreStake.
  const [pendingScores, setPendingScores] = useState<Map<string, ScorePatchInput>>(
    () => new Map()
  );
  // The in-flight create per source id, so two fast score clicks on one card mint one pick
  // rather than racing. A ref, not state: nothing renders from it.
  const mintingPick = useRef<Map<string, Promise<string>>>(new Map());
  // Source ids whose in-flight mint has been cancelled by Clear.
  const cancelledMints = useRef<Set<string>>(new Set());
  // The submit stamp. Seeded from the server and then owned here.
  const [submitted, setSubmitted] = useState<{ at: string | null; by: string | null }>({
    at: submittedAtProp,
    by: submittedByProp,
  });

  const inTabs = useInSessionTabs();

  // Runs one board action, showing a failure as the flash. Resolves to whether it
  // succeeded, so a composer can keep its draft when the write did not land.
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

  // One index for the whole week; every Session 4 selector reads it.
  const board = useMemo(() => indexCommitmentsBoard(cards), [cards]);

  // Session 3's index, built ONCE here and handed to the matrix and the rail, for the
  // things a pick cannot say about itself: whether its source was a risk or an
  // opportunity, what that card says NOW, and which theme it sat under. Memoised above
  // the early returns, so the hook count is stable.
  const w3 = useMemo(() => indexSynthesisBoard(week3Cards), [week3Cards]);
  const stakeIndex = useMemo(() => {
    const kind = new Map<string, Kind>();
    const text = new Map<string, string>();
    const theme = new Map<string, string>();
    const label = (t: RippleCard) => (isUnnamedTheme(t) ? themeLabel(w3, t) : t.text);
    for (const t of w3.themes) {
      for (const c of w3.risks.get(t.id) ?? []) {
        kind.set(c.id, "risk");
        text.set(c.id, c.text);
        theme.set(c.id, label(t));
      }
      for (const c of w3.opportunities.get(t.id) ?? []) {
        kind.set(c.id, "opportunity");
        text.set(c.id, c.text);
        theme.set(c.id, label(t));
      }
    }
    return { kind, text, theme };
  }, [w3]);

  // A resolved `mintingPick` entry is kept on purpose (see ensurePick) to bridge the window
  // between addLocal and React committing. Once the pick is actually in `board.picks` that
  // bridge is done, so the promise is pruned here.
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
  // The group co-owns every card on a shared board, matching the server rule exactly.
  const canEditCard = config.sharedTeam ? () => true : (c: RippleCard) => c.authorPlayerId === myPlayer?.id;

  if (!myPlayer) {
    return (
      <Shell wide>
        {!inTabs && (
          <PhaseHeader phase={phase} title={title || config.scenarioTitle} kindLabel="Synthesis" />
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

  // A new card appends after its siblings. Counted among SIBLINGS under the same parent,
  // because an outcome's order is within its priority and an idea's within its outcome.
  const endSort = (list: RippleCard[]) => (list.length + 1) * SORT_STEP;

  // ---- the four prose boxes --------------------------------------------------
  // One statement each, so the board edits the section's first card in place. Add if none,
  // edit otherwise; clearing deletes (SingleAnswer confirms first).
  const answersOn = (key: string) =>
    cards
      .filter((c) => c.order === "STICKY" && c.section === key && c.text.trim())
      .sort((a, b) => a.createdTime.localeCompare(b.createdTime));
  const setSingleAnswer = (key: string, text: string) => {
    const first = answersOn(key)[0];
    if (first) editCardById(first.id, text);
    else void addSectionCard(key, text);
  };

  // ---- 1.2: scoring is placing -----------------------------------------------
  const markKey = (sourceId: string) => `pick:${sourceId}`;
  const isStarred = (sourceId: string) =>
    board.picks.has(sourceId) !== markPending.has(markKey(sourceId));

  const deletePick = (existing: RippleCard, sourceId: string) => {
    const key = markKey(sourceId);
    if (markPending.has(key)) return;
    setMarkPending((p) => new Set(p).add(key));
    removeLocal(existing.id);
    run(async () => {
      try {
        await deleteRippleCard(code, existing.id, { participantId: pid });
      } catch (e) {
        unremoveLocal(existing.id);
        throw e;
      }
    }).finally(() =>
      setMarkPending((p) => {
        if (!p.has(key)) return p;
        const next = new Set(p);
        next.delete(key);
        return next;
      })
    );
  };

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

  const pickFor = (sourceId: string) =>
    isStarred(sourceId) ? board.picks.get(sourceId) : undefined;

  // The first click on a card has to paint before the pick that will hold the score
  // exists. `mintingPick` holds the in-flight create itself: both scales clicked in quick
  // succession must not send two creates, and 0018's unique (code, source_card_id) would
  // turn the second into a 409.
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
      // KEPT ON SUCCESS, deliberately: a settled promise is a good guard, and a later
      // caller awaits it and gets the id the first call minted. Dropped only on failure,
      // and in clearStake.
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
    setPendingScores((m) => new Map(m).set(card.id, { ...m.get(card.id), ...patch }));
    run(async () => {
      const pickId = await ensurePick({ id: card.id, text: card.text });
      // Clear was pressed while this mint was in flight: clearStake owns deleting it.
      if (cancelledMints.current.has(card.id)) return;
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
      if (!ok) dropPending(card.id);
    });
  };

  // Take a scored card back off the matrix.
  const clearStake = (card: RippleCard) => {
    dropPending(card.id);
    const inFlight = mintingPick.current.get(card.id);
    mintingPick.current.delete(card.id);

    // MID-MINT: wait for the create this viewer already started and delete what it minted.
    if (inFlight && !board.picks.has(card.id)) {
      cancelledMints.current.add(card.id);
      run(async () => {
        let pickId: string;
        try {
          pickId = await inFlight;
        } catch {
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

    // THE PICK IS NOT ONLY A SCORE. It may be a confirmed priority, carry the group's "why",
    // or have desired outcomes (and their response ideas) hanging under it; 0007's cascade
    // would take all of that with a delete. So when it carries more, un-score it in place
    // and keep the card. Only a bare scored pick is deleted outright.
    const pick = board.picks.get(card.id);
    const carriesMore =
      pick &&
      (pick.shortlisted || pick.description || outcomesFor(board, pick.id).length > 0);
    if (pick && carriesMore) {
      const axes = ["plausibility", "impact"] as const;
      run(async () => {
        scoreLocal(pick.id, { plausibility: null, impact: null });
        try {
          await scoreRippleCard(code, pick.id, {
            participantId: pid,
            plausibility: null,
            impact: null,
          });
          settleScoreLocal(pick.id);
        } catch (e) {
          dropScoreLocal(pick.id, [...axes]);
          throw e;
        }
        // AND IT GIVES UP THE SLOT. A confirmed priority is the group's choice and
        // outranks the ranking by design: prioritySlots keeps it whatever it scored,
        // which is why un-scoring alone cannot release it. Nothing else un-confirms:
        // Keep only renders on a suggestion, so a cleared priority with no control to
        // remove it sat in the three forever, scoreless, and reached the handoff deck
        // with empty score cells. Clearing a card the group confirmed is the group
        // saying it is not one of the three, so the confirmation goes with the scores.
        // The "why" and any outcomes under it stay: those are writing, not a choice.
        //
        // OUTSIDE THE SCORE WRITE'S try, DELIBERATELY. Two independent writes cannot
        // share one catch: that catch calls dropScoreLocal, which exists to undo an
        // optimistic score the server REFUSED. By here the score PATCH has returned and
        // settled, so rolling it back on an un-confirm failure would revert the one
        // write that worked and leave the row showing its old scores against a nulled
        // row. It also double-counts `inflight`, which hooks.ts pairs one-to-one with
        // scoreLocal. confirmPick rolls back its own flag and rethrows, so each write
        // now undoes only itself.
        if (pick.shortlisted) await confirmPick(pick, false);
      });
      return;
    }
    if (pick) deletePick(pick, card.id);
  };

  // ---- 1.2: confirming the three ---------------------------------------------
  // `shortlisted` on a pick means CONFIRMED as a priority. The optimistic overlay shows it
  // at once; the server's answer settles it.
  const confirmPick = async (pick: RippleCard, on: boolean) => {
    if (pick.shortlisted === on) return;
    shortlistLocal(pick.id, on);
    try {
      await shortlistRippleCard(code, pick.id, { participantId: pid, shortlisted: on });
    } catch (e) {
      shortlistLocal(pick.id, !on);
      throw e;
    }
  };
  const keepPriority = (pick: RippleCard) => run(() => confirmPick(pick, true));
  // The way back out of a Keep. Un-confirming is all it does: the scores stay, so the card
  // drops to a suggestion and the ranking decides whether it still sits in the three. The
  // "why" and any outcomes under it stay too, which is what makes this safe to try.
  //
  // IT UNDOES A REPLACE AS WELL. replacePriority confirms every other slot so the clicked
  // one is the one that leaves; those side-effect confirmations are ordinary confirmations,
  // so undoing them one at a time walks the panel back. That is the whole reason this is
  // offered on any confirmed slot rather than only on one the group pressed Keep on: there
  // is no record of HOW a pick came to be confirmed, and the Replace case is the one people
  // actually get stuck in.
  //
  // To take a card out of the three ENTIRELY rather than hand it back to the ranking, Clear
  // on its matrix row un-scores and un-confirms together.
  const undoPriority = (pick: RippleCard) => run(() => confirmPick(pick, false));

  // Replace slot i's occupant with `next`. THE CLICKED ITEM MUST BE THE ONE THAT LEAVES,
  // and the only way to guarantee that is to confirm every other slot as it stands:
  // anything left as a suggestion is re-derived from the ranking the moment the slots
  // change, so confirming `next` alone evicts the lowest suggestion rather than the one
  // the group pointed at, and un-confirming a high-scoring occupant puts it straight back
  // as a suggestion. Confirmed slots are already confirmed, so this is at most three
  // writes, run together.
  const replacePriority = (slotIndex: number, next: RippleCard) =>
    run(async () => {
      const slots = prioritySlots(board);
      const prev = slots[slotIndex] ?? null;
      await Promise.all([
        confirmPick(next, true),
        ...(prev?.status === "confirmed" ? [confirmPick(prev.card, false)] : []),
        ...slots
          .filter((s) => s.status === "suggested" && s.card.id !== prev?.card.id)
          .map((s) => confirmPick(s.card, true)),
      ]);
    });

  // Why a priority needs attention. Writing a why on a suggestion confirms it: explaining
  // a priority is choosing it. The text survives un-confirming (it is the group's writing).
  const setWhy = (pick: RippleCard, why: string) =>
    run(async () => {
      if (!pick.shortlisted && why.trim()) await confirmPick(pick, true);
      const before = pick.description ?? null;
      describeLocal(pick.id, why);
      try {
        await describeRippleCard(code, pick.id, { participantId: pid, description: why });
      } catch (e) {
        describeLocal(pick.id, before);
        throw e;
      }
    });

  // ---- 2.1 and 2.2: outcomes under picks, ideas under outcomes ---------------
  const addOutcome = (pick: RippleCard, text: string) =>
    run(async () => {
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: "SECOND",
        cardKind: "outcome",
        parentCardId: pick.id,
        text,
        sort: endSort(outcomesFor(board, pick.id)),
      });
      if (res?.card) addLocal(res.card as RippleCard);
    });

  const addResponseFor = (outcome: RippleCard, text: string) =>
    run(async () => {
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: "TERMINAL",
        cardKind: "response",
        parentCardId: outcome.id,
        text,
        sort: endSort(board.responsesByOutcome.get(outcome.id) ?? []),
      });
      if (res?.card) addLocal(res.card as RippleCard);
    });

  // ---- 3.2: the three bold moves ---------------------------------------------
  // One click creates the move and every field the group filled. The move goes first,
  // because the fields hang off it; the fields then go TOGETHER, because they are
  // independent and three round trips in a row was most of the wait. A field whose write
  // fails after the move landed is reported back rather than thrown: the move is real, and
  // MovesBoard keeps the failed text in that field's box for a click away to retry. Only
  // the move itself failing is an error (null), and then the draft stays where it was.
  const addDirectionWithFields = async (
    move: string,
    fields: PendingFields
  ): Promise<AddMoveResult> => {
    let created: RippleCard | undefined;
    const ok = await run(async () => {
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: "FIRST",
        cardKind: "direction",
        text: move,
        sort: endSort(board.directions),
      });
      created = res?.card as RippleCard | undefined;
      if (!created) throw new Error("The board did not accept that.");
      addLocal(created);
    });
    if (!ok || !created) return null;
    const parent = created;
    const entries = (Object.entries(fields) as [DirectionFieldKey, string | undefined][])
      .map(([key, value]) => [key, value?.trim() ?? ""] as const)
      .filter(([, t]) => t);
    const results = await Promise.allSettled(
      entries.map(([key, t]) =>
        postRippleCard(code, {
          participantId: pid,
          cardOrder: "SECOND",
          cardKind: "sharpen",
          parentCardId: parent.id,
          section: key,
          text: t,
        })
      )
    );
    const failed: PendingFields = {};
    results.forEach((r, i) => {
      const [key, t] = entries[i];
      if (r.status === "fulfilled" && r.value?.card) addLocal(r.value.card as RippleCard);
      else failed[key] = t;
    });
    const n = Object.keys(failed).length;
    if (n > 0) {
      setFlash(
        `The move saved, but ${n} ${n === 1 ? "explanation" : "explanations"} did not. ${n === 1 ? "It is" : "They are"} still in the box: click away from it to try again.`
      );
    }
    return { card: parent, failed };
  };

  const editDirection = (card: RippleCard, move: string) =>
    run(async () => {
      const before = card.text;
      editLocal(card.id, move);
      try {
        await editRippleCard(code, card.id, { participantId: pid, text: move });
      } catch (e) {
        editLocal(card.id, before);
        throw e;
      }
    });

  // Deleting a move takes its answers with it: 0007's `on delete cascade`.
  const removeDirection = (card: RippleCard) =>
    run(async () => {
      removeLocal(card.id);
      try {
        await deleteRippleCard(code, card.id, { participantId: pid });
      } catch (e) {
        unremoveLocal(card.id);
        throw e;
      }
    });

  // One of a move's three fields. Creates on first answer, edits in place after, and
  // DELETES when the text is cleared.
  const setSharpen = (direction: RippleCard, field: DirectionFieldKey, text: string) =>
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

  // What 1.2 SHOWS for a Session 3 card: the pick's scores once it exists, and the
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

  // ---- the handoff -----------------------------------------------------------
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

  // ---- shared readouts -------------------------------------------------------
  // A pick's source as it reads NOW on Session 3, and which wall it came from.
  const textOf = (pick: RippleCard) =>
    (pick.sourceCardId && stakeIndex.text.get(pick.sourceCardId)) || pick.text;
  const kindOf = (pick: RippleCard) =>
    pick.sourceCardId ? stakeIndex.kind.get(pick.sourceCardId) : undefined;
  const themeOf = (pick: RippleCard) =>
    pick.sourceCardId ? stakeIndex.theme.get(pick.sourceCardId) : undefined;
  const slots: PrioritySlot[] = prioritySlots(board);
  const outcomesByPriority = priorities(board).map((p) => ({
    priority: textOf(p),
    items: outcomesFor(board, p.id),
  }));
  const hopes = w3.hopesFears.filter((c) => c.cardKind === "hope");
  const visionCard = answersOn(COMMITMENTS_KEY_VISION)[0];

  const sectionsFor = (s: CommitmentsSectionStep) => commitmentsSectionsFor(sections, s);

  const execReady = execSummaryReadiness({
    priorities: slots.length,
    prioritiesWithOutcomes: outcomeCoverage(board),
    responses: board.responses.length,
    vision: answersOn(COMMITMENTS_KEY_VISION).length,
    directions: board.directions.length,
  });
  const execOverride = coerceExecSummary(
    (view?.session.config as Record<string, unknown> | undefined)?.execSummary
  );
  // THE HANDOFF IS LOCKED until the six activities before it are done, and re-locks if one
  // is undone. The committee note is stored regardless and comes back the moment the
  // activities are finished again.
  const reviewLocked = !execReady.ready;
  const stepsDone = execReady.steps.length - execReady.missing.length;

  const worksheetFor = (spec: WorksheetSection[], addLabel?: string, placeholder?: string) => (
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
      addLabel={addLabel}
      placeholder={placeholder}
    />
  );

  // One of the single-statement boxes, by section key. The label and help are the
  // facilitator's (the authored section); the placeholder and button are the activity's.
  const singleBox = (key: string, placeholder: string, saveLabel?: string, rows?: number) => {
    const sec = sections.find((s) => s.key === key);
    const [first, ...extras] = answersOn(key);
    return (
      <SingleAnswer
        label={sec?.label ?? key}
        help={sec?.help}
        placeholder={placeholder}
        card={first}
        extras={extras}
        editable={editable}
        busy={busy}
        rows={rows}
        saveLabel={saveLabel}
        onSave={(text) => setSingleAnswer(key, text)}
        onDelete={removeCard}
      />
    );
  };

  const rail = (
    <ReferenceRail
      board={w3}
      week2Cards={week2Cards}
      scenario={scenario}
      onOpenScenario={() => setShowScenario(true)}
    />
  );

  // The chrome every activity shares: header above, checklist and continue below. The
  // matrix tab owns its own two columns (its right column is the matrix, not the rail), so
  // it takes these as nodes instead.
  const footerFor = (s: ActivityStep) => (
    <>
      <Checklist
        storeKey={s}
        title={ACTIVITY_META[s].checklistTitle}
        items={ACTIVITY_META[s].checklist}
      />
      <ContinueButton label={ACTIVITY_META[s].nextLabel} onClick={() => setStep(ACTIVITY_META[s].next)} />
    </>
  );
  const activity = (s: ActivityStep, body: React.ReactNode, aside: React.ReactNode = rail) => (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <div className="flex min-w-0 flex-col gap-6">
        <ActivityHeader step={s} />
        {body}
        {footerFor(s)}
      </div>
      {aside}
    </div>
  );

  const stepBody = (
    <div className="flex flex-col gap-8">
      <StepTracker
        step={step}
        onSelect={setStep}
        reviewLocked={reviewLocked}
        stepsDone={stepsDone}
        stepsTotal={execReady.steps.length}
        missing={execReady.missing}
      />

      {/* 1.1. Four questions to talk through, and an optional notes box under them. */}
      {step === "reconnect" &&
        activity(
          "reconnect",
          <>
            <StarterQuestions starters={ACTIVITY_META.reconnect.starters} />
            {sectionsFor("reconnect").length > 0 ? (
              worksheetFor(
                sectionsFor("reconnect"),
                "+ Add note",
                "Capture anything the group wants to carry into today’s discussion…"
              )
            ) : (
              <NoPrompts />
            )}
          </>
        )}

      {/* 1.2. The matrix board owns its columns; the shell hands it the chrome. */}
      {step === "prioritize" && (
        <MatrixBoard
          w3={w3}
          board={board}
          textOf={textOf}
          kindOf={kindOf}
          themeOf={themeOf}
          pickFor={pickFor}
          scoresFor={scoresFor}
          editable={editable}
          busy={busy}
          onScore={scoreStake}
          onClear={clearStake}
          onKeep={keepPriority}
          onUndo={undoPriority}
          onReplace={replacePriority}
          onWhy={setWhy}
          header={<ActivityHeader step="prioritize" />}
          // GATED ON THE SECTION EXISTING, like the vision and together boxes. On a board
          // stamped before this section, a box here would label itself with the raw key
          // and nothing it stored would reach the deck or the admin viewer.
          overlook={
            sectionsFor("prioritize").length > 0
              ? singleBox(
                  COMMITMENTS_KEY_OVERLOOK,
                  "Note an important disputed issue and the different views…",
                  "Save",
                  3
                )
              : null
          }
          footer={footerFor("prioritize")}
        />
      )}

      {/* 2.1. Outcomes under each priority. Flat outcomes from the retired prompt, on a
          board that has any, render under the cards as legacy. */}
      {step === "outcomes" &&
        activity(
          "outcomes",
          <>
            <StarterQuestions starters={ACTIVITY_META.outcomes.starters} />
            <OutcomesBoard
              board={board}
              slots={slots}
              textOf={textOf}
              kindOf={kindOf}
              editable={editable}
              busy={busy}
              onAdd={addOutcome}
              onEdit={editCard}
              onDelete={removeCard}
              legacy={
                sectionsFor("outcomes").some((sec) => answersOn(sec.key).length > 0)
                  ? worksheetFor(sectionsFor("outcomes"))
                  : undefined
              }
            />
          </>
        )}

      {/* 2.2. Ideas under each outcome. */}
      {step === "responses" &&
        activity(
          "responses",
          <>
            <Callout>
              This is a brainstorming exercise. There are no bad ideas at this stage; aim for
              quantity over quality.
            </Callout>
            <StarterQuestions starters={ACTIVITY_META.responses.starters} />
            <ResponseBoard
              board={board}
              slots={slots}
              textOf={textOf}
              kindOf={kindOf}
              editable={editable}
              busy={busy}
              onAdd={addResponseFor}
              onEdit={editCard}
              onDelete={removeCard}
              onGoToOutcomes={() => setStep("outcomes")}
            />
          </>
        )}

      {/* 3.1. One statement, with everything it is drawn from in a panel above it. */}
      {step === "vision" &&
        activity(
          "vision",
          <>
            <StarterQuestions starters={ACTIVITY_META.vision.starters} />
            <Week4Reference
              slots={slots}
              textOf={textOf}
              hopes={hopes}
              outcomes={outcomesByPriority}
              responses={board.responses}
            />
            <Callout label="Optional sentence starter">
              <p className="m-0">
                In this future, public health is _____. It works by _____, so people and
                communities can _____.
              </p>
              <p className="m-0 mt-1 text-[13px] text-muted">
                Use this to get started, or write in your own words.
              </p>
            </Callout>
            {sectionsFor("vision").length > 0 ? (
              singleBox(
                COMMITMENTS_KEY_VISION,
                "Describe what public health becomes and what that makes possible for communities…",
                "Save vision",
                6
              )
            ) : (
              <NoPrompts />
            )}
          </>
        )}

      {/* 3.2. Three moves, how they work together, and the note to the committee. */}
      {step === "directions" &&
        activity(
          "directions",
          <>
            <StarterQuestions starters={ACTIVITY_META.directions.starters} />
            <MovesBoard
              board={board}
              vision={visionCard?.text ?? null}
              editable={editable}
              busy={busy}
              onAdd={addDirectionWithFields}
              onEditMove={editDirection}
              onDelete={removeDirection}
              onSharpen={setSharpen}
              onGoToVision={() => setStep("vision")}
            />
            {sectionsFor("directions").length > 0 &&
              singleBox(COMMITMENTS_KEY_TOGETHER, "Together, these moves…", "Save", 4)}
            <ExecSummaryComposer
              sessionCode={code}
              participantId={pid}
              override={execOverride}
              canEdit={editable}
              onStored={refresh}
              plain
              heading="Anything the steering committee should know? · Optional"
              intro=""
              placeholder="Note an unresolved choice, disagreement, or important alternative…"
            />
          </>,
          <div className="flex flex-col gap-4">
            <Week4Reference
              title="What you have said so far"
              intro="The pool your three moves are built from."
              slots={slots}
              textOf={textOf}
              outcomes={outcomesByPriority}
              responses={board.responses}
            />
            {rail}
          </div>
        )}

      {/* The handoff: locked until the six are done, then preview and submit. */}
      {step === "review" && reviewLocked && <HandoffGuideLocked steps={execReady.steps} />}
      {step === "review" && !reviewLocked && (
        <ReviewBoard
          summaryHref={summaryHref}
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
      exerciseLabel="Back to activities"
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
          kindLabel="Synthesis"
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
