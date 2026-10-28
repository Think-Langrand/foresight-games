"use client";

import { useMemo, useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import type { Scenario } from "@/lib/foresight/types";
import { FigureImage } from "@/components/foresight/FigureImage";
import { isUnnamedTheme, themeLabel, type SynthesisBoard } from "@/lib/synthesis-shape";
import { StakeList, type StakeGroup } from "@/components/workshop/synthesis/StakeList";
import { TONE } from "@/components/workshop/synthesis/CardWall";
import { Dot } from "@/components/workshop/synthesis/ThemeRail";
import { splitKeyChange } from "@/lib/group-summary";
import { Eyebrow } from "@/components/workshop/commitments/StarterQuestions";

// The right rail on five of the six activities: the scenario, then the group's own earlier
// work, read back beside the step that builds on it.
//
// READ-ONLY REFERENCE. Nothing here is editable and nothing is seeded onto this week's
// board: these are Sessions 2 and 3's own cards, read server-side from the boards the group
// already worked, so there is only ever one copy of them. Editing a hope happens in
// Session 3, where it was written.
//
// THE SCENARIO SITS ON TOP and is never folded: the week asks the group to judge things
// about this world, and the world was three sessions ago. Everything under it is shut by
// default, each fold carrying its count, because four sessions' work open at once is not a
// rail, it is a wall.

// A hope or fear with its flip underneath, which is the pair Session 3's step 4 produced
// and the thing worth re-reading: the same facts said twice, once as a loss and once as a
// want.
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

export function Fold({
  label,
  count,
  defaultOpen = false,
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <div className="border-t border-[var(--hairline)] py-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-2 text-left"
      >
        <span aria-hidden className="w-2 shrink-0 text-[12px] text-muted">
          {open ? "⌄" : "›"}
        </span>
        <span className="text-[13.5px] font-bold">
          {label} <span className="font-mono text-[10px] font-normal tabular-nums text-muted">{count}</span>
        </span>
      </button>
      {open && <div className="mt-2 pl-4">{children}</div>}
    </div>
  );
}

// The world the whole week is judging: the first scenario image and the overview the group
// has been reading since Session 1.
function ScenarioContext({
  scenario,
  onOpenScenario,
}: {
  scenario: Scenario;
  onOpenScenario?: () => void;
}) {
  const hero = [...scenario.images]
    .filter((im) => im.url)
    .sort((a, b) => a.position - b.position)[0];
  const paragraphs = (scenario.teaser ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-3">
      {hero && <FigureImage image={hero} alt={scenario.title} ratio="aspect-[16/9]" />}
      <div>
        <h3 className="m-0 text-[16px] font-extrabold leading-[1.25]">
          Scenario · {scenario.title}
        </h3>
        {paragraphs.length > 0 && (
          <div className="mt-2 flex flex-col gap-2.5">
            {paragraphs.map((para, i) => (
              <p key={i} className="m-0 text-[13px] leading-[1.55]">
                {para}
              </p>
            ))}
          </div>
        )}
        {onOpenScenario && (
          <button
            type="button"
            onClick={onOpenScenario}
            className="mt-3 text-[13.5px] font-bold text-blue underline-offset-2 hover:underline"
          >
            Open full scenario ↗
          </button>
        )}
      </div>
    </div>
  );
}

export function ReferenceRail({
  board,
  week2Cards = [],
  scenario,
  onOpenScenario,
}: {
  // Session 3's board, indexed ONCE by the view and shared with the matrix: three
  // components used to each index the same cards on every render.
  board: SynthesisBoard;
  // Session 2's board. Only its ROOTS are used, the key changes.
  week2Cards?: RippleCard[];
  scenario?: Scenario | null;
  // Swaps the board for the full scenario panel. The parent owns that toggle.
  onOpenScenario?: () => void;
}) {
  const hopesFears = board.hopesFears;

  const keyChanges = useMemo(
    () =>
      week2Cards
        .filter((c) => c.order === "FIRST")
        .map((c) => ({ id: c.id, ...splitKeyChange(c.text) })),
    [week2Cards]
  );

  const { riskGroups, oppGroups, riskTotal, oppTotal, implicationTotal } = useMemo(() => {
    const label = (t: RippleCard) => (isUnnamedTheme(t) ? themeLabel(board, t) : t.text);
    const groups = (map: Map<string, RippleCard[]>): StakeGroup[] =>
      board.themes.map((t) => ({ id: t.id, label: label(t), cards: map.get(t.id) ?? [] }));
    const total = (map: Map<string, RippleCard[]>) => [...map.values()].flat().length;
    return {
      riskGroups: groups(board.risks),
      oppGroups: groups(board.opportunities),
      riskTotal: total(board.risks),
      oppTotal: total(board.opportunities),
      implicationTotal: total(board.clusters),
    };
  }, [board]);

  const nothingEarlier =
    hopesFears.length === 0 &&
    riskTotal === 0 &&
    oppTotal === 0 &&
    keyChanges.length === 0 &&
    board.themes.length === 0;

  return (
    <aside
      className="flex flex-col gap-4 rounded-[3px] border border-[var(--hairline)] px-5 py-4"
      style={{ background: "rgba(39,93,226,0.05)" }}
    >
      <div>
        <Eyebrow>Reference</Eyebrow>
        <p className="m-0 mt-1 text-[13px] leading-[1.5] text-muted">
          Review your earlier work to aid the discussion.
        </p>
      </div>

      {scenario && <ScenarioContext scenario={scenario} onOpenScenario={onOpenScenario} />}

      <div className="border-t border-ink pt-3">
        <Eyebrow>Your earlier work</Eyebrow>
        {nothingEarlier ? (
          <p className="m-0 mt-2 text-[13px] italic text-muted">
            Nothing from the earlier sessions to read back here yet.
          </p>
        ) : (
          <div className="mt-1">
            <Fold label="Key changes · Session 2" count={keyChanges.length}>
              <ul className="m-0 flex list-none flex-col p-0">
                {keyChanges.map((k) => (
                  <li
                    key={k.id}
                    className="border-b border-black/10 py-2 text-[13px] leading-[1.45] last:border-b-0"
                  >
                    {k.label && (
                      <span className="mr-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] text-blue">
                        {k.label}
                      </span>
                    )}
                    <span>{k.body}</span>
                  </li>
                ))}
              </ul>
            </Fold>

            <Fold label="Themes and implications · Session 3" count={board.themes.length}>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {board.themes.map((t) => {
                  const under = board.clusters.get(t.id) ?? [];
                  return (
                    <li key={t.id} className="text-[13px] leading-[1.45]">
                      <span className="font-bold">
                        {isUnnamedTheme(t) ? themeLabel(board, t) : t.text}
                      </span>
                      {under.length > 0 && (
                        <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0 pl-2">
                          {under.map((c) => (
                            <li key={c.id} className="flex items-start gap-2 text-ink/80">
                              <Dot />
                              <span className="min-w-0">{c.text}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
              {implicationTotal === 0 && (
                <p className="m-0 mt-1 text-[12px] italic text-muted">
                  No implications were clustered under the themes.
                </p>
              )}
            </Fold>

            <Fold label="Risks and opportunities · Session 3" count={riskTotal + oppTotal}>
              <div className="flex flex-col gap-3">
                {riskTotal > 0 && (
                  <StakeList
                    tone="risk"
                    title="Risks"
                    groups={riskGroups}
                    emptyHint="Nothing on this theme."
                  />
                )}
                {oppTotal > 0 && (
                  <StakeList
                    tone="opportunity"
                    title="Opportunities"
                    groups={oppGroups}
                    emptyHint="Nothing on this theme."
                  />
                )}
              </div>
            </Fold>

            <Fold label="Hopes and fears · Session 3" count={hopesFears.length}>
              <ul className="m-0 list-none p-0">
                {hopesFears.map((c) => (
                  <Pair key={c.id} card={c} flips={board.chains.get(c.id) ?? []} />
                ))}
              </ul>
            </Fold>
          </div>
        )}
      </div>
    </aside>
  );
}
