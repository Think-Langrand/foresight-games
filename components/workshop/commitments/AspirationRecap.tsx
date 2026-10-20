"use client";

import type { RippleCard } from "@/lib/ripples-types";
import type { WorksheetSection } from "@/lib/exercise-types";

// Step 1, read back on the steps that answer it. Steps 2, 3 and 4 all ask the group to
// judge something against the aspiration, so the aspiration has to be on screen; a step
// that makes you tab back to remember what you are aiming at gets answered from memory.
//
// Read-only, and built from the SECTIONS rather than from a hard-coded list of prompts.
// The headings are whatever the facilitator wrote in the program editor, so this cannot
// drift from step 1 and keeps working if the prompts are reworded or re-counted.

export function AspirationRecap({
  sections,
  cards,
  onGoToAspiration,
}: {
  sections: WorksheetSection[];
  cards: RippleCard[];
  onGoToAspiration?: () => void;
}) {
  // Only the question blocks, and only those with something in them: a recap of three
  // empty prompts is three headings and no content.
  const blocks = sections
    .filter((s) => s.kind === "question")
    .map((s) => ({
      key: s.key,
      label: s.label,
      answers: cards
        .filter((c) => c.order === "STICKY" && c.section === s.key)
        .sort((a, b) => a.sort - b.sort || a.createdTime.localeCompare(b.createdTime)),
    }))
    .filter((b) => b.answers.length > 0);

  if (blocks.length === 0) {
    return (
      <div className="rounded-[4px] border border-dashed border-[var(--rule)] px-4 py-3">
        <p className="m-0 text-[13px] italic text-muted">
          Nothing written on step 1 yet.{" "}
          {onGoToAspiration && (
            <button
              type="button"
              onClick={onGoToAspiration}
              className="text-blue underline hover:no-underline"
            >
              Say what you are aspiring to first
            </button>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[4px] border-l-[3px] border-blue bg-blue/5 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-0 font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-blue">
          What you are aspiring to
        </p>
        {onGoToAspiration && (
          <button
            type="button"
            onClick={onGoToAspiration}
            className="shrink-0 text-[11px] text-muted underline hover:text-ink"
          >
            Edit on step 1
          </button>
        )}
      </div>
      <dl className="m-0 mt-2 flex flex-col gap-2">
        {blocks.map((b) => (
          <div key={b.key}>
            <dt className="text-[10.5px] font-bold leading-[1.3] text-ink/70">{b.label}</dt>
            <dd className="m-0 mt-0.5">
              {b.answers.length === 1 ? (
                <p className="m-0 max-w-[80ch] text-[13.5px] leading-[1.45]">
                  {b.answers[0].text}
                </p>
              ) : (
                <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
                  {b.answers.map((a) => (
                    <li key={a.id} className="max-w-[80ch] text-[13.5px] leading-[1.45]">
                      {a.text}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
