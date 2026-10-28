"use client";

import type { Starters } from "@/components/workshop/commitments/activityMeta";

// The questions a breakout talks about. Two shapes: a bulleted list under a blue rule, or
// (act 1.1) four numbered cards, because that activity IS the four questions and they are
// what the group reads aloud.
//
// NOTHING IS WRITTEN UNDER THESE. Giving a starter question an answer box is the exact
// misreading the activity exists to prevent: the writing happens in the board below.
export function StarterQuestions({ starters }: { starters: Starters }) {
  if ("cards" in starters) {
    return (
      <section>
        <Eyebrow>{starters.title}</Eyebrow>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {starters.cards.map((c, i) => (
            <div
              key={c.label}
              className="rounded-[3px] border border-[var(--hairline)] border-t-[3px] border-t-blue bg-card px-5 pb-5 pt-4"
            >
              <span className="font-mono text-[11px] font-bold tracking-[0.14em] text-blue">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="m-0 mt-3 text-[18px] font-extrabold leading-[1.2]">{c.label}</h3>
              <p className="m-0 mt-2 text-[14.5px] leading-[1.5]">{c.question}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="border-l-[3px] border-blue pl-5">
      <Eyebrow>{starters.title}</Eyebrow>
      <ul className="m-0 mt-2 flex list-disc flex-col gap-1 pl-5 text-[14.5px] leading-[1.5]">
        {starters.items.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">
      {children}
    </div>
  );
}
