"use client";

import { useState } from "react";
import type { AdminTools } from "@/lib/analysis/implication-cluster-shape";
import type { SynthesisSummary } from "@/lib/synthesis-summary-shape";
import { SummaryBlock } from "@/components/design-groups/SynthesisPanel";
import { makePrefStore, usePref } from "@/components/workshop/synthesis/prefStore";

// The facilitator's executive summary of steps 1–2, at the top of the hopes & fears step.
//
// Members see it once it exists and nothing before: there is no action for them to take.
// A facilitator (the `admin` tools are present) sees the button to write it, and to write
// it again once the board has moved on. The call takes about half a minute; its state is
// owned by the view so that leaving the step mid-call does not lose it.

const panelPref = makePrefStore("synthesis.summary", "open", ["open", "closed"] as const);

function relTime(iso: string, now: number): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function SummaryPanel({
  summary,
  admin,
  currentCount,
  currentHash,
  hasThemes,
  running,
  error,
  onGenerate,
}: {
  summary: SynthesisSummary | null;
  admin?: AdminTools;
  // summaryCardCount(board) now — differs from summary.cardCount once the board has moved on.
  // The fallback for a summary written before inputHash existed.
  currentCount: number;
  // summaryInputHash of the live board — differs from summary.inputHash once anything the
  // model read (a title, an answer, a risk) has been added, removed or edited.
  currentHash: string;
  hasThemes: boolean;
  running: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  const open = usePref(panelPref) === "open";
  // Read once per mount: the panel remounts with the step, which is often enough for a
  // "3m ago" label, and a Date.now() in render would be impure.
  const [now] = useState(() => Date.now());

  if (!summary && !admin) return null;

  const stale = Boolean(
    summary && (summary.inputHash ? summary.inputHash !== currentHash : summary.cardCount !== currentCount)
  );
  const button = admin && (
    <button
      onClick={onGenerate}
      disabled={running || !hasThemes}
      title={hasThemes ? undefined : "Cluster some themes first."}
      className="rounded-[2px] border border-ink bg-lime px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep disabled:opacity-40"
    >
      {running ? "Thinking… about half a minute" : summary ? "Regenerate" : "Summarize steps 1–2"}
    </button>
  );

  if (!summary) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[3px] border border-dashed border-black/25 px-4 py-3">
        <span className="rounded-[2px] bg-blue px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.05em] text-paper">
          Facilitator
        </span>
        <span className="text-[12.5px] italic text-muted">
          Write the group an executive summary of its themes, answers, risks and opportunities to read
          before hopes and fears.
        </span>
        <span className="ml-auto">{button}</span>
        {error && <span className="w-full text-[12px] text-coral">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => panelPref.write(open ? "closed" : "open")}
          aria-expanded={open}
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted hover:text-ink"
        >
          {open ? "▾" : "▸"} Where we&rsquo;ve got to
        </button>
        <span className="text-[11px] italic text-muted">Generated {relTime(summary.generatedAt, now)}</span>
        {stale && (
          <span className="rounded-[2px] border border-coral/60 bg-coral/10 px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.05em] text-coral">
            The board has changed since this was written
          </span>
        )}
        {admin && (
          <span className="ml-auto flex items-center gap-2">
            <span className="rounded-[2px] bg-blue px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.05em] text-paper">
              Facilitator
            </span>
            {button}
          </span>
        )}
      </div>
      {error && <p className="text-[12px] text-coral">{error}</p>}
      {summary.omittedThemes && summary.omittedThemes.length > 0 && (
        <p className="rounded-[3px] border border-dashed border-black/25 px-3 py-2 text-[12px] leading-[1.45] text-muted">
          <span className="font-bold text-ink">
            {summary.omittedThemes.length === 1 ? "One theme is not in this summary" : `${summary.omittedThemes.length} themes are not in this summary`}
          </span>{" "}
          — the board had more writing on it than one summary can read, so{" "}
          {summary.omittedThemes.length === 1 ? "it was" : "they were"} left out whole rather than
          cut short: {summary.omittedThemes.map((t) => `“${t}”`).join(", ")}. Read{" "}
          {summary.omittedThemes.length === 1 ? "that theme" : "those themes"} from the board itself.
        </p>
      )}
      {open && <SummaryBlock summary={summary} />}
    </div>
  );
}
