"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ScenarioPanel } from "@/components/workshop/ScenarioPanel";
import { ScenarioToggle } from "@/components/workshop/ScenarioToggle";
import { WorksheetSections } from "@/components/workshop/WorksheetSections";
import { Centered, Flash, Panel, PhaseHeader, Shell } from "@/components/workshop/BoardShell";
import { ClusterBoard } from "@/components/workshop/synthesis/ClusterBoard";
import { ReadingBoard } from "@/components/workshop/synthesis/ReadingBoard";
import { ShortlistBoard } from "@/components/workshop/synthesis/ShortlistBoard";
import { ThemeWorkspace } from "@/components/workshop/synthesis/ThemeWorkspace";
import type { DeleteThemeMode } from "@/components/workshop/synthesis/DeleteThemeModal";
import { HopesFearsBoard } from "@/components/workshop/synthesis/HopesFearsBoard";
import { SynthesisPanel } from "@/components/design-groups/SynthesisPanel";
import { shapeFromView } from "@/lib/group-answers-shape";
import {
  useRipplesView,
  useOptimisticCards,
  deleteRippleCard,
  describeRippleCard,
  editRippleCard,
  parkRippleCard,
  postRippleCard,
  reorderRippleCard,
  reparentRippleCard,
  shortlistRippleCard,
} from "@/components/workshop/hooks";
import { useSharedBoardMembership } from "@/components/workshop/membership";
import type { PublicDriverCard, Scenario } from "@/lib/foresight/types";
import {
  CARD_TEXT_MAX,
  childOrderOf,
  orderAtDepth,
  type CardKind,
  type RippleCard,
  type RipplePhase,
} from "@/lib/ripples-types";
import {
  indexSynthesisBoard,
  childrenOf,
  planReorder,
  SORT_STEP,
  readingProgress,
  type ReadingField,
  type SortWrite,
  type Week2Lineage,
} from "@/lib/synthesis-shape";
import type { WorksheetSection } from "@/lib/exercise-types";

// WEEK 3 — Synthesis. Three steps on one shared board:
//   1 · Cluster            — drag Week 2's implications into themes
//   2 · Hopes & Fears      — chain hopes and fears off each theme
//   3 · Risks & Opportunities — two brainstorm boards, prompted by the first two steps
//
// One board is the whole point: the themes made in step 1 are live in step 2 and the
// hopes/fears from step 2 are live in step 3, with no facilitator hand-off in between.
//
// A sibling of RipplesTeamView rather than another branch inside it — that component
// already runs its own three-step machine (rank/map/sandbox) over different card
// semantics, and a second one would entangle two unrelated flows. The two share their
// chrome through BoardShell and their card plumbing through hooks.ts.

type SynthStep = "cluster" | "stakes" | "hopes" | "shortlist";
const SYNTH_STEPS: readonly SynthStep[] = ["cluster", "stakes", "hopes", "shortlist"];
// Steps 1 and 2 are named for the question they ask, matching the workshop wireframes.
// Steps 3 and 4 keep their old names until they are reworked — renaming them now would
// promise a step that has not been built.
const STEP_LABELS: Record<SynthStep, string> = {
  cluster: "1 · Find themes",
  stakes: "2 · Explore themes",
  hopes: "3 · Hopes & Fears",
  shortlist: "4 · Top 3 & 3",
};

const NO_CARDS: RippleCard[] = [];

export function SynthesisTeamView({
  code,
  basePath,
  scenario,
  drivers = [],
  hiddenSections,
  sections = [],
  lineage = {},
  title,
}: {
  code: string;
  basePath?: string;
  scenario?: Scenario | null;
  drivers?: PublicDriverCard[];
  hiddenSections?: string[];
  sections?: WorksheetSection[];
  // Week 2 ancestry for the step-2 drill-in, keyed by Week 2 card id. Shaped server-side
  // from the earlier-week answers the page already loads.
  lineage?: Record<string, Week2Lineage>;
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
    reparentLocal,
    dropReparentLocal,
    parkLocal,
    dropParkLocal,
    describeLocal,
    shortlistLocal,
    dropShortlistLocal,
  } = useOptimisticCards(view?.cards ?? NO_CARDS);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [showScenario, setShowScenario] = useState(true);
  // Declared up here with the other state, NOT inside the build branch below — several
  // early returns sit between the two, and a hook after one of them would break the order.
  const [step, setStep] = useState<SynthStep>("cluster");
  // Hoisted beside `step` for the same hook-order reason, and shared by steps 2 and 3 so
  // moving between them keeps you on the theme you were working on.
  const [themeId, setThemeId] = useState<string | null>(null);
  // Which hope or fear step 3 has open. Hoisted for the same hook-order reason; a newly
  // written card focuses itself, because the next thing you do is say why it matters.
  const [focusId, setFocusId] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setFlash(null);
    try {
      await fn();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, []);

  // One index for all three steps; every Week 3 selector reads it.
  const board = useMemo(() => indexSynthesisBoard(cards), [cards]);

  if (loading && !view) return <Centered>Loading session…</Centered>;
  if (error && !view)
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
        <PhaseHeader
          phase={phase}
          title={title || config.scenarioTitle}
          kindLabel="Synthesis"
        />
        <Panel>
          <p className="text-[14px] text-muted">Joining your group&rsquo;s board…</p>
        </Panel>
        {flash && <Flash msg={flash} />}
      </Shell>
    );
  }

  // ---- card operations -------------------------------------------------------
  // Each one shows the change locally first and reverts if the server refuses, so a drag
  // lands instantly instead of waiting on the realtime round-trip.

  // The board sorts by (sort, createdTime), so anything created at sort 0 would sit ahead
  // of every card that has ever been dragged. New cards get a sort past the end of the
  // list they are joining, so they simply append.
  const endSort = (list: RippleCard[]) => (list.length + 1) * SORT_STEP;

  const addTheme = (text: string) =>
    run(async () => {
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: "FIRST",
        cardKind: "theme",
        text,
        sort: endSort(board.themes),
      });
      if (res?.card) addLocal(res.card as RippleCard);
    });

  const addImplication = (text: string, themeId: string | null) =>
    run(async () => {
      const list = themeId === null ? board.unclustered : (board.clusters.get(themeId) ?? []);
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: themeId ? "SECOND" : "FIRST",
        parentCardId: themeId,
        text,
        sort: endSort(list),
      });
      if (res?.card) addLocal(res.card as RippleCard);
    });

  // Step 2. A field's card does not exist until the group answers that question, so the
  // first save creates it and every later one edits it — which is why ReadingBoard asks for
  // onSetField rather than an explicit "add".
  const setReadingField = (reading: RippleCard, field: ReadingField, text: string) => {
    if (!text.trim()) return;
    addChildCard(reading, field, text);
  };

  // Put an implication in a SECOND theme, keeping the one it is already in. The text is
  // not sent: the route reads it from the original, so two cards showing one implication
  // cannot drift apart by being typed twice. See migration 0023.
  const copyToTheme = (card: RippleCard, themeId: string) =>
    run(async () => {
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: "SECOND",
        parentCardId: themeId,
        copyOfCardId: card.id,
        sort: endSort(board.clusters.get(themeId) ?? []),
      });
      if (res?.card) addLocal(res.card as RippleCard);
    });

  // Dropped onto empty theme space: mint a theme and put the card straight into it, so
  // grouping never has to start with naming something.
  const startThemeWith = (card: RippleCard) =>
    run(async () => {
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: "FIRST",
        cardKind: "theme",
        text: `Theme ${board.themes.length + 1}`,
        sort: endSort(board.themes),
      });
      const created = res?.card as RippleCard | undefined;
      if (!created) return;
      addLocal(created);

      // No reorder needed: the card is the only one in a brand-new theme, so whatever sort
      // it already carries orders a list of one correctly. That keeps this to two round
      // trips rather than three.
      const predicted = orderAtDepth(1);
      if (predicted) reparentLocal(card.id, created.id, predicted);
      try {
        await reparentRippleCard(code, card.id, {
          participantId: pid,
          parentCardId: created.id,
        });
      } catch (e) {
        dropReparentLocal(card.id);
        throw e;
      }
    });

  // Step 1's other gesture: tick several implications in the tray, then make a theme that
  // holds them. Same destination as dragging them in one by one.
  //
  // The theme is created first and the cards moved into it one at a time, because reparent
  // is per-card. A failure part-way leaves the theme and whatever already moved — which is
  // recoverable by dragging, where rolling back would mean undoing writes that succeeded.
  const createThemeFrom = (cardIds: string[]) =>
    run(async () => {
      if (cardIds.length === 0) return;
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: "FIRST",
        cardKind: "theme",
        text: `Theme ${board.themes.length + 1}`,
        sort: endSort(board.themes),
      });
      const created = res?.card as RippleCard | undefined;
      if (!created) return;
      addLocal(created);

      const predicted = orderAtDepth(1);
      for (const id of cardIds) {
        if (predicted) reparentLocal(id, created.id, predicted);
        try {
          await reparentRippleCard(code, id, { participantId: pid, parentCardId: created.id });
        } catch (e) {
          dropReparentLocal(id);
          throw e;
        }
      }
    });

  // The rail's click: drop everything ticked into a theme that already exists. Per-card,
  // like createThemeFrom, because reparent is per-card; a failure part-way leaves what
  // already moved, which is recoverable by dragging.
  const moveManyToTheme = (cardIds: string[], themeId: string) =>
    run(async () => {
      const predicted = orderAtDepth(1);
      for (const id of cardIds) {
        if (predicted) reparentLocal(id, themeId, predicted);
        try {
          await reparentRippleCard(code, id, { participantId: pid, parentCardId: themeId });
        } catch (e) {
          dropReparentLocal(id);
          throw e;
        }
      }
    });

  const addChildCard = (parent: RippleCard, kind: CardKind, text: string) =>
    run(async () => {
      const order = childOrderOf(parent.order);
      if (!order) throw new Error("That chain is already as deep as it goes.");
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: order,
        parentCardId: parent.id,
        cardKind: kind,
        text,
      });
      if (res?.card) addLocal(res.card as RippleCard);
    });

  const editCard = (card: RippleCard, text: string) => {
    const prev = card.text;
    editLocal(card.id, text);
    run(async () => {
      try {
        await editRippleCard(code, card.id, { participantId: pid, text });
      } catch (e) {
        editLocal(card.id, prev);
        throw e;
      }
    });
  };

  const describeCard = (card: RippleCard, description: string) => {
    const prev = card.description ?? null;
    describeLocal(card.id, description || null);
    run(async () => {
      try {
        await describeRippleCard(code, card.id, { participantId: pid, description });
      } catch (e) {
        describeLocal(card.id, prev);
        throw e;
      }
    });
  };

  const removeCard = (card: RippleCard) => {
    removeLocal(card.id);
    run(async () => {
      try {
        await deleteRippleCard(code, card.id, { participantId: pid });
      } catch (e) {
        unremoveLocal(card.id); // the theme-delete guard lands here
        throw e;
      }
    });
  };

  // Delete a theme, having already decided what happens to what it holds (DeleteThemeModal).
  //
  // The theme is removed from the view only once the work has actually landed. The old
  // behaviour removed it optimistically and put it back when the route refused, which read
  // as the card vanishing and then an error arriving — the refusal was correct, the timing
  // was not.
  //
  //   move  — hand the implications back to the tray, then delete. The theme's own
  //           hope/fear chains still go, and the modal says so.
  //   purge — delete the implications first (each cascades its own subtree), then the
  //           theme. Doing the children first is what keeps the route's guard satisfied
  //           rather than working around it.
  const deleteTheme = (theme: RippleCard, mode: DeleteThemeMode) =>
    run(async () => {
      const held = board.clusters.get(theme.id) ?? [];

      for (const card of held) {
        if (mode === "move") {
          const order = orderAtDepth(0);
          if (order) reparentLocal(card.id, null, order);
          try {
            await reparentRippleCard(code, card.id, { participantId: pid, parentCardId: null });
          } catch (e) {
            dropReparentLocal(card.id);
            throw e;
          }
        } else {
          removeLocal(card.id);
          try {
            await deleteRippleCard(code, card.id, { participantId: pid });
          } catch (e) {
            unremoveLocal(card.id);
            throw e;
          }
        }
      }

      removeLocal(theme.id);
      try {
        await deleteRippleCard(code, theme.id, { participantId: pid });
      } catch (e) {
        unremoveLocal(theme.id);
        throw e;
      }
    });

  // Apply a list renumbering from planReorder. Each row is one small write; the lists here
  // hold a handful of cards, so a drop is a handful of requests at most.
  const applySorts = async (writes: SortWrite[], undo: () => void) => {
    for (const w of writes) reorderLocal(w.cardId, w.sort);
    try {
      await Promise.all(
        writes.map((w) => reorderRippleCard(code, w.cardId, { participantId: pid, sort: w.sort }))
      );
    } catch (e) {
      undo();
      throw e;
    }
  };

  // Move a card into a theme (or back to the tray) AND place it at a position in that list.
  // Parentage and order are separate columns, so this is up to two writes: the reparent,
  // then the renumbering of the destination list.
  const moveCard = (card: RippleCard, themeId: string | null, beforeId: string | null) => {
    const from = card.parentId ?? null;
    const changingList = from !== themeId;

    // The destination list as it will be once the card arrives.
    const destination = themeId === null ? board.unclustered : (board.clusters.get(themeId) ?? []);
    const list = changingList ? [...destination, card] : destination;
    const writes = planReorder(list, card.id, beforeId);

    const prevSorts = new Map(
      writes.map((w) => [w.cardId, cards.find((c) => c.id === w.cardId)?.sort ?? 0])
    );
    const undoSorts = () => {
      for (const [id, sort] of prevSorts) reorderLocal(id, sort);
    };

    // Predict the depth so the card lands in the right place immediately; the server
    // recomputes it authoritatively (and cascades to any subtree).
    const predicted = orderAtDepth(themeId ? 1 : 0);
    if (changingList && predicted) reparentLocal(card.id, themeId, predicted);

    run(async () => {
      if (changingList) {
        try {
          await reparentRippleCard(code, card.id, { participantId: pid, parentCardId: themeId });
        } catch (e) {
          dropReparentLocal(card.id); // snap back to wherever the server says it is
          throw e;
        }
      }
      await applySorts(writes, undoSorts);
    });
  };

  const moveTheme = (theme: RippleCard, beforeId: string | null) => {
    const writes = planReorder(board.themes, theme.id, beforeId);
    const prevSorts = new Map(
      writes.map((w) => [w.cardId, cards.find((c) => c.id === w.cardId)?.sort ?? 0])
    );
    run(async () =>
      applySorts(writes, () => {
        for (const [id, sort] of prevSorts) reorderLocal(id, sort);
      })
    );
  };

  // Writing a hope or fear from the gallery opens it: there is nothing else to look at,
  // and the next question — why does this matter — is the point of the step.
  //
  // Writing the OTHER SIDE of an open card deliberately does not (it uses addChildCard):
  // the whole reason the pair is shown side by side is to see them together, and pivoting
  // away the moment the second one exists would hide the pair you just completed.
  const addChainCardFocused = (parent: RippleCard, kind: CardKind, text: string) =>
    run(async () => {
      const order = childOrderOf(parent.order);
      if (!order) throw new Error("That chain is already as deep as it goes.");
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: order,
        parentCardId: parent.id,
        cardKind: kind,
        text,
      });
      const created = res?.card as RippleCard | undefined;
      if (!created) return;
      addLocal(created);
      setFocusId(created.id);
    });

  const shortlist = (card: RippleCard, shortlisted: boolean) => {
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

  const park = (card: RippleCard, parked: boolean) => {
    parkLocal(card.id, parked);
    run(async () => {
      try {
        await parkRippleCard(code, card.id, { participantId: pid, parked });
      } catch (e) {
        dropParkLocal(card.id);
        throw e;
      }
    });
  };

  // Merge two implications into one. No server action needed: edit the survivor FIRST so a
  // failure can never lose the absorbed text, then delete the other.
  //
  // Note this frees the absorbed card's (code, source_card_id) slot, so the admin seed
  // panel will offer that Week 2 answer again — re-seeding it would duplicate text already
  // merged into the survivor.
  const merge = (survivor: RippleCard, absorbed: RippleCard) => {
    const joined = `${survivor.text}\n\n${absorbed.text}`;
    if (joined.length > CARD_TEXT_MAX) {
      setFlash(`Those two are too long to merge (max ${CARD_TEXT_MAX} characters).`);
      return;
    }
    if (childrenOf(board, absorbed.id).length > 0) {
      setFlash("Empty that card out before merging it.");
      return;
    }
    editLocal(survivor.id, joined);
    removeLocal(absorbed.id);
    run(async () => {
      try {
        await editRippleCard(code, survivor.id, { participantId: pid, text: joined });
      } catch (e) {
        editLocal(survivor.id, survivor.text);
        unremoveLocal(absorbed.id);
        throw e;
      }
      try {
        await deleteRippleCard(code, absorbed.id, { participantId: pid });
      } catch (e) {
        unremoveLocal(absorbed.id);
        throw e;
      }
    });
  };

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

  // ---- locked / finished -----------------------------------------------------
  // A locked week (phase HARVEST) lands here. It renders the SAME read-only panel the
  // admin viewer and the earlier-week tabs use, so the whole Week 3 artefact — themes,
  // clusters, chains, risks/opportunities, parked — survives the lock in one place.
  if (!building) {
    const shaped = shapeFromView(
      { id: "live", title: title || "Synthesis", type: "synthesis", sections },
      view
    );
    return (
      <Shell wide>
        <PhaseHeader
          phase={phase}
          title={title || config.scenarioTitle}
          kindLabel="Synthesis"
        />
        {shaped.kind === "synthesis" ? (
          <SynthesisPanel ex={shaped} showMeta={false} />
        ) : (
          <Panel>
            <p className="text-[14px] text-muted">Opening the board…</p>
          </Panel>
        )}
        {flash && <Flash msg={flash} />}
      </Shell>
    );
  }

  const stepBody = (
    <div className="flex flex-col gap-8">
      {/* Same markup as RipplesTeamView's step tabs and WorksheetSections' — the three read
          as one pattern. The aria-label is what distinguishes this from the outer
          past-weeks bar, which is styled identically. Steps are open from the start: a
          shared board is worked asynchronously, so gating one behind another strands
          people. */}
      <div
        role="tablist"
        aria-label="Synthesis steps"
        className="flex flex-wrap gap-1 border-b border-[var(--rule)]"
      >
        {SYNTH_STEPS.map((s) => (
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

      {step === "cluster" && (
        <ClusterBoard
          board={board}
          lineage={lineage}
          editable={editable}
          busy={busy}
          onAddTheme={addTheme}
          onAddImplication={addImplication}
          onEditCard={editCard}
          onDescribeCard={describeCard}
          onMoveCard={moveCard}
          onMoveTheme={moveTheme}
          onStartTheme={startThemeWith}
          onPark={park}
          onDeleteCard={removeCard}
          onDeleteTheme={deleteTheme}
          onMerge={merge}
          onCopyToTheme={copyToTheme}
          onCreateThemeFrom={createThemeFrom}
          onMoveManyToTheme={moveManyToTheme}
        />
      )}

      {step === "stakes" && (
        <ThemeWorkspace
          board={board}
          lineage={lineage}
          editable={editable}
          busy={busy}
          themeId={themeId}
          onPickTheme={setThemeId}
          progressFor={(t) => readingProgress(board, t.id)}
          emptyBlurb="Themes are explored one at a time, so the group needs to cluster its implications first."
          bodyInPanel
          onEditTheme={editCard}
          onDescribeTheme={describeCard}
          onGoToCluster={() => setStep("cluster")}
        >
          {(active) => (
            <ReadingBoard
              key={active.id}
              theme={active}
              board={board}
              editable={editable}
              busy={busy}
              onAddReading={(theme, example) => addChildCard(theme, "reading", example)}
              onEdit={editCard}
              onSetField={setReadingField}
              onDeleteReading={removeCard}
            />
          )}
        </ThemeWorkspace>
      )}

      {step === "hopes" && (
        <HopesFearsBoard
          board={board}
          lineage={lineage}
          editable={editable}
          busy={busy}
          themeId={themeId}
          focusId={focusId}
          onPickTheme={setThemeId}
          onFocus={setFocusId}
          onAdd={addChainCardFocused}
          onFlip={addChildCard}
          onAddAssumption={(parent, text) => addChildCard(parent, "assumption", text)}
          onEdit={editCard}
          onDescribe={describeCard}
          onDelete={removeCard}
          onGoToCluster={() => setStep("cluster")}
        />
      )}

      {step === "shortlist" && (
        <div className="flex flex-col gap-8">
          <ShortlistBoard
            board={board}
            editable={editable}
            busy={busy}
            onToggle={shortlist}
            onGoToStakes={() => setStep("stakes")}
          />
          {sections.length > 0 && (
            <div className="border-t border-[var(--rule)] pt-6">
              <WorksheetSections
                sections={sections}
                cards={cards}
                editable={editable}
                canEdit={canEditCard}
                busy={busy}
                playerNames={playerNames}
                onAdd={addSectionCard}
                onDelete={removeCard}
                onEdit={(cardId, text) => {
                  const card = cards.find((c) => c.id === cardId);
                  if (card) editCard(card, text);
                }}
                onReorder={reorderSectionCard}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Shell wide>
      <PhaseHeader
        phase={phase}
        title={title || config.scenarioTitle}
        kindLabel="Synthesis"
        right={
          <ScenarioToggle
            showingScenario={showScenario}
            exerciseLabel="Worksheet"
            onToggle={() => setShowScenario((v) => !v)}
            disabled={busy}
          />
        }
      />

      {showScenario ? (
        <ScenarioPanel
          scenario={scenario ?? null}
          drivers={drivers}
          hiddenSections={hiddenSections}
          premise={config.premise}
        />
      ) : (
        stepBody
      )}

      {flash && <Flash msg={flash} />}
    </Shell>
  );
}
