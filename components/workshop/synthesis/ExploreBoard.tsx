"use client";

import type { AddResult } from "@/components/workshop/synthesis/SynthesisCard";
import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import {
  STAKES_FOR_DONE,
  descendantsOf,
  exploreProgress,
  twinIndex,
  type StakeKind,
  type SynthesisBoard,
  type Week2Lineage,
} from "@/lib/synthesis-shape";
import { ThemeRail } from "@/components/workshop/synthesis/ThemeRail";
import { PromptRail, Prompts } from "@/components/workshop/synthesis/PromptRail";
import { ThemeLineagePanel } from "@/components/workshop/synthesis/ThemeLineagePanel";
import { ThemeImplications } from "@/components/workshop/synthesis/ThemeImplications";
import { Directions, DIRECTIONS_FOLD } from "@/components/workshop/synthesis/Directions";
import { makePrefStore } from "@/components/workshop/synthesis/prefStore";
import { ThemeFoot } from "@/components/workshop/synthesis/ThemeFoot";
import { CardWall } from "@/components/workshop/synthesis/CardWall";
import { useRailBand } from "@/components/workshop/synthesis/useRailBand";
import { ConfirmModal } from "@/components/ConfirmModal";

// STEP 2 — theme exploration. One theme at a time, picked on the rail like every theme
// step; the sheet is the theme's head, then two walls side by side — the risks this theme
// carries and the opportunities it opens — then the implications it was built from, read
// underneath so the walls are answered against them rather than from memory.

// Which step-2 wall a card is on. `tension` is the third stake kind, from an older board;
// this step offers the two.
export type WallKind = Exclude<StakeKind, "tension">;

const exploreDirections = makePrefStore(
  "synthesis.directions.explore",
  "open",
  DIRECTIONS_FOLD
);

// Its own key, not step 1's: folding away how the canvas works should not fold away how
// this step works. Different tool, different decision.
const EXPLORE_DIRECTIONS = [
  "Write the risks this theme carries and the opportunities it opens — one per card.",
  `A theme is done once it has at least ${STAKES_FOR_DONE} risks and ${STAKES_FOR_DONE} opportunities.`,
  "The implications it was built from are below, with where each came from in Week 2.",
  "To change what is in a theme, go back to step 1.",
  "Open another theme from the rail on the left at any time.",
] as const;

export function ExploreBoard({
  board,
  lineage,
  editable,
  busy,
  themeId,
  scenarioTitle,
  onPickTheme,
  onAddStake,
  onEdit,
  onDelete,
  onGoToCluster,
}: {
  board: SynthesisBoard;
  lineage: Record<string, Week2Lineage>;
  editable: boolean;
  busy: boolean;
  themeId: string | null;
  // The world the group is working in, as the rail's eyebrow — the step says what to do,
  // and nothing else on the screen says what future it is being done in.
  scenarioTitle?: string;
  onPickTheme: (id: string | null) => void;
  // A card on one of the two walls.
  onAddStake: (theme: RippleCard, kind: WallKind, text: string) => AddResult;
  onEdit: (card: RippleCard, text: string) => void;
  onDelete: (card: RippleCard) => void;
  onGoToCluster: () => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<RippleCard | null>(null);
  const doomed = pendingDelete ? descendantsOf(board, pendingDelete.id) : [];
  // The sheet element, so the rail's squares start level with it — see useRailBand.
  const [sheetEl, setSheetEl] = useState<HTMLElement | null>(null);
  useRailBand(sheetEl);

  // Falls back to the first theme: this step is a pass over every theme, so there is
  // always one to be on. Resolved live, so a deleted theme never strands the sheet.
  const active = board.themes.find((t) => t.id === themeId) ?? board.themes[0] ?? null;
  const progressFor = (t: RippleCard) => exploreProgress(board, t.id);

  const rail = (
    <ThemeRail
      board={board}
      activeId={active?.id ?? null}
      onPick={(id) => onPickTheme(id ?? active?.id ?? null)}
      progressFor={progressFor}
      progressLabel="Exploration"
      hint="Click a theme to work on it."
      // The same ✎ as step 1's rail and the canvas: a group often only sees what a theme
      // is really about once it starts writing what the theme risks.
      onRename={editable ? (t, text) => onEdit(t, text) : undefined}
      // The step, said once and large; the band ends in a rule the sheet's rule continues.
      top={
        <>
          {scenarioTitle && <p className="eyebrow mb-1 truncate">{scenarioTitle}</p>}
          <p className="text-[19px] font-extrabold leading-[1.15] tracking-tight">
            2. Reflect on each theme: what it risks, and what it opens up
          </p>
        </>
      }
    />
  );
  const prompts = (
    <PromptRail>
      {/* Every step's rail is ordered the same way, and the order is the point: what the
          group is meant to be HOLDING at the top, on step 1's lime, and how to work the
          surface under it. The questions are read the whole time; the directions are the
          part you stop needing once you know the tool, so they fold and they sit below. */}
      <section
        className="-mx-3 -mt-4 border-b border-ink px-3 pb-5 pt-4"
        style={{ background: "color-mix(in srgb, var(--lime) 26%, var(--card))" }}
      >
        <Prompts
          heading="Theme exploration"
          lead="What this theme puts at stake."
          questions={[
            { question: "What could go wrong, or be lost?", hint: "Risks — one per card." },
            { question: "What could this open up?", hint: "Opportunities — one per card." },
          ]}
        />
      </section>
      <Directions title="Working on a theme" lines={EXPLORE_DIRECTIONS} fold={exploreDirections} />
    </PromptRail>
  );

  if (!active) {
    return (
      <>
        {rail}
        {prompts}
        <div className="rounded-[3px] border border-[var(--hairline)] bg-card p-6 text-center">
          <p className="text-[14px] font-bold">No themes yet.</p>
          <p className="mx-auto mt-1 max-w-[50ch] text-[13px] text-muted">
            Themes are explored one at a time, so the group needs to cluster its implications
            first.
          </p>
          <button
            onClick={onGoToCluster}
            className="mt-3 rounded-[2px] border border-ink bg-lime px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep"
          >
            ← Go to Cluster
          </button>
        </div>
      </>
    );
  }

  const theme = active;
  const twins = twinIndex(board);

  return (
    <>
      {rail}
      {prompts}

      {/* Keyed by theme: the question editors and the two wall composers hold drafts in
          local state, and a subtree reused across themes would carry one theme's
          half-typed answer into the next — and save it there. */}
      <section key={theme.id} ref={setSheetEl} className="flex flex-col gap-4 border-t border-ink pt-3 lg:-mx-9 lg:px-9">
        <ThemeLineagePanel
          theme={theme}
          editable={editable}
          busy={busy}
          onEditTheme={(t) => onEdit(theme, t)}
          namePlaceholder="What is this theme about?"
        >
          {/* The walls come FIRST now. This step used to open with four questions about
              how the future works; it opens with what the theme puts at stake, because
              that is what the step is actually for. Half width each, so a risk and the
              opportunity beside it are read together. Stacked on a narrow screen. */}
          <div className="border-t-2 border-dashed border-black/15 px-5 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <CardWall
                tone="risk"
                title="Risks"
                tall
                closeAfterAdd
                cards={board.risks.get(theme.id) ?? []}
                editable={editable}
                busy={busy}
                addLabel="What could go wrong, or be lost?"
                emptyHint="What does this theme put at risk?"
                onAdd={(text) => onAddStake(theme, "risk", text)}
                onEdit={onEdit}
                onRequestDelete={setPendingDelete}
              />
              <CardWall
                tone="opportunity"
                title="Opportunities"
                tall
                closeAfterAdd
                cards={board.opportunities.get(theme.id) ?? []}
                editable={editable}
                busy={busy}
                addLabel="What could this open up?"
                emptyHint="What does this theme make possible?"
                onAdd={(text) => onAddStake(theme, "opportunity", text)}
                onEdit={onEdit}
                onRequestDelete={setPendingDelete}
              />
            </div>
          </div>

          {/* What the theme was built from, under the walls: you cannot weigh a theme's
              risks without being able to see what is in it. Read-only — changing what is
              in a theme is step 1's job. */}
          <ThemeImplications
            implications={board.clusters.get(theme.id) ?? []}
            lineage={lineage}
            twins={twins}
            themes={board.themes}
            onGoToCluster={onGoToCluster}
          />
        </ThemeLineagePanel>

        <ThemeFoot themes={board.themes} active={theme} progressFor={progressFor} onPick={onPickTheme} />
      </section>

      <ConfirmModal
        open={pendingDelete !== null}
        title={`Delete this ${pendingDelete?.cardKind ?? "card"}?`}
        busy={busy}
        confirmLabel="Delete"
        message={
          doomed.length === 0 ? (
            <>This can&rsquo;t be undone.</>
          ) : (
            <>
              This also deletes{" "}
              <strong className="text-ink">
                {doomed.length} card{doomed.length === 1 ? "" : "s"}
              </strong>{" "}
              written on it. This can&rsquo;t be undone.
            </>
          )
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const card = pendingDelete;
          setPendingDelete(null);
          if (card) onDelete(card);
        }}
      />
    </>
  );
}
