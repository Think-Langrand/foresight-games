// What step 5 shows before it can be built, and while it is building itself.
//
// THE TAB IS NOT DISABLED. A group that clicks a padlock and gets nothing learns only that
// something is wrong with the page. Clicking it lands here instead, on the list of what is
// left — which is the answer to the question they clicked to ask.
export default function HandoffGuideLocked({
  steps,
  generating,
}: {
  steps: { label: string; done: boolean }[];
  generating: boolean;
}) {
  if (generating) {
    return (
      <section
        className="rounded-[3px] border border-blue px-6 py-8"
        // The --blue token (#275de2) at a tint that still reads as blue against the paper
        // background. At 8% it read grey, which is the one thing a "we are working on it"
        // panel must not look like.
        style={{ background: "rgba(39,93,226,0.13)" }}
        aria-live="polite"
      >
        <p className="m-0 animate-pulse text-[17px] font-extrabold uppercase tracking-tight text-blue">
          Generating your summary&hellip;
        </p>
        <p className="m-0 mt-2 max-w-[62ch] text-[14px] leading-[1.5]">
          Reading everything your group decided across the four steps and drafting the lead
          your handoff opens with. This takes about a minute &mdash; leave the page open and
          it will appear here.
        </p>
      </section>
    );
  }

  const done = steps.filter((s) => s.done).length;
  return (
    <section
      className="rounded-[3px] border border-ink"
      // The same --blue (#275de2) wash the generating panel uses, and for the same reason:
      // below about 10% this tint reads grey against the paper, and a waiting card that
      // reads grey reads broken. The ink border, not the fill, is what tells the two apart.
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
          Your handoff guide is written from the four steps before this one. Finish them and
          this opens on its own, with a first draft of your summary already in it.
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
              <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                {s.done ? "done" : "to do"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
