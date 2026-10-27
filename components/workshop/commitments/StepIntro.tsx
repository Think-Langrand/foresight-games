"use client";

// What a step is FOR, standing above its board or its questions.
//
// NOT THE `Directions` FOLD, which is how the tool works and is collapsed by default. This
// is what the activity is, and it has to be read before anyone starts rather than opened by
// the one person who thinks to look. Hardcoded rather than authored because nothing is
// written under it: giving it an answer box is the misreading it exists to prevent.
//
// IT IS THE DECK'S OWN SLIDE HEADER. A step number set in mono, the activity's name in the
// house's uppercase display weight, a rule under both, then the prose. It used to be a
// tinted card with a bar down the left — a shape that says "callout" and nothing else, and
// that the board already uses for warnings. Borrowing the handoff's header instead means
// the thing a group works in and the thing a committee reads share one typography, and
// each step announces itself the way its slide will.
//
// `aside` is a second column for reference the prose should not swallow — act 6 puts the
// four questions it is about to ask there, so the group can see the shape of a direction
// before it writes one.
export function StepIntro({
  n,
  title,
  aside,
  children,
}: {
  n?: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b-[1.5px] border-ink pb-2.5">
        {n && (
          <span className="shrink-0 font-mono text-[12px] font-bold tracking-[0.1em] text-blue">
            {n}
          </span>
        )}
        <h3 className="m-0 flex-1 basis-[14ch] text-balance text-[clamp(16px,2vw,22px)] font-bold uppercase leading-[1.12] tracking-[0.02em]">
          {title}
        </h3>
      </div>
      <div
        className={
          "mt-3 " +
          (aside
            ? "grid gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]"
            : "")
        }
      >
        <div className="flex max-w-[70ch] flex-col gap-2 text-[14.5px] leading-[1.55]">
          {children}
        </div>
        {aside && <div>{aside}</div>}
      </div>
    </div>
  );
}
