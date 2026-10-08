"use client";

import type { AddResult } from "@/components/workshop/synthesis/SynthesisCard";
import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import {
  descendantsOf,
  exploreProgress,
  implicationKey,
  twinIndex,
  type ReadingField,
  type StakeKind,
  type SynthesisBoard,
  type Week2Lineage,
} from "@/lib/synthesis-shape";
import { ThemeRail } from "@/components/workshop/synthesis/ThemeRail";
import { PromptRail, Prompts } from "@/components/workshop/synthesis/PromptRail";
import { ThemeLineagePanel } from "@/components/workshop/synthesis/ThemeLineagePanel";
import { ThemeFoot } from "@/components/workshop/synthesis/ThemeFoot";
import { CardWall } from "@/components/workshop/synthesis/CardWall";
import { READING_QUESTIONS, ReadingBoard } from "@/components/workshop/synthesis/ReadingBoard";
import { useRailBand } from "@/components/workshop/synthesis/useRailBand";
import { ConfirmModal } from "@/components/ConfirmModal";

// STEP 2 — theme exploration. One theme at a time, picked on the rail like every theme
// step; the sheet is the theme's head, the four questions ("how does this future work?")
// straight under it, then two walls side by side: the risks this theme carries and the
// opportunities it opens. The questions are asked first because the walls are answered in
// their light — who bears the cost is where the risks come from.

// Which step-2 wall a card is on. `tension` is the third stake kind, from an older board;
// this step offers the two.
export type WallKind = Exclude<StakeKind, "tension">;

export function ExploreBoard({
  board,
  lineage,
  editable,
  busy,
  themeId,
  onPickTheme,
  onAnswer,
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
  onPickTheme: (id: string | null) => void;
  // Another answer to one of the four questions — each takes as many as the group writes.
  onAnswer: (theme: RippleCard, field: ReadingField, text: string) => AddResult;
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
      // The step, said once and large; the band ends in a rule the sheet's rule continues.
      top={
        <p className="text-[19px] font-extrabold leading-[1.15] tracking-tight">
          2. Explore each theme: four questions, its risks and opportunities
        </p>
      }
    />
  );
  const prompts = (
    <PromptRail>
      <Prompts
        heading="Theme exploration"
        lead="Four questions about this change, then what it puts at stake."
        questions={[
          ...READING_QUESTIONS.map((q) => ({ question: q.question, hint: q.hint })),
          { question: "What could go wrong, or be lost?", hint: "Risks — one per card." },
          { question: "What could this open up?", hint: "Opportunities — one per card." },
        ]}
      />
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
          implications={board.clusters.get(theme.id) ?? []}
          lineage={lineage}
          // A copy in a second theme carries no Week 2 link of its own (0023); its trail
          // is read through the twin that does.
          sourceIdOf={(c) => c.sourceCardId ?? twins.get(implicationKey(c))?.sourceCardId ?? null}
          editable={editable}
          busy={busy}
          onEditTheme={(t) => onEdit(theme, t)}
          namePlaceholder="What is this theme about?"
        >
          <ReadingBoard
            theme={theme}
            board={board}
            editable={editable}
            busy={busy}
            onAnswer={onAnswer}
            onEdit={onEdit}
            onDelete={onDelete}
          />

          {/* The two walls, half width each, so a risk and the opportunity beside it are
              read together. Stacked on a narrow screen. */}
          <div className="border-t-2 border-dashed border-black/15 px-5 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <CardWall
                tone="risk"
                title="Risks"
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
