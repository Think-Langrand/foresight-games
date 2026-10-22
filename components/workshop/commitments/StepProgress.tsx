"use client";

// How far through a step the group is, as a bar and a count.
//
// WHAT COUNTS AS DONE IS THE STEP'S BUSINESS, not this component's. Step 2 counts a card
// only when BOTH its scales are set, because that is when it plots; step 1 counts a prompt
// that has at least one answer. Passing the two numbers in keeps the arithmetic beside the
// thing being measured, where it can be read against the rest of that step's rules.
//
// NOT A GATE AND NOT A TARGET. Nothing on this week is enforced and step 2 has a floor
// rather than a cap, so a full bar means "you have been through everything", never "you may
// now continue". The bar can also read past full on step 2 once a group places more than
// the floor, which is why `done` and `total` are independent of any cap.
export function StepProgress({
  done,
  total,
  noun,
  hint,
}: {
  done: number;
  total: number;
  // What is being counted, already pluralised by the caller: "scored", "answered".
  noun: string;
  hint?: string;
}) {
  if (total === 0) return null;
  const pct = Math.min(100, Math.round((done / total) * 100));
  const complete = done >= total;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] tabular-nums">
          {done} of {total} {noun}
        </span>
        {hint && <span className="text-[11px] italic text-muted">{hint}</span>}
      </div>
      {/* The track is a plain div rather than <progress>, which cannot be styled to the
          house flat-fill look across browsers. The ARIA role carries the same meaning. */}
      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${done} of ${total} ${noun}`}
        className="h-[6px] w-full overflow-hidden rounded-[3px] bg-ink/10"
      >
        <div
          className={
            "h-full rounded-[3px] transition-[width] duration-300 ease-out " +
            (complete ? "bg-[var(--lime-deep)]" : "bg-ink")
          }
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
