// What step 5 shows while it is still shut.
//
// THE TAB IS NOT DISABLED. A group that clicks a padlock and gets nothing learns only that
// something is wrong with the page. Clicking it lands here instead, on the list of what is
// left — which is the answer to the question they clicked to ask.
//
// IT USED TO HAVE A SECOND STATE, a blue "generating your summary" panel for while the
// model drafted the lead. The drafting is out for now, so there is nothing to wait on and
// the only thing this says is what is still to do.
export default function HandoffGuideLocked({
  steps,
}: {
  steps: { label: string; done: boolean; have: number; need: number | null }[];
}) {
  const done = steps.filter((s) => s.done).length;
  return (
    <section
      className="rounded-[3px] border border-ink"
      // A --blue (#275de2) wash. Not lighter: below about 10% this tint reads grey against
      // the paper, and a card that is waiting on something must not read as broken. On bare
      // paper it read as the page not having loaded.
      style={{ background: "rgba(39,93,226,0.13)" }}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink px-5 py-3">
        <h2 className="m-0 text-[15px] font-extrabold uppercase tracking-tight">
          Not ready yet
        </h2>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] tabular-nums text-muted">
          {done} of {steps.length} done
        </span>
      </header>
      <div className="px-5 py-4">
        <p className="m-0 mb-4 max-w-[68ch] text-[13.5px] leading-[1.5] text-muted">
          Your handoff is drawn from the steps before this one. Finish them and it opens on
          its own.
        </p>
        <ul className="m-0 list-none border-t-[1.5px] border-ink p-0">
          {steps.map((s) => (
            <li
              key={s.label}
              className="flex items-center gap-3 border-b border-[var(--hairline)] py-[11px] last:border-b-0"
            >
              {/* A tick or an empty ring, drawn rather than typed: a checkbox would invite a
                  click, and nothing here is something you can tick off from this page. */}
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke={s.done ? "var(--blue)" : "currentColor"}
                strokeWidth="1.6"
              >
                <circle cx="8" cy="8" r="6.6" className={s.done ? "" : "text-muted/40"} />
                {s.done && <path d="M5 8.2l2.1 2.1L11 6.5" strokeLinecap="round" />}
              </svg>
              <span
                className={
                  "text-[14px] " + (s.done ? "text-muted line-through decoration-1" : "font-semibold")
                }
              >
                {s.label}
              </span>
              {/* THE COUNT, NOT "TO DO". A step named with no number leaves the group
                  guessing whether it is one box away or four, which is the one thing this
                  panel exists to answer. The tick already says done, so the right-hand
                  column spends itself on how far along instead.

                  CLAMPED AT THE TARGET. A step can overshoot — four priorities against a
                  target of three — and "4 of 3" reads as an error rather than as work in
                  hand. Going over is reported where it is actionable, on 1.2's own panel,
                  which can offer the Undo. Here it is simply done. */}
              <span className="ml-auto shrink-0 font-mono text-[9.5px] uppercase tracking-[0.1em] tabular-nums text-muted">
                {s.need === null
                  ? s.done
                    ? "done"
                    : "to do"
                  : `${Math.min(s.have, s.need)} of ${s.need}`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
