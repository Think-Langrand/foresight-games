"use client";

import type { RippleCard } from "@/lib/ripples-types";
import { TONE } from "@/components/workshop/synthesis/CardWall";
import { Dot } from "@/components/workshop/synthesis/ThemeRail";

// Step 3's wall, read back on step 4 as RAW MATERIAL.
//
// This is deliberately not a selectable list and must not look like one. The week used to
// ask the group to down-select three of these; it no longer does, and a list with any
// affordance on it would invite the group to tick rather than to write. So: no checkboxes,
// no stars, nothing clickable except the way back to step 3. The microcopy carries the job.
//
// Read-only by construction. Editing a response happens on step 3, where it was written.

export function ResponseRecap({
  responses,
  onGoToResponses,
}: {
  responses: RippleCard[];
  onGoToResponses: () => void;
}) {
  const t = TONE.response;

  if (responses.length === 0) {
    return (
      <div className="rounded-[4px] border border-dashed border-[var(--rule)] px-4 py-3">
        <p className="m-0 text-[13px] italic text-muted">
          Nothing on the response wall yet.{" "}
          <button
            type="button"
            onClick={onGoToResponses}
            className="text-blue underline hover:no-underline"
          >
            Open the option space first
          </button>
        </p>
      </div>
    );
  }

  return (
    <section className={"rounded-[4px] border-2 " + t.edge + " " + t.well}>
      <div className="flex flex-wrap items-baseline gap-2 border-b border-black/10 px-4 py-3">
        <span
          className={
            "rounded-[2px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] " +
            t.chip
          }
        >
          <span aria-hidden className="mr-1">
            {t.mark}
          </span>
          Strategic responses
        </span>
        <span className="font-mono text-[10px] tabular-nums text-muted">{responses.length}</span>
        <button
          type="button"
          onClick={onGoToResponses}
          className="ml-auto shrink-0 text-[11px] text-muted underline hover:text-ink"
        >
          Edit on step 3
        </button>
      </div>

      <p className="m-0 px-4 pt-3 text-[12.5px] italic leading-[1.45] text-muted">
        These are yours from step 3. You are not picking from them. Look for two that are
        stronger together, or one that makes another possible.
      </p>

      <ul className="m-0 list-none px-4 py-3">
        {responses.map((c) => (
          <li
            key={c.id}
            className="flex items-start gap-2 border-b border-black/10 py-[7px] text-[13px] leading-[1.45] last:border-b-0"
          >
            <Dot />
            <span className="min-w-0">{c.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
