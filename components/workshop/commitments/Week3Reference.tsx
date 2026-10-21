"use client";

import { useMemo, useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import type { Scenario } from "@/lib/foresight/types";
import { FigureImage } from "@/components/foresight/FigureImage";
import {
  indexSynthesisBoard,
  isUnnamedTheme,
  themeLabel,
} from "@/lib/synthesis-shape";
import { StakeList, type StakeGroup } from "@/components/workshop/synthesis/StakeList";
import { TONE } from "@/components/workshop/synthesis/CardWall";
import { Dot } from "@/components/workshop/synthesis/ThemeRail";

// Session 3, read back on Session 4. The group spent a whole session naming what this
// world puts at stake; this is that work in a quieter shape, beside the step that uses it.
//
// REFERENCE, NOT MATERIAL. Nothing here is editable and nothing is seeded onto this week's
// board: these are Session 3's own cards, read server-side from the board the group
// already worked, so there is only ever one copy of them. Editing a hope happens in
// Session 3, where it was written.
//
// Built from indexSynthesisBoard over the raw Session 3 cards, so it needs no shaping code
// of its own and cannot disagree with how Session 3 itself reads the board.
//
// THE SCENARIO SITS ON TOP, and everything below it is shut. The week asks the group to
// judge things about this world, and the world was two sessions ago: the scenario image and
// its overview are the context every step needs, where Session 3's own cards are what you
// reach for once you have a reason to. Shut by default is not "less important", it is the
// rail admitting that a wall of four sessions' work open at once is not readable. Each fold
// carries its count, so a shut one still says how much is behind it.

// A hope or fear with its flip underneath, which is the pair Session 3's step 4 produced
// and the thing worth re-reading: the same facts said twice, once as a loss and once as a
// want. Every group flipped every fear it wrote, so this is the richest input the week has.
function Pair({ card, flips }: { card: RippleCard; flips: RippleCard[] }) {
  const isFear = card.cardKind === "fear";
  const t = TONE[isFear ? "fear" : "hope"];
  return (
    <li className="border-b border-black/10 py-2 last:border-b-0">
      <div className="flex items-start gap-2">
        <span
          className={
            "mt-[1px] shrink-0 rounded-[2px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] " +
            t.chip
          }
        >
          {isFear ? "Fear" : "Hope"}
        </span>
        <span className="min-w-0 text-[13px] leading-[1.45]">{card.text}</span>
      </div>
      {flips.map((f) => (
        <div key={f.id} className="mt-1.5 flex items-start gap-2 pl-4">
          <span className="mt-[3px] shrink-0 text-[10px] text-muted" aria-hidden>
            &#8627;
          </span>
          <span className="min-w-0 text-[13px] italic leading-[1.45] text-ink/80">{f.text}</span>
        </div>
      ))}
    </li>
  );
}

function Fold({
  label,
  count,
  note,
  children,
}: {
  label: string;
  count: number;
  // A second fact worth seeing while shut, like how many fears were flipped.
  note?: string;
  children: React.ReactNode;
}) {
  // Open by default would bury the step under Session 3. Shut by default would let a group
  // forget it is there, so the count rides the summary line: a closed fold still says how
  // much is behind it.
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="border-t border-[var(--rule)] pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-2 text-left"
      >
        <span aria-hidden className="font-mono text-[10px] text-muted">
          {open ? "−" : "+"}
        </span>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em]">
          {label} <span className="tabular-nums text-muted">{count}</span>
          {note && (
            <span className="ml-2 font-normal normal-case tracking-normal text-muted">{note}</span>
          )}
        </span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

// The world the whole week is judging, at the top of the rail: the first scenario image and
// the overview the group has been reading since Session 1. Not a fold — this is the one
// thing that should never need a click, and it is why the rail is wide.
function ScenarioContext({ scenario }: { scenario: Scenario }) {
  // Ordered by `position`, which real data numbers from 2, so first-by-position rather
  // than images[0]. Same rule ScenarioReader uses for its hero.
  const hero = [...scenario.images]
    .filter((im) => im.url)
    .sort((a, b) => a.position - b.position)[0];
  const paragraphs = (scenario.teaser ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!hero && paragraphs.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <FigureImage image={hero} alt={scenario.title} ratio="aspect-[16/9]" />
      <div>
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          {scenario.title}
        </div>
        {paragraphs.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-2">
            {paragraphs.map((para, i) => (
              <p key={i} className="m-0 text-[13px] leading-[1.5]">
                {para}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Week3Reference({
  cards,
  scenario,
}: {
  cards: RippleCard[];
  scenario?: Scenario | null;
}) {
  const board = useMemo(() => indexSynthesisBoard(cards), [cards]);

  const hopesFears = board.hopesFears;
  const flipCount = [...board.chains.values()].flat().length;

  // Risks and opportunities, grouped under the theme each was written on. Session 3's own
  // step 3 shows them exactly this way.
  const { riskGroups, oppGroups, riskTotal, oppTotal } = useMemo(() => {
    const label = (t: RippleCard) => (isUnnamedTheme(t) ? themeLabel(board, t) : t.text);
    const groups = (map: Map<string, RippleCard[]>): StakeGroup[] =>
      board.themes.map((t) => ({ id: t.id, label: label(t), cards: map.get(t.id) ?? [] }));
    const total = (map: Map<string, RippleCard[]>) => [...map.values()].flat().length;
    return {
      riskGroups: groups(board.risks),
      oppGroups: groups(board.opportunities),
      riskTotal: total(board.risks),
      oppTotal: total(board.opportunities),
    };
  }, [board]);

  // A group with no Session 3 work still gets the scenario, which is the half of this rail
  // that does not depend on them having done anything.
  if (hopesFears.length === 0 && riskTotal === 0 && oppTotal === 0) {
    return (
      <aside className="flex flex-col gap-3 rounded-[4px] border border-[var(--rule)] px-4 py-3">
        {scenario && <ScenarioContext scenario={scenario} />}
        <p className="m-0 border-t border-[var(--rule)] pt-2 text-[13px] italic text-muted">
          Nothing from Session 3 to read back here yet.
        </p>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col gap-3 rounded-[4px] border border-[var(--rule)] px-4 py-3">
      {scenario && <ScenarioContext scenario={scenario} />}

      <div className={scenario ? "border-t border-[var(--rule)] pt-3" : undefined}>
        <h3 className="m-0 text-[13px] font-bold">What you said in Session 3</h3>
        <p className="m-0 mt-0.5 text-[12px] italic leading-[1.45] text-muted">
          Your own words, for reference. Open what you need; nothing here changes.
        </p>
      </div>

      {/* A fold like the other three. It used to be open, which made the rail start with
          every hope and fear the group ever wrote and buried the folds under it. */}
      <Fold
        label="Hopes &amp; fears"
        count={hopesFears.length}
        note={flipCount > 0 ? `with ${flipCount} ${flipCount === 1 ? "flip" : "flips"}` : undefined}
      >
        <ul className="m-0 list-none p-0">
          {hopesFears.map((c) => (
            <Pair key={c.id} card={c} flips={board.chains.get(c.id) ?? []} />
          ))}
        </ul>
      </Fold>

      <Fold label="Risks" count={riskTotal}>
        <StakeList
          tone="risk"
          title="Risks"
          groups={riskGroups}
          emptyHint="Nothing on this theme."
        />
      </Fold>
      <Fold label="Opportunities" count={oppTotal}>
        <StakeList
          tone="opportunity"
          title="Opportunities"
          groups={oppGroups}
          emptyHint="Nothing on this theme."
        />
      </Fold>

      {board.themes.length > 0 && (
        <Fold label="Themes" count={board.themes.length}>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {board.themes.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-[13px] leading-[1.45]">
                <Dot />
                <span className="min-w-0">
                  {isUnnamedTheme(t) ? themeLabel(board, t) : t.text}
                </span>
              </li>
            ))}
          </ul>
        </Fold>
      )}
    </aside>
  );
}
