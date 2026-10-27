"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import { Dot } from "@/components/workshop/synthesis/ThemeRail";

// THIS WEEK'S OWN WORK, in the rail — the counterpart to Week3Reference, which carries the
// earlier sessions.
//
// EVERY SECTION IS OPTIONAL, so one component serves several steps: act 3 wants the
// priorities beside it, act 5 wants the outcomes and the response wall. Pass what the step
// is working from and nothing else renders.
//
// WHY A RAIL AND NOT A PANEL ABOVE OR BELOW. Both of these steps work FROM earlier answers
// while writing new ones, and both were first built with that material stacked around the
// question — which meant scrolling away from the box you are meant to be writing in to
// read the thing you are meant to be writing about. Beside it, the two stay in view
// together. That is the arrangement acts 1 and 3 already use for Week 3.
//
// READ-ONLY, and no affordances. Editing a priority happens on act 2, an outcome on act 3,
// a response on act 4 — each where it was written. A tick or a drag here would be a second
// place to change the same card, and the one on the step that owns it would stop being the
// obvious one.
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
  priorities = [],
  outcomes = [],
  responses = [],
}: {
  // Act 2's starred picks. Cards rather than strings because a priority carries the note
  // explaining a disagreement the room never settled, and a group writing outcomes for an
  // issue it never settled should be reminded that it never settled it.
  priorities?: RippleCard[];
  // Act 3's answers, already flattened to text by the view: they are worksheet stickies
  // rather than cards of a kind, so there is nothing here that needs the card.
  outcomes?: string[];
  responses?: RippleCard[];
}) {
  return (
    <aside className="flex flex-col gap-3 rounded-[4px] border-2 border-ink bg-card px-4 py-3">
      <div>
        <h3 className="m-0 text-[13px] font-bold">What you have said so far</h3>
        <p className="m-0 mt-0.5 text-[12px] italic leading-[1.45] text-muted">
          Your own work from the earlier steps. To change any of it, go back to the step it
          was written on.
        </p>
      </div>

      {/* FIRST WHERE THEY APPEAR, AND OPEN. On act 4 the responses are written toward
          these; on act 5 the vision is what they add up to. Either way they lead. */}
      {outcomes.length > 0 && (
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
      )}

      {/* ALWAYS OPEN. Act 3 writes outcomes FOR these and act 4 writes responses linked to
          them, so on both steps they are what the question is about rather than background
          to it. */}
      {priorities.length > 0 && (
        <Fold label="Your priorities" count={priorities.length} defaultOpen>
          <ul className="m-0 flex list-none flex-col p-0">
            {priorities.map((c) => (
              <li
                key={c.id}
                className="border-b border-black/10 py-2 text-[13px] leading-[1.45] last:border-b-0"
              >
                <span className="mr-1 text-amber">★</span>
                {c.text}
                {c.description && (
                  <span className="mt-0.5 block text-[12px] italic text-muted">
                    You did not agree on this: {c.description}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Fold>
      )}

      {responses.length > 0 && (
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
      )}
    </aside>
  );
}
