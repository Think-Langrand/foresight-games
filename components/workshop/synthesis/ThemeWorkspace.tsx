"use client";

import type { RippleCard } from "@/lib/ripples-types";
import type { SynthesisBoard, ThemeProgress, Week2Lineage } from "@/lib/synthesis-shape";
import { ThemeLineagePanel } from "@/components/workshop/synthesis/ThemeLineagePanel";

// The shell steps 2 and 3 share: pick a theme, then work on it.
//
// Both steps are a PASS over every theme rather than browsing, so the picker is built as a
// checklist: numbered, each carrying how far that theme has got, with the position shown
// and a hand-off at the foot to the next one still owing work. What "done" means differs
// per step, so it arrives as a prop.
//
// The chips deliberately do not show theme names. Themes are named as statements about
// change — long sentences — and truncating five of them to a few characters makes them
// indistinguishable. The card below already carries the full name; the chips only need to
// say which theme and how far along it is.

export function ThemeWorkspace({
  board,
  lineage,
  editable,
  busy,
  themeId,
  onPickTheme,
  progressFor,
  emptyBlurb,
  onEditTheme,
  onDescribeTheme,
  onGoToCluster,
  // Render the step's body INSIDE the theme card rather than below it — step 2 fills the
  // theme in like a dossier, step 3 works on cards beneath it.
  bodyInPanel = false,
  // Extra content inside the theme card, above the step's own body.
  renderThemeExtra,
  children,
}: {
  board: SynthesisBoard;
  lineage: Record<string, Week2Lineage>;
  editable: boolean;
  busy: boolean;
  themeId: string | null;
  onPickTheme: (id: string) => void;
  progressFor: (theme: RippleCard) => ThemeProgress;
  emptyBlurb: string;
  onEditTheme: (theme: RippleCard, text: string) => void;
  onDescribeTheme: (theme: RippleCard, description: string) => void;
  onGoToCluster: () => void;
  bodyInPanel?: boolean;
  renderThemeExtra?: (theme: RippleCard) => React.ReactNode;
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

  const index = active ? board.themes.findIndex((t) => t.id === active.id) : -1;
  // The next theme still owing work, wrapping past the end — a pass should not stop at
  // the last card just because that is where the list happens to finish.
  const nextUnfinished = active
    ? board.themes
        .slice(index + 1)
        .concat(board.themes.slice(0, index))
        .find((t) => progressFor(t) !== "done") ?? null
    : null;
  const allDone = board.themes.every((t) => progressFor(t) === "done");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Themes">
          {board.themes.map((t, i) => {
            const state = progressFor(t);
            const on = active?.id === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={on}
                aria-label={`Theme ${i + 1}: ${t.text} — ${STATE_LABEL[state]}`}
                onClick={() => onPickTheme(t.id)}
                title={`${t.text} — ${STATE_LABEL[state]}`}
                className={
                  "flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1.5 text-[11.5px] font-bold " +
                  (on
                    ? "border-ink bg-ink text-paper"
                    : "border-[var(--rule)] bg-paper text-muted hover:border-ink hover:text-ink")
                }
              >
                <span aria-hidden className={STATE_DOT[state] + (on ? " opacity-90" : "")}>
                  {state === "done" ? "●" : state === "started" ? "◐" : "○"}
                </span>
                {i + 1}
              </button>
            );
          })}
        </div>

        {active && (
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            Theme {index + 1} of {board.themes.length}
          </span>
        )}
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
          >
            {renderThemeExtra?.(active)}
            {bodyInPanel ? children(active) : null}
          </ThemeLineagePanel>
          {bodyInPanel ? null : children(active)}

          {/* The hand-off, at the foot of the card — where you actually finish a theme,
              rather than back up at the picker. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rule)] pt-4">
            <span className="text-[12px] text-muted">
              {allDone ? (
                <>
                  <strong className="text-ink">All {board.themes.length} themes done.</strong> Move
                  on when the group is happy.
                </>
              ) : progressFor(active) === "done" ? (
                "This theme is done."
              ) : (
                "Come back to this one if it still needs work."
              )}
            </span>
            {nextUnfinished && (
              <button
                onClick={() => onPickTheme(nextUnfinished.id)}
                className="max-w-[32ch] truncate rounded-[2px] border border-ink bg-lime px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep"
                title={nextUnfinished.text}
              >
                Next: {nextUnfinished.text} →
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const STATE_LABEL: Record<ThemeProgress, string> = {
  empty: "nothing yet",
  started: "in progress",
  done: "done",
};

const STATE_DOT: Record<ThemeProgress, string> = {
  empty: "text-black/25",
  started: "text-blue",
  done: "text-[var(--lime-deep)]",
};
