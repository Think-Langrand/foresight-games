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
import { MovesBoard } from "@/components/workshop/commitments/MovesBoard";
import { BacktrackTimeline } from "@/components/workshop/commitments/BacktrackTimeline";
import { HandoffBoard } from "@/components/workshop/commitments/HandoffBoard";
import {
  useRipplesView,
  useOptimisticCards,
  deleteRippleCard,
  editRippleCard,
  postRippleCard,
  reorderRippleCard,
  shortlistRippleCard,
  periodRippleCard,
} from "@/components/workshop/hooks";
import { useSharedBoardMembership } from "@/components/workshop/membership";
import type { PublicDriverCard, Scenario } from "@/lib/foresight/types";
import { childOrderOf, type RippleCard, type RipplePhase } from "@/lib/ripples-types";
import { SORT_STEP } from "@/lib/synthesis-shape";
import {
  MILESTONES_PER_MOVE,
  indexCommitmentsBoard,
  milestoneCount,
  milestonesFor,
  type PeriodKey,
} from "@/lib/commitments-shape";
import type { WorksheetSection } from "@/lib/exercise-types";
import { RailWidth } from "@/components/workshop/synthesis/boardGutters";

// Session 4, the COMMITMENTS board. Four steps on one shared board:
//
//   1. Aspiration            what we are aspiring to, who it serves, what has to be true
//   2. Strategic responses   a wall of moves that would get us there
//   3. Bold moves            down-select to three
//   4. Backcasting           each move's milestones across ten years, in two-year steps
//
// Step 1 is the ordinary section substrate, so its prompts are the facilitator's and are
// edited in the program editor rather than here. Steps 2 to 4 are code. See
// lib/commitments-shape's header for why the week is split that way.

const NO_CARDS: RippleCard[] = [];

// Local to this file, the way Week 3 keeps its own. There is no step registry and these
// are not worth inventing one for.
type CommitStep = "aspiration" | "responses" | "moves" | "timeline" | "handoff";
const COMMIT_STEPS: readonly CommitStep[] = [
  "aspiration",
  "responses",
  "moves",
  "timeline",
  "handoff",
];
const STEP_LABELS: Record<CommitStep, string> = {
  aspiration: "1 · Aspiration",
  responses: "2 · Strategic responses",
  moves: "3 · Bold moves",
  timeline: "4 · Backcasting",
  handoff: "5 · The handoff",
};

export function CommitmentsTeamView({
  code,
  basePath,
  scenario,
  drivers = [],
  hiddenSections,
  sections = [],
  week3Cards = [],
  week1Uncertainties = [],
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
  week1Uncertainties?: { key: string; bucket: string; answers: { id: string; text: string }[] }[];
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
    shortlistLocal,
    dropShortlistLocal,
    sectionLocal,
    dropSectionLocal,
  } = useOptimisticCards(view?.cards ?? NO_CARDS);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [showScenario, setShowScenario] = useState(true);
  // Declared up here with the other state, NOT inside the build branch below — several
  // early returns sit between the two, and a hook after one of them would break the order.
  const [step, setStep] = useState<CommitStep>("aspiration");

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

  // Picking a bold move. A real write, not client state: it survives a reload and every
  // member of the group sees it. The overlay drops on failure so a refused tick does not
  // leave a card looking chosen.
  const toggleBoldMove = (card: RippleCard, shortlisted: boolean) => {
    shortlistLocal(card.id, shortlisted);
    run(async () => {
      try {
        await shortlistRippleCard(code, card.id, { participantId: pid, shortlisted });
      } catch (e) {
        dropShortlistLocal(card.id);
        throw e;
      }
    });
  };

  // A milestone hangs off the move it backcasts, which is what makes the lane its lane
  // and what makes a delete cascade correctly. Its PERIOD is separate, in `section`: a
  // parent says which move, not which column.
  const addMilestone = (move: RippleCard, period: PeriodKey, text: string) =>
    run(async () => {
      // The cap is per move across the whole span, so it is checked against the move and
      // not the cell. Guarded here as well as in the composer, because the composer's
      // `full` is a render away from the click.
      if (milestoneCount(board, move.id) >= MILESTONES_PER_MOVE) {
        throw new Error(`A move takes ${MILESTONES_PER_MOVE} milestones. Delete one first.`);
      }
      const order = childOrderOf(move.order);
      if (!order) throw new Error("That chain is already as deep as it goes.");
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: order,
        parentCardId: move.id,
        cardKind: "milestone",
        section: period,
        text,
        sort: (milestonesFor(board, move.id, period).length + 1) * SORT_STEP,
      });
      if (res?.card) addLocal(res.card as RippleCard);
    });

  const moveMilestone = (card: RippleCard, period: PeriodKey) => {
    sectionLocal(card.id, period);
    run(async () => {
      try {
        await periodRippleCard(code, card.id, { participantId: pid, period });
      } catch (e) {
        dropSectionLocal(card.id);
        throw e;
      }
    });
  };

  // A handoff mark: a card on THIS board pointing at an earlier week's card. Nothing on
  // Session 1's or Session 3's board is touched, so the star the handoff deck draws is
  // derived rather than stored. `on` false deletes the mark that already exists.
  const toggleMark = (
    kind: "pick" | "settled",
    source: { id: string; text: string },
    on: boolean
  ) => {
    const existing = (kind === "pick" ? board.picks : board.settled).get(source.id);
    if (on === Boolean(existing)) return;
    if (existing) {
      removeLocal(existing.id);
      run(async () => {
        try {
          await deleteRippleCard(code, existing.id, { participantId: pid });
        } catch (e) {
          unremoveLocal(existing.id);
          throw e;
        }
      });
      return;
    }
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
    });
  };

  // ---- the steps -------------------------------------------------------------

  // TWO steps carry written fields, so `sections` is split by `step`. Anything an admin
  // adds in the program editor has no step and falls to step 1, beside the aspiration
  // prompts, which is where an extra question belongs. The split is what keeps a section
  // from rendering on two tabs at once.
  const HANDOFF_STEP = "The handoff";
  const sectionsFor = (step: "aspiration" | "handoff") =>
    sections.filter((sec) =>
      step === "handoff" ? sec.step === HANDOFF_STEP : sec.step !== HANDOFF_STEP
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
    sectionsFor("aspiration").length > 0 ? (
      <WorksheetSections
        sections={sectionsFor("aspiration")}
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

      {step === "aspiration" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0">{aspirationBody}</div>
          <Week3Reference cards={week3Cards} />
        </div>
      )}

      {step === "responses" && (
        <ResponseBoard
          board={board}
          sections={sections}
          cards={cards}
          week3Cards={week3Cards}
          editable={editable}
          busy={busy}
          onAdd={addResponse}
          onEdit={editCard}
          onDelete={removeCard}
          onGoToAspiration={() => setStep("aspiration")}
        />
      )}

      {step === "moves" && (
        <MovesBoard
          board={board}
          sections={sections}
          cards={cards}
          editable={editable}
          onToggle={toggleBoldMove}
          onGoToAspiration={() => setStep("aspiration")}
          onGoToResponses={() => setStep("responses")}
        />
      )}

      {step === "handoff" && (
        <HandoffBoard
          board={board}
          sections={sections}
          cards={cards}
          week3Cards={week3Cards}
          week1Uncertainties={week1Uncertainties}
          editable={editable}
          onTogglePick={(source, on) => toggleMark("pick", source, on)}
          // The checkbox reads "still open", so ticking it REMOVES the settled mark.
          onToggleSettled={(source, settled) => toggleMark("settled", source, settled)}
          onGoToAspiration={() => setStep("aspiration")}
        >
          {sectionsFor("handoff").length > 0 && worksheetFor(sectionsFor("handoff"))}
        </HandoffBoard>
      )}

      {step === "timeline" && (
        <BacktrackTimeline
          board={board}
          sections={sections}
          cards={cards}
          editable={editable}
          busy={busy}
          onAdd={addMilestone}
          onEdit={editCard}
          onDelete={removeCard}
          onMove={moveMilestone}
          onGoToAspiration={() => setStep("aspiration")}
          onGoToMoves={() => setStep("moves")}
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
