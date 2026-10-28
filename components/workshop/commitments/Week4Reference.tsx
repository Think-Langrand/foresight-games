"use client";

import type { RippleCard } from "@/lib/ripples-types";
import type { PrioritySlot } from "@/lib/commitments-shape";
import { Dot } from "@/components/workshop/synthesis/ThemeRail";
import { Fold } from "@/components/workshop/commitments/ReferenceRail";
import { Eyebrow } from "@/components/workshop/commitments/StarterQuestions";

// "Look across the whole picture": THIS WEEK'S OWN WORK read back on act 3.1, where the
// vision is what it all adds up to. Four folds, one per thing the activity says to look
// across. Every section is optional, so the same panel can sit beside 3.2 with only what
// that step draws on.
//
// READ-ONLY, and no affordances. Editing a priority happens on 1.2, an outcome on 2.1, a
// response on 2.2, each where it was written.
export function Week4Reference({
  title = "Look across the whole picture",
  intro = "What do these aspirations require public health to become?",
  slots = [],
  textOf = (pick) => pick.text,
  hopes = [],
  outcomes = [],
  responses = [],
}: {
  title?: string;
  intro?: string;
  // 1.2's three, with their status and the group's "why" on each.
  slots?: PrioritySlot[];
  // The Session 3 card's CURRENT words for a pick. A pick stores a copy of its source's
  // text when it is minted; a typo fixed on Session 3 afterwards must show here too.
  textOf?: (pick: RippleCard) => string;
  // Session 3's hopes, including the flips.
  hopes?: RippleCard[];
  // 2.1's outcomes, grouped under the priority they were written for.
  outcomes?: { priority: string; items: RippleCard[] }[];
  // 2.2's response pool.
  responses?: RippleCard[];
}) {
  const outcomeCount = outcomes.reduce((n, o) => n + o.items.length, 0);
  return (
    <section className="rounded-[3px] border border-[var(--hairline)] bg-card px-5 py-4">
      <Eyebrow>{title}</Eyebrow>
      <p className="m-0 mt-1 text-[13px] leading-[1.5] text-muted">
        {intro}{" "}
        <span className="italic">Click a heading to open it.</span>
      </p>
      <div className="mt-3 grid gap-x-4 sm:grid-cols-2">
        <div>
          <Fold label="Priorities" count={slots.length}>
            <ol className="m-0 flex list-none flex-col p-0">
              {slots.map((s, i) => (
                <li
                  key={s.card.id}
                  className="border-b border-black/10 py-2 text-[13px] leading-[1.45] last:border-b-0"
                >
                  <span className="mr-1.5 font-mono text-[10px] font-bold text-blue">
                    {i + 1}
                  </span>
                  {textOf(s.card)}
                  {s.card.description && (
                    <span className="mt-0.5 block text-[12px] italic text-muted">
                      {s.card.description}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </Fold>
          <Fold label="Desired outcomes" count={outcomeCount}>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {outcomes.map((o) =>
                o.items.length === 0 ? null : (
                  <li key={o.priority} className="text-[13px] leading-[1.45]">
                    <span className="block font-mono text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">
                      {o.priority}
                    </span>
                    <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
                      {o.items.map((c) => (
                        <li key={c.id} className="flex items-start gap-2">
                          <Dot />
                          <span className="min-w-0">{c.text}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              )}
            </ul>
          </Fold>
        </div>
        <div>
          <Fold label="Hopes" count={hopes.length}>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {hopes.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-[13px] leading-[1.45]">
                  <Dot />
                  <span className="min-w-0">{c.text}</span>
                </li>
              ))}
            </ul>
          </Fold>
          <Fold label="Response ideas" count={responses.length}>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {responses.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-[13px] leading-[1.45]">
                  <Dot />
                  <span className="min-w-0">{c.text}</span>
                </li>
              ))}
            </ul>
          </Fold>
        </div>
      </div>
    </section>
  );
}
