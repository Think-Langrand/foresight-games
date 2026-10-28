"use client";

import { ACTIVITY_META, type ActivityStep } from "@/components/workshop/commitments/activityMeta";

// What an activity IS, above whatever it asks for: the step eyebrow, the minutes, the
// headline question and the intro. Read before anyone starts, so it is never folded.
//
// Everything printed here comes from ACTIVITY_META, so the tracker pill, this heading and
// the continue button under the activity cannot name three different things.
export function ActivityHeader({ step }: { step: ActivityStep }) {
  const m = ACTIVITY_META[step];
  return (
    <header>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-blue">
          {m.eyebrow}
        </span>
        <span className="text-[13px] text-muted">{m.minutes} min</span>
      </div>
      <h2 className="m-0 mt-2 max-w-[28ch] text-balance text-[clamp(24px,2.8vw,34px)] font-extrabold leading-[1.12] tracking-[-0.01em]">
        {m.headline}
      </h2>
      <p className="m-0 mt-3 max-w-[78ch] text-[15px] leading-[1.55]">{m.intro}</p>
    </header>
  );
}
