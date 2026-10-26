"use client";

import type { RippleCard } from "@/lib/ripples-types";
import { MAX_PRIORITIES } from "@/lib/commitments-shape";

// Act 2's three priorities, read back on act 3 as CONTEXT.
//
// Deliberately not a set of headings to write under. The activity asks for one or two
// outcomes FOR the top three, not one outcome per priority, and nesting the boxes would
// have made the looser answer impossible to give — a group that writes a single outcome
// serving all three would have had nowhere to put it. So the priorities sit above the
// prompt as the thing being answered, and the answers stay a flat list.
//
// Read-only by construction. Starring happens on act 2, where it was decided.
export function PriorityRecap({
  rows,
  onGoToPriorities,
}: {
  rows: RippleCard[];
  onGoToPriorities: () => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[4px] border border-dashed border-[var(--rule)] px-4 py-3">
        <p className="m-0 text-[13px] italic text-muted">
          No priorities named yet.{" "}
          <button
            type="button"
            onClick={onGoToPriorities}
            className="text-blue underline hover:no-underline"
          >
            Choose your {MAX_PRIORITIES} first
          </button>
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-[4px] border-2 border-ink">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-ink px-4 py-3">
        <span className="rounded-[2px] bg-amber px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink">
          <span aria-hidden className="mr-1">
            ★
          </span>
          Your priorities
        </span>
        <span className="font-mono text-[10px] tabular-nums text-muted">{rows.length}</span>
        <button
          type="button"
          onClick={onGoToPriorities}
          className="ml-auto shrink-0 text-[11px] text-muted underline hover:text-ink"
        >
          Change on step 2
        </button>
      </div>

      <p className="m-0 px-4 pt-3 text-[12.5px] italic leading-[1.45] text-muted">
        What you chose to carry forward. Write one or two outcomes for these — not one per
        row, if the same outcome serves more than one.
      </p>

      <ul className="m-0 list-none px-4 py-3">
        {rows.map((c) => (
          <li
            key={c.id}
            className="border-b border-[var(--hairline)] py-[7px] text-[13px] leading-[1.45] last:border-b-0"
          >
            {c.text}
            {/* The dispute travels with the priority. A group writing outcomes for an
                issue it never settled should be reminded that it never settled it. */}
            {c.description && (
              <span className="mt-0.5 block text-[12px] italic text-muted">
                Still disputed — {c.description}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
