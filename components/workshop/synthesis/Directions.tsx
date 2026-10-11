"use client";

import { Dot } from "@/components/workshop/synthesis/ThemeRail";
import { usePref, type PrefStore } from "@/components/workshop/synthesis/prefStore";

// How to work whatever surface is on screen, as a band in the right rail.
//
// Foldable and remembered, because directions are the part you stop needing once you know
// the tool — and the rail is not tall enough for everything, so the thing that gets out of
// the way should be the thing you have finished reading.
//
// The LINES are the caller's. A shared file that knows nothing about the canvas should not
// be holding the canvas's instructions, and a registry keyed by view would put every
// step's copy in one place for no gain. Each step passes its own strings and its own fold
// store, so folding step 1's help does not fold step 2's — different tools, different
// decision.

export const DIRECTIONS_FOLD = ["open", "closed"] as const;
export type DirectionsFold = (typeof DIRECTIONS_FOLD)[number];

export function Directions({
  title,
  lines,
  fold,
  first = false,
}: {
  // Named for the surface it describes — "Using the canvas", "Working on a theme".
  title: string;
  lines: readonly string[];
  // Module-scope and owned by the step. makePrefStore holds closure state, so it cannot be
  // built per render.
  fold: PrefStore<DirectionsFold>;
  // The top band in a rail carries the rule the rail's head ends in.
  first?: boolean;
}) {
  const open = usePref(fold) === "open";
  return (
    <section
      className={"-mx-3 px-3 pb-5 pt-4" + (first ? " -mt-4 border-b border-ink" : "")}
      style={{ background: "var(--board)" }}
    >
      <button
        onClick={() => fold.write(open ? "closed" : "open")}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-left text-[11.5px] font-bold uppercase tracking-[0.1em] text-muted hover:text-ink"
      >
        <span aria-hidden className="text-[10px] leading-none">
          {open ? "▾" : "▸"}
        </span>
        {title}
      </button>
      {open && (
        <ul className="mt-2.5 flex flex-col gap-2 text-[13px] leading-[1.4] text-ink/80">
          {lines.map((d, i) => (
            <li key={i} className="flex gap-1.5">
              <Dot />
              <span className="min-w-0">{d}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
