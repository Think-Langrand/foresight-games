"use client";

import { useEffect } from "react";
import { useSessionTabsHidden } from "@/components/design-groups/SessionHeader";
import { makePrefStore, usePref } from "@/components/workshop/synthesis/prefStore";

// The right rail: the questions the group is meant to be holding while it works, in the
// margin where they stay readable instead of scrolling away above the board. Every step
// of the week has one; what goes in it is the step's business (children).
//
// It folds away to a thin strip — once the prompts have been read it is width the board
// could be using — and the choice is remembered per browser. "wide" when a facilitator's
// suggestions share the rail, which need reading room. The page yields the width through
// body data attributes (see globals.css).

const FOLD = ["open", "closed"] as const;
const rightRailPref = makePrefStore("synthesis.rightRail", "open", FOLD);

export function PromptRail({
  wide = false,
  label = "Prompts",
  children,
}: {
  wide?: boolean;
  // What the folded strip calls the rail.
  label?: string;
  children: React.ReactNode;
}) {
  const open = usePref(rightRailPref) === "open";
  // Stands down while the board is hidden behind an earlier week's tab — see ThemeRail.
  const hidden = useSessionTabsHidden();
  useEffect(() => {
    if (hidden) return;
    document.body.dataset.rightRail = open ? "open" : "closed";
    return () => {
      delete document.body.dataset.rightRail;
    };
  }, [open, hidden]);
  const toggle = () => rightRailPref.write(open ? "closed" : "open");

  return (
    <aside
      className={
        "fixed inset-y-0 right-0 z-30 hidden overflow-y-auto border-l border-ink bg-card py-4 lg:block " +
        (!open ? "w-[2.75rem] px-0" : wide ? "w-[21rem] px-3" : "w-[15rem] px-3")
      }
    >
      {!open ? (
        // Folded: a thin strip with one control, so the rail is still findable.
        <button
          onClick={toggle}
          aria-expanded={false}
          title="Show the prompts"
          className="mx-auto flex h-full w-full flex-col items-center gap-2 pt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted hover:bg-lime/40 hover:text-ink"
        >
          <span aria-hidden className="text-[13px] leading-none">
            ‹
          </span>
          <span className="[writing-mode:vertical-rl]">{label}</span>
        </button>
      ) : (
        <>
          {/* In flow rather than floated over the heading, so it never sits on top of
              whatever is first in the rail. */}
          <div className="-mt-1 mb-2 flex justify-end">
            <button
              onClick={toggle}
              aria-expanded={true}
              title="Hide this panel"
              className="rounded-[2px] border border-[var(--hairline)] bg-paper px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-muted hover:border-ink hover:text-ink"
            >
              Hide ›
            </button>
          </div>
          {children}
        </>
      )}
    </aside>
  );
}

// A step's prompts, set the way every step sets them: a small heading, an italic lead,
// then the questions large — at 12px they were sized like UI chrome and scanned like it,
// which is the opposite of what a prompt is for.
export function Prompts({
  heading,
  lead,
  questions,
}: {
  heading: string;
  lead?: string;
  questions: { question: string; hint?: string }[];
}) {
  return (
    <>
      <h2 className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-muted">{heading}</h2>
      {lead && <p className="mt-2 text-[14.5px] italic leading-[1.4] text-muted">{lead}</p>}
      <ul className="mt-3 flex flex-col gap-3.5">
        {questions.map((q) => (
          <li key={q.question}>
            <div className="text-[17px] font-medium leading-[1.3] tracking-[-0.01em]">{q.question}</div>
            {q.hint && (
              <div className="mt-0.5 text-[12.5px] italic leading-[1.4] text-muted">{q.hint}</div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
