"use client";

import { useMemo } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import type { WorksheetSection } from "@/lib/exercise-types";
import {
  MAX_PICKS_PER_KIND,
  isPicked,
  isStillOpen,
  type CommitmentsBoard,
} from "@/lib/commitments-shape";
import { indexSynthesisBoard, isUnnamedTheme, themeLabel } from "@/lib/synthesis-shape";
import { TONE, type WallTone } from "@/components/workshop/synthesis/CardWall";
import { Directions, DIRECTIONS_FOLD } from "@/components/workshop/synthesis/Directions";
import { makePrefStore } from "@/components/workshop/synthesis/prefStore";
import { AspirationRecap } from "@/components/workshop/commitments/AspirationRecap";

// STEP 5 — the handoff. Four sessions of work are already written; this step decides what
// the steering committee's eye lands on first.
//
// NOTHING ON AN EARLIER BOARD IS MUTATED. A star on a Session 3 risk is a `pick` card on
// THIS board carrying that risk's id in `source_card_id`, and a settled uncertainty is a
// `settled` card pointing at the Session 1 answer. Every step of this week writes to this
// week's board and nothing else, and the handoff deck derives the star rather than reading
// a flag off Session 3. See lib/commitments-shape's header.
//
// THE TWO HALVES BEHAVE IN OPPOSITE DIRECTIONS, on purpose:
//   picks     default OFF. A star is a positive act, capped at three.
//   still open default ON.  Doing nothing leaves the record honest. A group that never
//             opens this step still hands over every uncertainty it ever wrote, which is
//             the truthful answer, where an empty star list would be a lie about the work.

const handoffDirections = makePrefStore(
  "commitments.directions.handoff",
  "open",
  DIRECTIONS_FOLD
);

const HANDOFF_DIRECTIONS = [
  `Star up to ${MAX_PICKS_PER_KIND} risks and ${MAX_PICKS_PER_KIND} opportunities. The test is which ones you want the committee to act on, not which are worst or best.`,
  "Walk the uncertainties from Session 1. Mark the ones these four sessions actually answered. Leave the rest open.",
  "Open is a finding. A question you still cannot answer is worth more to the committee than a tidy list.",
  "The last line is not a summary. It is the one thing you want read first.",
];

function Stakes({
  tone,
  title,
  groups,
  board,
  editable,
  onToggle,
}: {
  tone: Extract<WallTone, "risk" | "opportunity">;
  title: string;
  groups: { id: string; label: string; cards: RippleCard[] }[];
  board: CommitmentsBoard;
  editable: boolean;
  onToggle: (card: RippleCard, on: boolean) => void;
}) {
  const t = TONE[tone];
  const all = groups.flatMap((g) => g.cards);
  const picked = all.filter((c) => isPicked(board, c.id)).length;
  const atCap = picked >= MAX_PICKS_PER_KIND;
  const over = picked > MAX_PICKS_PER_KIND;

  if (all.length === 0) {
    return (
      <section className={"rounded-[4px] border-2 px-4 py-3 " + t.edge + " " + t.well}>
        <span className={"rounded-[2px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] " + t.chip}>
          {title}
        </span>
        <p className="m-0 mt-2 text-[13px] italic text-muted">
          Session 3 recorded none of these.
        </p>
      </section>
    );
  }

  return (
    <section className={"flex min-w-0 flex-col overflow-hidden rounded-[4px] border-2 " + t.edge + " " + t.well}>
      <div className="flex flex-wrap items-baseline gap-2 border-b border-black/10 px-4 py-3">
        <span className={"rounded-[2px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] " + t.chip}>
          <span aria-hidden className="mr-1">
            {t.mark}
          </span>
          {title}
        </span>
        <span className="text-[12px] font-bold tabular-nums">
          {picked} of {MAX_PICKS_PER_KIND} starred
        </span>
        <span className="text-[11px] italic text-muted">
          {over
            ? `${picked - MAX_PICKS_PER_KIND} more than ${MAX_PICKS_PER_KIND}`
            : atCap
              ? "Un-star one to swap it"
              : `${all.length} to choose from`}
        </span>
      </div>

      {groups.map((g) => (
        <div key={g.id} className="px-4 py-2">
          <h4 className="text-[10px] font-bold uppercase leading-[1.3] tracking-[0.08em] text-muted">
            {g.label}
          </h4>
          {g.cards.length === 0 ? (
            <p className="mt-1 text-[12px] italic text-muted">Nothing on this theme.</p>
          ) : (
            <ul className="m-0 mt-1 flex list-none flex-col p-0">
              {g.cards.map((c) => {
                const on = isPicked(board, c.id);
                // At the cap the unstarred go genuinely disabled rather than silently
                // doing nothing, the same rule step 3 uses for bold moves.
                const locked = !on && atCap;
                return (
                  <li key={c.id}>
                    <label
                      className={
                        "flex cursor-pointer items-start gap-2 rounded-[3px] px-1 py-1.5 text-[13px] leading-[1.45] transition-colors " +
                        (on ? "bg-paper/80 font-bold" : locked ? "opacity-45" : "hover:bg-paper/50") +
                        (locked ? " cursor-not-allowed" : "")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!editable || locked}
                        onChange={() => onToggle(c, !on)}
                        className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--amber)]"
                      />
                      <span className="min-w-0">
                        {on && <span className="mr-1 text-amber">★</span>}
                        {c.text}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

export function HandoffBoard({
  board,
  sections,
  cards,
  week3Cards,
  week1Uncertainties,
  summaryHref,
  editable,
  onTogglePick,
  onToggleSettled,
  onGoToAspiration,
  children,
}: {
  board: CommitmentsBoard;
  sections: WorksheetSection[];
  cards: RippleCard[];
  week3Cards: RippleCard[];
  week1Uncertainties: { key: string; bucket: string; answers: { id: string; text: string }[] }[];
  summaryHref?: string;
  editable: boolean;
  onTogglePick: (source: { id: string; text: string }, on: boolean) => void;
  onToggleSettled: (source: { id: string; text: string }, on: boolean) => void;
  onGoToAspiration: () => void;
  children?: React.ReactNode;
}) {
  // Session 3's own index, so the risks and opportunities are grouped under exactly the
  // themes Session 3 put them on.
  const w3 = useMemo(() => indexSynthesisBoard(week3Cards), [week3Cards]);
  const groupsOf = (map: Map<string, RippleCard[]>) =>
    w3.themes
      .map((t) => ({
        id: t.id,
        label: isUnnamedTheme(t) ? themeLabel(w3, t) : t.text,
        cards: map.get(t.id) ?? [],
      }))
      .filter((g) => g.cards.length > 0);

  const openCount = week1Uncertainties.reduce(
    (n, b) => n + b.answers.filter((a) => isStillOpen(board, a.id)).length,
    0
  );
  const totalUncertainties = week1Uncertainties.reduce((n, b) => n + b.answers.length, 0);

  return (
    <div className="flex flex-col gap-5">
      {/* The thing this step is editing, one click away. It opens in a NEW TAB on purpose:
          the deck is a full-screen slide view that takes the whole viewport, and navigating
          there in place would drop the board's step, its scroll and any open composer. A
          group should be able to look, decide, and come back to the same screen.
          Offered before any choosing as well as after, because "what would they get right
          now" is the question this step answers. */}
      {summaryHref && (
        <a
          href={summaryHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-4 rounded-[3px] border border-ink px-5 py-4 transition hover:bg-card"
        >
          <span className="min-w-0">
            <span className="block text-[15px] font-extrabold uppercase tracking-tight">
              Your handoff
            </span>
            <span className="mt-1 block text-[13px] leading-[1.45] text-muted">
              Four sessions on one page. What you choose below is what a reader meets first.
            </span>
          </span>
          <span className="shrink-0 text-[13px] font-bold uppercase tracking-[0.06em] text-blue">
            Preview &rarr;
            <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-muted">
              opens a new tab
            </span>
          </span>
        </a>
      )}

      <AspirationRecap sections={sections} cards={cards} onGoToAspiration={onGoToAspiration} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Stakes
          tone="risk"
          title="Top risks"
          groups={groupsOf(w3.risks)}
          board={board}
          editable={editable}
          onToggle={(c, on) => onTogglePick({ id: c.id, text: c.text }, on)}
        />
        <Stakes
          tone="opportunity"
          title="Top opportunities"
          groups={groupsOf(w3.opportunities)}
          board={board}
          editable={editable}
          onToggle={(c, on) => onTogglePick({ id: c.id, text: c.text }, on)}
        />
      </div>

      {/* The uncertainties. Default is still open, so this reads as a review rather than a
          selection: the group is marking what the work ANSWERED, which is the shorter list. */}
      {totalUncertainties > 0 && (
        <section className="rounded-[4px] border border-[var(--rule)] px-4 py-3">
          <div className="flex flex-wrap items-baseline gap-2 border-b border-[var(--hairline)] pb-2">
            <h3 className="m-0 text-[14px] font-bold">What is still open</h3>
            <span className="text-[12px] font-bold tabular-nums">
              {openCount} of {totalUncertainties} still open
            </span>
            <span className="text-[11px] italic text-muted">
              From Session 1. Untick the ones these four sessions answered.
            </span>
          </div>
          <div className="mt-2 grid gap-x-6 gap-y-3 md:grid-cols-3">
            {week1Uncertainties.map((b) => (
              <div key={b.key}>
                <h4 className="text-[10px] font-bold uppercase leading-[1.3] tracking-[0.08em] text-muted">
                  {b.bucket}
                </h4>
                <ul className="m-0 mt-1 flex list-none flex-col p-0">
                  {b.answers.map((a) => {
                    const open = isStillOpen(board, a.id);
                    return (
                      <li key={a.id}>
                        <label className="flex cursor-pointer items-start gap-2 rounded-[3px] px-1 py-1.5 text-[13px] leading-[1.45] transition-colors hover:bg-black/[0.03]">
                          <input
                            type="checkbox"
                            checked={open}
                            disabled={!editable}
                            onChange={() => onToggleSettled({ id: a.id, text: a.text }, open)}
                            className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--blue)]"
                          />
                          <span
                            className={
                              "min-w-0 " + (open ? "" : "text-muted line-through decoration-1")
                            }
                          >
                            {a.text}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* The committee line. Its own authored section, on its own `step`, so a facilitator
          can reword it in the program editor like any other block. */}
      {children}

      <Directions
        title="Choosing what they read"
        lines={HANDOFF_DIRECTIONS}
        fold={handoffDirections}
      />
    </div>
  );
}
