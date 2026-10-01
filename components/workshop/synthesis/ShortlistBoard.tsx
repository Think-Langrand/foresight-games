"use client";

import type { RippleCard } from "@/lib/ripples-types";
import {
  assumptionLedger,
  shortlistCounts,
  stakeLedger,
  type SynthesisBoard,
} from "@/lib/synthesis-shape";

// STEP 4 — what the group will actually carry to the committee: the top risks and
// opportunities from step 2, and the assumptions from step 3 that turned out to matter.
//
// Nothing is written here. Everything on this page came out of an earlier step; this is
// the step where the group decides what it will carry forward, which is a different act
// from generating and deserves its own moment.
//
// Three is the target, not a rule: the count nudges past it and never blocks. A group that
// genuinely has four risks worth explaining should be able to say so and argue it out.

const TARGET = 3;

function Counter({ label, n }: { label: string; n: number }) {
  const over = n > TARGET;
  const done = n === TARGET;
  return (
    <span
      className={
        "rounded-[2px] border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] " +
        (done
          ? "border-ink bg-lime text-ink"
          : over
            ? "border-coral text-coral"
            : "border-[var(--rule)] text-muted")
      }
    >
      {n} of {TARGET} {label}
      {over && " — more than three"}
    </span>
  );
}

export function ShortlistBoard({
  board,
  editable,
  busy,
  onToggle,
  onGoToStakes,
}: {
  board: SynthesisBoard;
  editable: boolean;
  busy: boolean;
  onToggle: (card: RippleCard, shortlisted: boolean) => void;
  onGoToStakes: () => void;
}) {
  const ledger = stakeLedger(board);
  const counts = shortlistCounts(board);
  const assumptions = assumptionLedger(board);
  const nothingToPick =
    ledger.every((l) => l.risks.length === 0 && l.opportunities.length === 0) &&
    assumptions.length === 0;

  if (nothingToPick) {
    return (
      <div className="rounded-[3px] border border-[var(--hairline)] bg-card p-6 text-center">
        <p className="text-[14px] font-bold">Nothing to choose from yet.</p>
        <p className="mx-auto mt-1 max-w-[50ch] text-[13px] text-muted">
          This step picks from the risks and opportunities the group worked out on each
          theme, and the assumptions it wrote down beside its hopes and fears.
        </p>
        <button
          onClick={onGoToStakes}
          className="mt-3 rounded-[2px] border border-ink bg-lime px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep"
        >
          ← Go to What&rsquo;s at Stake
        </button>
      </div>
    );
  }

  const row = (c: RippleCard, accent: string) => (
    <li key={c.id}>
      <button
        onClick={() => editable && onToggle(c, !c.shortlisted)}
        disabled={!editable || busy}
        aria-pressed={c.shortlisted}
        className={
          "flex w-full items-start gap-2.5 rounded-[3px] border border-l-4 p-2.5 text-left transition-colors " +
          accent +
          (c.shortlisted
            ? " border-ink bg-lime/40"
            : " border-black/15 bg-paper hover:border-ink") +
          (editable ? " cursor-pointer" : " cursor-default")
        }
      >
        <span
          aria-hidden
          className={
            "mt-[1px] shrink-0 text-[13px] leading-none " + (c.shortlisted ? "text-ink" : "text-black/25")
          }
        >
          {c.shortlisted ? "★" : "☆"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-[1.45]">{c.text}</span>
          {c.description && (
            <span className="mt-0.5 block text-[11.5px] leading-[1.4] text-muted">
              {c.description}
            </span>
          )}
        </span>
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Counter label="risks" n={counts.risks} />
        <Counter label="opportunities" n={counts.opportunities} />
        {assumptions.length > 0 && <Counter label="assumptions" n={counts.assumptions} />}
        <p className="text-[12px] italic text-muted">
          Pick the ones you would explain to the committee.
        </p>
      </div>

      {ledger.map(({ theme, risks, opportunities }) => {
        if (risks.length === 0 && opportunities.length === 0) return null;
        return (
          <section key={theme.id} className="border-t border-[var(--hairline)] pt-3">
            <h3 className="text-[13.5px] font-bold">{theme.text}</h3>
            <div className="mt-2 flex flex-wrap gap-5">
              {risks.length > 0 && (
                <div className="min-w-[18rem] flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                    Risks
                  </div>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {risks.map((c) => row(c, "border-l-coral"))}
                  </ul>
                </div>
              )}
              {opportunities.length > 0 && (
                <div className="min-w-[18rem] flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                    Opportunities
                  </div>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {opportunities.map((c) => row(c, "border-l-[var(--lime-deep)]"))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        );
      })}

      {/* The group's own thinking, picked over the same way. An assumption is only
          interesting once something has pushed on it, so the question is not "what did we
          assume" — they wrote that in step 3 — but which of those turned out to be worth
          telling the committee about. Listed across every theme, because an assumption
          that shows up under three of them is exactly the kind worth naming. */}
      {assumptions.length > 0 && (
        <section className="border-t-2 border-ink pt-4">
          <h3 className="text-[13.5px] font-extrabold uppercase tracking-[0.06em]">
            Assumptions worth reporting
          </h3>
          <p className="mt-1 max-w-[70ch] text-[12px] italic leading-[1.45] text-muted">
            Did any of these get challenged in a way that surprised the group? Pick the ones
            the committee should hear about.
          </p>

          <ul className="mt-3 flex flex-col gap-1.5">
            {assumptions.map(({ card, source, theme }) => (
              <li key={card.id}>
                <button
                  onClick={() => editable && onToggle(card, !card.shortlisted)}
                  disabled={!editable || busy}
                  aria-pressed={card.shortlisted}
                  className={
                    "flex w-full items-start gap-2.5 rounded-[3px] border border-l-4 border-l-blue p-2.5 text-left transition-colors " +
                    (card.shortlisted
                      ? "border-ink bg-lime/40"
                      : "border-black/15 bg-paper hover:border-ink") +
                    (editable ? " cursor-pointer" : " cursor-default")
                  }
                >
                  <span
                    aria-hidden
                    className={
                      "mt-[1px] shrink-0 text-[13px] leading-none " +
                      (card.shortlisted ? "text-ink" : "text-black/25")
                    }
                  >
                    {card.shortlisted ? "★" : "☆"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-[1.45]">{card.text}</span>
                    {/* Where it came from. On its own an assumption reads as a loose
                        sentence; the card and theme are what make it an answer. */}
                    <span className="mt-0.5 block text-[11px] leading-[1.4] text-muted">
                      Assumed under the {source.cardKind} &ldquo;{source.text}&rdquo; ·{" "}
                      {theme.text}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
