"use client";

import type { RippleCard } from "@/lib/ripples-types";
import {
  flattenChainCards,
  type HopeFear,
  type SynthesisBoard,
  type Week2Lineage,
} from "@/lib/synthesis-shape";
import { HopeFearGallery } from "@/components/workshop/synthesis/HopeFearGallery";
import { HopeFearFocus } from "@/components/workshop/synthesis/HopeFearFocus";
import { HopeFearPicker } from "@/components/workshop/synthesis/HopeFearPicker";
import { ThemeWorkspace } from "@/components/workshop/synthesis/ThemeWorkspace";

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
  onAddAssumption: (parent: RippleCard, text: string) => void;
  onEdit: (card: RippleCard, text: string) => void;
  onDescribe: (card: RippleCard, description: string) => void;
  onDelete: (card: RippleCard) => void;
  onGoToCluster: () => void;
}) {
  return (
    <ThemeWorkspace
      board={board}
      lineage={lineage}
      editable={editable}
      busy={busy}
      themeId={themeId}
      onPickTheme={onPickTheme}
      countFor={(t) => flattenChainCards(board, t.id).length}
      emptyBlurb="Hopes and fears are written onto themes, so the group needs to cluster its implications first."
      onEditTheme={onEdit}
      onDescribeTheme={onDescribe}
      onGoToCluster={onGoToCluster}
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
              onQuickAdd={(kind, text) => onAdd(active, kind, text)}
            />

            {focused && (
              <HopeFearFocus
                key={focused.id}
                card={focused}
                board={board}
                editable={editable}
                busy={busy}
                onEdit={onEdit}
                onDescribe={onDescribe}
                onAddAssumption={onAddAssumption}
                onFlip={onAdd}
                onDelete={onDelete}
              />
            )}
          </div>
        );
      }}
    </ThemeWorkspace>
  );
}
