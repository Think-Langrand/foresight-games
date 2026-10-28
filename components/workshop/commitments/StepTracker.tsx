"use client";

import {
  ACTIVITY_GROUPS,
  ACTIVITY_STEPS,
  REVIEW_LABEL,
  pillLabel,
  type ActivityStep,
  type CommitStep,
} from "@/components/workshop/commitments/activityMeta";

// The step row: three steps, each with a progress bar and its two activities as pills,
// then the handoff off to the right behind a rule.
//
// Same a11y contract as the flat tab rows on the other boards (role=tablist, one
// aria-selected tab), so a screen reader meets one pattern across the four weeks. Every
// activity is open from the first paint: a shared board is worked asynchronously, so gating
// one behind another strands people. Only the handoff can be shut.
export function StepTracker({
  step,
  onSelect,
  reviewLocked,
  stepsDone,
  stepsTotal,
  missing,
}: {
  step: CommitStep;
  onSelect: (s: CommitStep) => void;
  reviewLocked: boolean;
  stepsDone: number;
  stepsTotal: number;
  missing: string[];
}) {
  const at =
    step === "review" ? ACTIVITY_STEPS.length : ACTIVITY_STEPS.indexOf(step as ActivityStep);

  return (
    <div
      role="tablist"
      aria-label="Session 4 steps"
      className="flex flex-col gap-4 border-b border-[var(--hairline)] pb-5 lg:flex-row lg:items-start"
    >
      <div className="grid flex-1 gap-x-5 gap-y-4 sm:grid-cols-3">
        {ACTIVITY_GROUPS.map((g) => {
          const first = ACTIVITY_STEPS.indexOf(g.steps[0]);
          const active = g.steps.includes(step as ActivityStep);
          // How far through this step the group is on screen: half on its first activity,
          // full on its second or once past it, empty before it.
          const fill = at < first ? 0 : at === first ? 50 : 100;
          return (
            <div key={g.n}>
              <div className="h-[3px] w-full bg-[var(--hairline)]">
                <div
                  className={"h-full transition-all " + (active ? "bg-blue" : "bg-ink/25")}
                  style={{ width: `${fill}%` }}
                />
              </div>
              <div
                className={
                  "mt-2.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] " +
                  (active ? "text-blue" : "text-muted")
                }
              >
                Step {g.n} · {g.label}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {g.steps.map((s) => {
                  const on = step === s;
                  return (
                    <button
                      key={s}
                      role="tab"
                      aria-selected={on}
                      onClick={() => onSelect(s)}
                      className={
                        "rounded-[2px] px-2.5 py-1.5 text-[13px] transition-colors " +
                        (on
                          ? "bg-ink font-bold text-paper"
                          : "text-ink/80 hover:bg-black/5 hover:text-ink")
                      }
                    >
                      {pillLabel(s)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* THE HANDOFF, behind a rule. CLICKABLE EVEN WHEN LOCKED: a padlock that does nothing
          on click tells a group only that the page is broken; clicking it opens the list of
          what is left, which is the question they clicked to ask. */}
      <div className="flex items-center lg:self-end lg:border-l lg:border-[var(--hairline)] lg:pl-5">
        <button
          role="tab"
          aria-selected={step === "review"}
          title={reviewLocked ? `Finish these first: ${missing.join(", ")}` : undefined}
          onClick={() => onSelect("review")}
          className={
            "flex items-center gap-1.5 rounded-[2px] px-2.5 py-1.5 text-[13px] transition-colors " +
            (step === "review"
              ? "bg-ink font-bold text-paper"
              : reviewLocked
                ? "text-muted hover:text-ink"
                : "text-ink/80 hover:bg-black/5 hover:text-ink")
          }
        >
          {reviewLocked && (
            <svg
              aria-hidden
              viewBox="0 0 10 12"
              className="h-[11px] w-[9px] shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <rect x="0.7" y="5" width="8.6" height="6.3" rx="1" />
              <path d="M2.6 5V3.3a2.4 2.4 0 0 1 4.8 0V5" />
            </svg>
          )}
          {REVIEW_LABEL}
          {reviewLocked && (
            <span className="font-mono text-[10px] font-bold tabular-nums">
              {stepsDone}/{stepsTotal}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
