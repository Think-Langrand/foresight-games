"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ScenarioPanel } from "@/components/workshop/ScenarioPanel";
import { ScenarioToggle } from "@/components/workshop/ScenarioToggle";
import { SessionHeaderActions, useInSessionTabs } from "@/components/design-groups/SessionHeader";
import { WorksheetSections } from "@/components/workshop/WorksheetSections";
import { Centered, Flash, Panel, PhaseHeader, Shell } from "@/components/workshop/BoardShell";
import { Week3Reference } from "@/components/workshop/commitments/Week3Reference";
import { ResponseBoard } from "@/components/workshop/commitments/ResponseBoard";
import { ResponseRecap } from "@/components/workshop/commitments/ResponseRecap";
import { MatrixBoard } from "@/components/workshop/commitments/MatrixBoard";
import { ReviewBoard } from "@/components/workshop/commitments/ReviewBoard";
import {
  useRipplesView,
  useOptimisticCards,
  deleteRippleCard,
  editRippleCard,
  postRippleCard,
  scoreRippleCard,
  reorderRippleCard,
  submitRippleBoard,
  unsubmitRippleBoard,
} from "@/components/workshop/hooks";
import { shapeFromView } from "@/lib/group-answers-shape";
import { useSharedBoardMembership } from "@/components/workshop/membership";
import type { PublicDriverCard, Scenario } from "@/lib/foresight/types";
import type { RippleCard, RipplePhase } from "@/lib/ripples-types";
import type { ScorePatchInput } from "@/lib/ripples-scoring";
import { SORT_STEP } from "@/lib/synthesis-shape";
import {
  indexCommitmentsBoard,
} from "@/lib/commitments-shape";
import {
  COMMITMENTS_STEP_MOVES,
  type WorksheetSection,
} from "@/lib/exercise-types";
import { RailWidth } from "@/components/workshop/synthesis/boardGutters";

// Session 4, the COMMITMENTS board. Five steps on one shared board, and the whole week
// builds the handoff rather than curating it in a step of its own:
//
//   1. Key changes       summarize this world, and what it stops making true
//   2. Risks & opps      Session 3's stakes placed on the impact x plausibility matrix
//   3. Responses         a wall of moves
//   4. Role & moves      the role public health plays here, and three bold moves
//   5. Review            read the whole week back, then submit
//
// Steps 1 and 4 ride the section substrate, so their prompts are the facilitator's and are
// edited in the program editor rather than here. Steps 2, 3 and 5 are code. See
// lib/commitments-shape's header for why the week is split that way.
//
// PARKED, NOT DELETED. The backcasting timeline and the three-move down-select are wanted
// for the next workshop, so `BacktrackTimeline` and `MovesBoard` stay in the tree, their
// card kinds stay in CARD_KINDS, and their write paths stay on the routes. They are simply
// not in COMMIT_STEPS. Putting either back is adding its entry here and its branch below.

const NO_CARDS: RippleCard[] = [];

// Local to this file, the way Week 3 keeps its own. There is no step registry and these
// are not worth inventing one for.
type CommitStep = "changes" | "matrix" | "responses" | "moves" | "review";
const COMMIT_STEPS: readonly CommitStep[] = [
  "changes",
  "matrix",
  "responses",
  "moves",
  "review",
];
const STEP_LABELS: Record<CommitStep, string> = {
  changes: "1 \u00b7 Key changes",
  matrix: "2 \u00b7 Risks & opportunities",
  responses: "3 \u00b7 Strategic responses",
  moves: "4 \u00b7 Role & bold moves",
  review: "5 \u00b7 Review & submit",
};

export function CommitmentsTeamView({
  code,
  basePath,
  scenario,
  drivers = [],
  hiddenSections,
  sections = [],
  week3Cards = [],
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
    scoreLocal,
    settleScoreLocal,
    dropScoreLocal,
  } = useOptimisticCards(view?.cards ?? NO_CARDS);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [showScenario, setShowScenario] = useState(true);
  // Declared up here with the other state, NOT inside the build branch below — several
  // early returns sit between the two, and a hook after one of them would break the order.
  const [step, setStep] = useState<CommitStep>("changes");
  // Step 5's marks, keyed `<kind>:<sourceCardId>`, while their write is in flight. A mark
  // has no id until the server mints one, so it cannot ride the card overlay the way every
  // other write on this board does; without this the board showed nothing at all for the
  // length of a round trip, the cap read stale, and a group ticking four risks quickly got
  // all four.
  const [markPending, setMarkPending] = useState<Set<string>>(() => new Set());
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

  // Score a pick. The same shape as Week 2's scoreKeyChange, including the three-part
  // overlay: `scoreLocal` merges so the two axis rows do not wipe each other, and the
  // overlay's `inflight` counter is what stops this viewer being pinned to a number a
  // teammate has since overwritten.
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
  // so the floor counter and the Place control do not lag a round trip behind the click.
  const pickFor = (sourceId: string) =>
    isStarred(sourceId) ? board.picks.get(sourceId) : undefined;

  // ---- step 5 ----------------------------------------------------------------

  // What the group is approving, shaped exactly the way the admin viewer and the CSV shape
  // it, so the three cannot disagree. From `view` (the SERVER's cards) and not from the
  // optimistic `cards`: everywhere else on this board the overlay is the right answer, but
  // a review pane must not show a line as written when its write is still in flight.
  //
  // Deliberately NOT useMemo — several early returns sit above this line and a hook here
  // would break the hook order. The guard on `step` is what keeps it off the other four
  // steps' render path; on this one it walks the board once.
  const reviewShape = (() => {
    if (step !== "review") return null;
    const shaped = shapeFromView(
      { id: "live", title: title || "Commitments", type: "commitments", sections },
      view
    );
    return shaped.kind === "commitments" ? shaped : null;
  })();

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

  // TWO steps carry written fields. Anything an admin adds with no step, or with a step
  // string that matches neither, falls to step 1 beside the summary prompts, which is where
  // an extra question belongs. The two branches are disjoint, so no section can render on
  // two tabs at once.
  const sectionsFor = (which: "changes" | "moves") =>
    sections.filter((sec) =>
      which === "moves"
        ? sec.step === COMMITMENTS_STEP_MOVES
        : sec.step !== COMMITMENTS_STEP_MOVES
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

  const aspirationBody =
    sectionsFor("changes").length > 0 ? (
      worksheetFor(sectionsFor("changes"))
    ) : (
      <p className="text-[13px] italic text-muted">
        No blocks are set up for this step yet. A facilitator adds them in the program
        editor.
      </p>
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
        {COMMIT_STEPS.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={step === s}
            onClick={() => setStep(s)}
            className={
              "-mb-px border-b-2 px-3 py-2 text-[12px] font-bold uppercase tracking-[0.06em] transition-colors " +
              (step === s ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")
            }
          >
            {STEP_LABELS[s]}
          </button>
        ))}
      </div>

      {step === "changes" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0">{aspirationBody}</div>
          <Week3Reference cards={week3Cards} />
        </div>
      )}

      {step === "matrix" && (
        <MatrixBoard
          week3Cards={week3Cards}
          pickFor={pickFor}
          editable={editable}
          busy={busy}
          onPlace={(c) => toggleMark("pick", { id: c.id, text: c.text }, true)}
          onRemove={(c) => toggleMark("pick", { id: c.id, text: c.text }, false)}
          onScore={scorePick}
        />
      )}

      {step === "responses" && (
        <ResponseBoard
          board={board}
          sections={sectionsFor("changes")}
          cards={cards}
          week3Cards={week3Cards}
          editable={editable}
          busy={busy}
          onAdd={addResponse}
          onEdit={editCard}
          onDelete={removeCard}
          onGoToAspiration={() => setStep("changes")}
        />
      )}

      {/* Step 4. The prompts are sections; the responses below them are READ-ONLY raw
          material, not a menu to choose from, which is what the microcopy has to carry. */}
      {step === "moves" && (
        <div className="flex flex-col gap-6">
          {sectionsFor("moves").length > 0 ? (
            worksheetFor(sectionsFor("moves"))
          ) : (
            <p className="text-[13px] italic text-muted">
              No blocks are set up for this step yet. A facilitator adds them in the program
              editor.
            </p>
          )}
          <ResponseRecap
            responses={board.responses}
            onGoToResponses={() => setStep("responses")}
          />
        </div>
      )}

      {/* Step 5. The read-back is shaped from the SERVER's view, not the optimistic cards:
          this is the pane a group approves, so it should show what is actually stored rather
          than what is still in flight. Everywhere else on this board the overlay is the
          right answer; here a line that has not landed yet must not look landed. */}
      {step === "review" &&
        (reviewShape ? (
          <ReviewBoard
            shaped={reviewShape}
            week3Cards={week3Cards}
            summaryHref={summaryHref}
            submittedAt={submitted.at}
            submittedBy={submitted.by}
            editable={editable}
            busy={busy}
            onSubmit={submitWeek}
            onUndo={undoSubmit}
          />
        ) : (
          <p className="text-[13px] italic text-muted">Opening the board…</p>
        ))}
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
