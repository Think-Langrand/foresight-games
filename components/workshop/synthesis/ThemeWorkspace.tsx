"use client";

import type { RippleCard } from "@/lib/ripples-types";
import type { SynthesisBoard, Week2Lineage } from "@/lib/synthesis-shape";
import { ThemeLineagePanel } from "@/components/workshop/synthesis/ThemeLineagePanel";

// The shell steps 2 and 3 share: pick a theme, then work on it.
//
// Both steps are "one theme at a time" exercises over the same set of themes, so the
// picker, the empty state and the theme header live here and each step supplies only its
// own body. The badge count is a prop because each step should show how much of ITS OWN
// work a theme has — a theme heavy with risks may still have no hopes written on it.

export function ThemeWorkspace({
  board,
  lineage,
  editable,
  busy,
  themeId,
  onPickTheme,
  countFor,
  emptyBlurb,
  onEditTheme,
  onDescribeTheme,
  onGoToCluster,
  children,
}: {
  board: SynthesisBoard;
  lineage: Record<string, Week2Lineage>;
  editable: boolean;
  busy: boolean;
  themeId: string | null;
  onPickTheme: (id: string) => void;
  countFor: (theme: RippleCard) => number;
  emptyBlurb: string;
  onEditTheme: (theme: RippleCard, text: string) => void;
  onDescribeTheme: (theme: RippleCard, description: string) => void;
  onGoToCluster: () => void;
  children: (theme: RippleCard) => React.ReactNode;
}) {
  // Derived, not synced: falling back to the first theme means the view never strands on a
  // theme a teammate just deleted, and there is no state to keep in step.
  const active = board.themes.find((t) => t.id === themeId) ?? board.themes[0] ?? null;

  if (board.themes.length === 0) {
    return (
      <div className="rounded-[3px] border border-[var(--hairline)] bg-card p-6 text-center">
        <p className="text-[14px] font-bold">No themes yet.</p>
        <p className="mx-auto mt-1 max-w-[46ch] text-[13px] text-muted">{emptyBlurb}</p>
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
          const count = countFor(t);
          const on = active?.id === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => onPickTheme(t.id)}
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
            onEditTheme={(text) => onEditTheme(active, text)}
            onDescribeTheme={(description) => onDescribeTheme(active, description)}
          />
          {children(active)}
        </>
      )}
    </div>
  );
}
