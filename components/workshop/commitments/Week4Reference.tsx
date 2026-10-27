"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import { Dot } from "@/components/workshop/synthesis/ThemeRail";

// THIS WEEK'S OWN WORK, in the rail — the counterpart to Week3Reference, which carries the
// earlier sessions.
//
// Act 5 asks the group to look across its desired outcomes and its response ideas and say
// what future it is working toward. Both of those are on tabs it has left, and the version
// of this step that put the response wall in a panel UNDER the question had the group
// scrolling away from the box it was meant to be writing in. A rail keeps the material
// beside the writing, which is the arrangement acts 1 and 3 already use for Week 3.
//
// READ-ONLY, and no affordances. Editing an outcome happens on act 3 and a response on act
// 4, where each was written; a tick or a drag here would be a second place to change the
// same card.
function Fold({
  label,
  count,
  defaultOpen = false,
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Nothing to open is not a fold, it is a line saying so — a disclosure that reveals an
  // empty box reads as broken.
  if (count === 0) {
    return (
      <p className="m-0 text-[12px] italic text-muted">
        {label}: nothing yet.
      </p>
    );
  }
  return (
    <div className="border-t border-[var(--rule)] pt-2 first:border-t-0 first:pt-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-2 text-left"
      >
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em]">
          {label}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-muted">{count}</span>
        <span aria-hidden className="ml-auto text-[11px] text-muted">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function Week4Reference({
  outcomes,
  responses,
}: {
  // Act 3's answers, already flattened to text by the view: they are worksheet stickies
  // rather than cards of a kind, so there is nothing here that needs the card.
  outcomes: string[];
  responses: RippleCard[];
}) {
  return (
    <aside className="flex flex-col gap-3 rounded-[4px] border border-[var(--rule)] px-4 py-3">
      <div>
        <h3 className="m-0 text-[13px] font-bold">What you have said so far</h3>
        <p className="m-0 mt-0.5 text-[12px] italic leading-[1.45] text-muted">
          Your own work from the last two steps. To change any of it, go back to the step it
          was written on.
        </p>
      </div>

      {/* OUTCOMES FIRST, AND OPEN. The vision is what the outcomes add up to, so they are
          the thing to have in view; the responses are how you would get there and matter
          second here. */}
      <Fold label="Desired outcomes" count={outcomes.length} defaultOpen>
        <ul className="m-0 flex list-none flex-col p-0">
          {outcomes.map((o, i) => (
            <li
              key={i}
              className="border-b border-black/10 py-2 text-[13px] leading-[1.45] last:border-b-0"
            >
              {o}
            </li>
          ))}
        </ul>
      </Fold>

      <Fold label="Strategic responses" count={responses.length}>
        <ul className="m-0 flex list-none flex-col p-0">
          {responses.map((c) => (
            <li
              key={c.id}
              className="flex items-start gap-2 border-b border-black/10 py-2 text-[13px] leading-[1.45] last:border-b-0"
            >
              <Dot />
              <span className="min-w-0">{c.text}</span>
            </li>
          ))}
        </ul>
      </Fold>
    </aside>
  );
}
