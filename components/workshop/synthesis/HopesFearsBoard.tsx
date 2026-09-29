"use client";

import type { RippleCard } from "@/lib/ripples-types";
import type { HopeFear, SynthesisBoard, Week2Lineage } from "@/lib/synthesis-shape";
import { HopeFearChain } from "@/components/workshop/synthesis/HopeFearChain";
import { HopeFearPicker } from "@/components/workshop/synthesis/HopeFearPicker";
import { ThemeWorkspace } from "@/components/workshop/synthesis/ThemeWorkspace";
import { MAX_TREE_DEPTH, childOrderOf } from "@/lib/ripples-types";

// STEP 3 — hopes & fears, one theme at a time.
//
// Step 2 worked out what is at stake. This step asks the different question: why does that
// matter to us, what value does it touch, and what are we assuming. The theme header above
// carries the implications it was built from, for the context that keeps a hope about
// something real.

export function HopesFearsBoard({
  board,
  lineage,
  editable,
  busy,
  themeId,
  onPickTheme,
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
  onPickTheme: (id: string) => void;
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
      countFor={(t) => (board.chains.get(t.id) ?? []).length}
      emptyBlurb="Hopes and fears are written onto themes, so the group needs to cluster its implications first."
      onEditTheme={onEdit}
      onDescribeTheme={onDescribe}
      onGoToCluster={onGoToCluster}
    >
      {(active) => (
        <>
          <HopeFearChain
            key={active.id}
            theme={active}
            board={board}
            editable={editable}
            busy={busy}
            onAdd={onAdd}
            onAddAssumption={onAddAssumption}
            onEdit={onEdit}
            onDescribe={onDescribe}
            onDelete={onDelete}
          />

          {editable && (
            <div className="mt-2 border-t border-[var(--rule)] pt-6">
              <HopeFearPicker
                busy={busy}
                // Nothing can hang off the theme once the ladder has bottomed out.
                disabled={
                  !childOrderOf(active.order) ||
                  (board.chainDepth.get(active.id) ?? 0) >= MAX_TREE_DEPTH
                }
                onAdd={(kind, text) => onAdd(active, kind, text)}
              />
            </div>
          )}
        </>
      )}
    </ThemeWorkspace>
  );
}
