"use client";

import { useState } from "react";

import type { RippleCard } from "@/lib/ripples-types";
import {
  descendantsOf,
  flattenChainCards,
  hopesProgress,
  type HopeFear,
  type SynthesisBoard,
  type Week2Lineage,
} from "@/lib/synthesis-shape";
import { HopeFearGallery } from "@/components/workshop/synthesis/HopeFearGallery";
import { HopeFearPair } from "@/components/workshop/synthesis/HopeFearPair";
import { HopeFearPicker } from "@/components/workshop/synthesis/HopeFearPicker";
import { ThemeWorkspace } from "@/components/workshop/synthesis/ThemeWorkspace";
import { StakeBoard } from "@/components/workshop/synthesis/StakeBoard";
import { ConfirmModal } from "@/components/ConfirmModal";

// STEP 3 — hopes & fears, one theme at a time.
//
// Step 2 worked out what is at stake. This step asks the different question: why does that
// matter to us, what value does it touch, and what are we assuming.
//
// Three zones: the theme above, everything written on it in the middle, and one card in
// focus below with room to actually write. An empty theme skips the middle entirely and
// shows the two large cards instead — the moment the step is hardest to start is not the
// moment to show an empty grid.

export function HopesFearsBoard({
  board,
  lineage,
  editable,
  busy,
  themeId,
  focusId,
  onPickTheme,
  onFocus,
  onAdd,
  onFlip,
  onAddAssumption,
  onEdit,
  onDescribe,
  onDelete,
  onGoToCluster,
}: {
  board: SynthesisBoard;
  lineage: Record<string, Week2Lineage>;
  editable: boolean;
  busy: boolean;
  themeId: string | null;
  focusId: string | null;
  onPickTheme: (id: string) => void;
  onFocus: (id: string | null) => void;
  onAdd: (parent: RippleCard, kind: HopeFear, text: string) => void;
  // Writing the other side does NOT move focus — see SynthesisTeamView.
  onFlip: (parent: RippleCard, kind: HopeFear, text: string) => void;
  onAddAssumption: (parent: RippleCard, text: string) => void;
  onEdit: (card: RippleCard, text: string) => void;
  onDescribe: (card: RippleCard, description: string) => void;
  onDelete: (card: RippleCard) => void;
  onGoToCluster: () => void;
}) {
  // One dialog serves both the gallery and the open card: deleting is the same decision
  // wherever you start it, and a hope takes its assumptions and the fear flipped from it
  // with it (parent_card_id is ON DELETE CASCADE).
  const [pendingDelete, setPendingDelete] = useState<RippleCard | null>(null);
  const doomed = pendingDelete ? descendantsOf(board, pendingDelete.id) : [];

  return (
    <>
    <ThemeWorkspace
      board={board}
      lineage={lineage}
      editable={editable}
      busy={busy}
      themeId={themeId}
      onPickTheme={onPickTheme}
      progressFor={(t) => hopesProgress(board, t.id)}
      emptyBlurb="Hopes and fears are written onto themes, so the group needs to cluster its implications first."
      onEditTheme={onEdit}
      onDescribeTheme={onDescribe}
      onGoToCluster={onGoToCluster}
      // The theme card carries the same dossier the last step filled in — a hope is meant
      // to say why one of THOSE possibilities matters, so they belong in front of you
      // while you write. Read-only: editing them is step 2's job.
      renderThemeExtra={(active) => (
        <StakeBoard
          theme={active}
          board={board}
          editable={editable}
          busy={busy}
          readOnly
          onAdd={() => {}}
          onEdit={() => {}}
          onDescribe={() => {}}
          onDelete={() => {}}
        />
      )}
    >
      {(active) => {
        const entries = flattenChainCards(board, active.id);
        // Derived, not synced: a card deleted by a teammate, or a theme switch, falls back
        // to the first card here rather than stranding the panel on something gone.
        const focused = entries.find((e) => e.card.id === focusId)?.card ?? entries[0]?.card ?? null;

        if (entries.length === 0) {
          return (
            <div className="mt-2 border-t border-[var(--rule)] pt-6">
              <HopeFearPicker
                busy={busy}
                disabled={!editable}
                onAdd={(kind, text) => onAdd(active, kind, text)}
              />
            </div>
          );
        }

        return (
          <div className="flex flex-col gap-6">
            <HopeFearGallery
              entries={entries}
              selectedId={focused?.id ?? null}
              editable={editable}
              busy={busy}
              onSelect={(c) => onFocus(c.id)}
              onRequestDelete={setPendingDelete}
              onQuickAdd={(kind, text) => onAdd(active, kind, text)}
            />

            {focused && (
              <HopeFearPair
                key={focused.id}
                card={focused}
                board={board}
                editable={editable}
                busy={busy}
                onFocus={onFocus}
                onEdit={onEdit}
                onDescribe={onDescribe}
                onAddAssumption={onAddAssumption}
                onFlip={onFlip}
                onRequestDelete={setPendingDelete}
                onDelete={onDelete}
              />
            )}
          </div>
        );
      }}
    </ThemeWorkspace>

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
            written on it — its assumptions and anything flipped from it. This can&rsquo;t be
            undone.
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
