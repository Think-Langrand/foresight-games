"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import type { HopeFear, SynthesisBoard, Week2Lineage } from "@/lib/synthesis-shape";
import { HopeFearChain } from "@/components/workshop/synthesis/HopeFearChain";
import { ThemeLineagePanel } from "@/components/workshop/synthesis/ThemeLineagePanel";
import { HopeFearPicker } from "@/components/workshop/synthesis/HopeFearPicker";
import { MAX_TREE_DEPTH, childOrderOf } from "@/lib/ripples-types";

// STEP 2 — hopes & fears, one theme at a time.
//
// Themes are the chain roots (the group's decision in step 1), so this step picks a theme
// and works on it. Beside the chain sits the drill-in: the implications inside this theme
// and, for each, the Week 2 chain and key change it came from — the context you need to
// write a hope or a fear that is actually about something.

export function HopesFearsBoard({
  board,
  lineage,
  editable,
  busy,
  onAdd,
  onEdit,
  onDescribe,
  onDelete,
  onGoToCluster,
}: {
  board: SynthesisBoard;
  lineage: Record<string, Week2Lineage>;
  editable: boolean;
  busy: boolean;
  onAdd: (parent: RippleCard, kind: HopeFear, text: string) => void;
  onEdit: (card: RippleCard, text: string) => void;
  onDescribe: (card: RippleCard, description: string) => void;
  onDelete: (card: RippleCard) => void;
  onGoToCluster: () => void;
}) {
  const [themeId, setThemeId] = useState<string | null>(null);
  // Derived, not synced: falling back to the first theme means the view never strands on a
  // theme a teammate just deleted, and there is no state to keep in step.
  const active = board.themes.find((t) => t.id === themeId) ?? board.themes[0] ?? null;

  if (board.themes.length === 0) {
    return (
      <div className="rounded-[3px] border border-[var(--hairline)] bg-card p-6 text-center">
        <p className="text-[14px] font-bold">No themes yet.</p>
        <p className="mx-auto mt-1 max-w-[46ch] text-[13px] text-muted">
          Hopes and fears are written onto themes, so the group needs to cluster its
          implications first.
        </p>
        <button
          onClick={onGoToCluster}
          className="mt-3 rounded-[2px] border border-ink bg-lime px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep"
        >
          ← Go to Cluster
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Theme picker. Each entry shows how much has been written on it already, so a group
          working asynchronously can see what still needs attention. */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Themes">
        {board.themes.map((t) => {
          const count = (board.chains.get(t.id) ?? []).length;
          const on = active?.id === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => setThemeId(t.id)}
              className={
                "max-w-[22ch] truncate rounded-[2px] border px-3 py-1.5 text-[11.5px] font-bold " +
                (on
                  ? "border-ink bg-ink text-paper"
                  : "border-[var(--rule)] bg-paper text-muted hover:border-ink hover:text-ink")
              }
              title={t.text}
            >
              {t.text}
              {count > 0 && <span className={on ? "text-paper/60" : "text-muted"}> · {count}</span>}
            </button>
          );
        })}
      </div>

      {active && (
        <>
          <ThemeLineagePanel
            theme={active}
            implications={board.clusters.get(active.id) ?? []}
            lineage={lineage}
            editable={editable}
            busy={busy}
            onEditTheme={(text) => onEdit(active, text)}
            onDescribeTheme={(description) => onDescribe(active, description)}
          />

          <HopeFearChain
            key={active.id}
            theme={active}
            board={board}
            editable={editable}
            busy={busy}
            onAdd={onAdd}
            onEdit={onEdit}
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
    </div>
  );
}
