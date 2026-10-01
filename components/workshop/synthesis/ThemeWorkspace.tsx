"use client";

import { useState } from "react";

import type { RippleCard } from "@/lib/ripples-types";
import {
  themeDossierCounts,
  type DossierCounts,
  type SynthesisBoard,
  type ThemeProgress,
  type Week2Lineage,
} from "@/lib/synthesis-shape";
import { ThemeLineagePanel } from "@/components/workshop/synthesis/ThemeLineagePanel";
import { ThemeDrawer } from "@/components/workshop/synthesis/ThemeDrawer";

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
  // Move the theme card into a slide-out and leave a one-line summary in its place. Step 3
  // only: there the theme is reference and the cards are the work, so it should not be
  // taking the top of the screen. Step 2 fills the theme card in, so it stays inline.
  themeInDrawer = false,
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
  themeInDrawer?: boolean;
  renderThemeExtra?: (theme: RippleCard) => React.ReactNode;
  children: (theme: RippleCard) => React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
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
    <div
      className={
        "flex flex-col gap-4 " +
        // The open drawer overlays the right edge of the page, which on a 1440 screen
        // covers about 250px of the 1100px content column — including the right-hand card
        // of the pair. A reference panel that hides the thing you are writing is not a
        // rail, so the content yields exactly as much room as the panel actually takes:
        // the drawer's 420px less whatever margin the centred column already had spare.
        // Below sm the drawer is modal with a backdrop, so there is nothing to make room for.
        (themeInDrawer && drawerOpen
          ? "transition-[margin] duration-300 ease-out sm:[margin-right:max(0px,calc(420px-(100vw-1100px)/2))]"
          : "transition-[margin] duration-300 ease-out")
      }
    >
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
          <div className="flex flex-col items-start gap-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
              Theme {index + 1} of {board.themes.length}
            </span>
            {/* The drawer's own handle sits out at the screen edge, which is easy to miss
                and says nothing about what is behind it. This is the same toggle, next to
                the theme it belongs to, carrying the counts so the dossier stays in mind
                whether or not it is open. */}
            {themeInDrawer && (
              <button
                onClick={() => setDrawerOpen((v) => !v)}
                aria-expanded={drawerOpen}
                className={
                  "rounded-[2px] border px-2.5 py-1 text-[11px] font-bold transition-colors " +
                  (drawerOpen
                    ? "border-ink bg-lime text-ink"
                    : "border-[var(--rule)] bg-paper text-muted hover:border-ink hover:text-ink")
                }
              >
                <span aria-hidden className="mr-1">
                  {drawerOpen ? "▾" : "▸"}
                </span>
                View theme
                <span className="ml-1.5 font-normal opacity-80">
                  · {dossierSummary(themeDossierCounts(board, active.id))}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {active && (
        <>
          {themeInDrawer ? (
            <ThemeSummary theme={active} />
          ) : (
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
          )}
          {bodyInPanel && !themeInDrawer ? null : children(active)}

          {themeInDrawer && (
            <ThemeDrawer
              open={drawerOpen}
              onToggle={() => setDrawerOpen((v) => !v)}
              onClose={() => setDrawerOpen(false)}
              label={active.text}
            >
              {/* The same panel, unchanged and still editable — it has moved, not been
                  reduced to a summary. */}
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
              </ThemeLineagePanel>
            </ThemeDrawer>
          )}

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

// What is waiting behind the handle, in words. Naming the counts is what keeps the dossier
// from going quietly out of mind once it is no longer on the page; with nothing in it, say
// so plainly rather than printing "0 · 0 · 0".
function dossierSummary(counts: DossierCounts): string {
  const n = (count: number, one: string, many = one + "s") =>
    `${count} ${count === 1 ? one : many}`;
  const stakes = [
    counts.risks > 0 && n(counts.risks, "risk"),
    counts.opportunities > 0 && n(counts.opportunities, "opportunity", "opportunities"),
    counts.tensions > 0 && n(counts.tensions, "surprise"),
  ].filter(Boolean) as string[];

  if (stakes.length > 0) {
    return [counts.implications > 0 && n(counts.implications, "implication"), ...stakes]
      .filter(Boolean)
      .join(" · ");
  }
  return counts.implications > 0
    ? `${n(counts.implications, "implication")} · nothing at stake yet`
    : "nothing on this theme yet";
}

// Which theme you are on, once the card itself has moved into the drawer.
//
// The name is plain text, not InlineText. Editing lives in one place — the panel in the
// drawer — so there is never a second way to rename a theme that behaves slightly
// differently from the first. Opening the drawer is the toggle up beside "Theme N of M",
// not a second control down here: two buttons doing one job is the clutter this step was
// trying to lose.
function ThemeSummary({ theme }: { theme: RippleCard }) {
  return (
    <div className="border-b border-[var(--rule)] pb-3">
      <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">Theme</div>
      <h2 className="mt-1 max-w-[60ch] text-[18px] font-extrabold uppercase leading-[1.15] tracking-tight">
        {theme.text}
      </h2>
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
