"use client";

import type { AddResult } from "@/components/workshop/synthesis/SynthesisCard";
import { useEffect, useMemo, useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import {
  boardChainCards,
  descendantsOf,
  exploreProgress,
  summaryCardCount,
  themeLabel,
  type HopeFear,
  type SynthesisBoard,
} from "@/lib/synthesis-shape";
import type { SynthesisSummary } from "@/lib/synthesis-summary-shape";
import type { AdminTools } from "@/lib/analysis/implication-cluster-shape";
import { PromptRail, Prompts } from "@/components/workshop/synthesis/PromptRail";
import { useRailBand } from "@/components/workshop/synthesis/useRailBand";
import { Directions, DIRECTIONS_FOLD } from "@/components/workshop/synthesis/Directions";
import { makePrefStore } from "@/components/workshop/synthesis/prefStore";
import { CardWall } from "@/components/workshop/synthesis/CardWall";
import { StakeList, type StakeGroup } from "@/components/workshop/synthesis/StakeList";
import { ThemeRail } from "@/components/workshop/synthesis/ThemeRail";
import { SummaryPanel } from "@/components/workshop/synthesis/SummaryPanel";
import { ConfirmModal } from "@/components/ConfirmModal";

// STEP 3 — hopes and fears, for the board. Not per theme: having just worked every theme
// through, the group says what it hopes for and what it fears about this future as a
// whole, as many as it can, one idea per card. Two big walls, hopes in lime and fears in
// coral, each with its add slot where the eye lands first.
//
// Under the walls, what the group is writing FROM: every risk and every opportunity step 2
// produced, in two columns grouped by theme, and then the facilitator's summary. The
// co-lead guides' one rule for this step is that a hope or fear is a sentence that ends in
// "because" — one-word hopes ("equity", "funding") are the failure mode — so the composer
// is the sentence to finish and the slot carries the question.
//
// A hope written in step 4 (flipped from a fear) is still a hope, so it shows on the hopes
// wall too, marked with where it came from.

// Its own fold key, like every step's: finishing with step 1's canvas help should not fold
// away how step 3 works.
const hopesDirections = makePrefStore("synthesis.directions.hopes", "open", DIRECTIONS_FOLD);

// How this surface works, which is what the questions above them do not say. They do not
// restate the prompts: a rail that says the same thing twice is a rail nobody reads twice.
const HOPES_DIRECTIONS = [
  "This step is the whole future, not one theme — write as many hopes and fears as the group has.",
  "One idea per card. The slot at the top of each wall is where you write; the rest scrolls under it.",
  "Below the walls are every risk and every opportunity the group wrote in step 2, grouped by theme.",
  "Click a theme on the left to jump to its risks and opportunities.",
] as const;

export function HopesFearsBoard({
  board,
  editable,
  busy,
  admin,
  scenarioTitle,
  summary,
  summaryHash,
  summarizing,
  summaryError,
  onSummarize,
  onAdd,
  onEdit,
  onDelete,
}: {
  board: SynthesisBoard;
  editable: boolean;
  busy: boolean;
  admin?: AdminTools;
  // The world the group is working in, as the rail's eyebrow.
  scenarioTitle?: string;
  summary: SynthesisSummary | null;
  // summaryInputHash of the live board, for "the board has changed since this was written".
  summaryHash: string;
  summarizing: boolean;
  summaryError: string | null;
  onSummarize: () => void;
  onAdd: (kind: HopeFear, text: string) => AddResult;
  onEdit: (card: RippleCard, text: string) => void;
  onDelete: (card: RippleCard) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<RippleCard | null>(null);
  // Which theme the deck is showing. Up here because the rail picks it too — one piece of
  // state, two pickers, so they can never disagree about which theme is open.
  const [themeId, setThemeId] = useState<string | null>(null);
  // The walls, so the rail's band is as tall as the header stack beside them and the rule
  // it ends in continues across the board — see useRailBand.
  const [boardEl, setBoardEl] = useState<HTMLElement | null>(null);
  useRailBand(boardEl);
  const doomed = pendingDelete ? descendantsOf(board, pendingDelete.id) : [];

  const entries = useMemo(() => boardChainCards(board), [board]);
  const hopes = entries.filter((e) => e.card.cardKind === "hope");
  const fears = entries.filter((e) => e.card.cardKind === "fear");
  const flippedFrom = new Map(entries.map((e) => [e.card.id, e.flippedFrom]));

  // One run per theme, in board order, for each of the two columns below the walls. Every
  // theme appears in both, with or without cards — the columns are an inventory of what the
  // group worked, and a theme that wrote no risks is itself worth seeing.
  const stakeGroups = (kind: "risk" | "opportunity"): StakeGroup[] =>
    board.themes.map((t) => ({
      id: t.id,
      label: themeLabel(board, t),
      cards: (kind === "risk" ? board.risks : board.opportunities).get(t.id) ?? [],
    }));

  // The rail picks a theme by scrolling to it rather than by swapping what is on screen:
  // everything is on screen now, so picking is a question of where to look.
  //
  // The RISK column is what we scroll to, and the opportunity column is left where it
  // falls. The two columns scroll as one page, so a theme with four risks and one
  // opportunity does not line up across them; `activeId` lights the theme's run in both,
  // which is what actually answers "where is it" once you are in the neighbourhood.
  useEffect(() => {
    if (!themeId) return;
    document
      .getElementById(`stakes-risk-${themeId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [themeId]);

  return (
    <>
      {/* The same rail as every theme step. Step 3 is the board's, not a theme's, so a
          square SCROLLS to that theme in the columns below rather than deciding what is on
          screen — every theme is down there — and its glyph is steps 1–2's, because that is
          what there is to write a hope or a fear off. Hidden below lg like always, where
          the columns are simply read straight through.

          Mounted even with no themes to pick: the band at its top is the step itself, and
          the rail is what holds the page's left gutter. */}
      <ThemeRail
        board={board}
        activeId={themeId}
        onPick={setThemeId}
        progressFor={(t) => exploreProgress(board, t.id)}
        progressLabel="Exploration"
        // Naming carries through from steps 1–2: the rail is the same rail, and a group
        // that renames a theme here sees it in both columns under it.
        onRename={editable ? (t, text) => onEdit(t, text) : undefined}
        hint={
          board.themes.length > 0
            ? "Click a theme to jump to its risks and opportunities below."
            : "No themes yet — they are made in step 1."
        }
        top={
          <>
            {scenarioTitle && <p className="eyebrow mb-1 truncate">{scenarioTitle}</p>}
            <p className="text-[19px] font-extrabold leading-[1.15] tracking-tight">
              3. Say what the group hopes for, and fears, in this future
            </p>
          </>
        }
      />

      <PromptRail>
        {/* The questions on step 1's lime, with the directions folded under them — the
            same two bands in the same order on every step, so the rail reads the same way
            whichever one you are on. */}
        <section
          className="-mx-3 -mt-4 border-b border-ink px-3 pb-5 pt-4"
          style={{ background: "color-mix(in srgb, var(--lime) 26%, var(--card))" }}
        >
          <Prompts
            heading="Hopes & fears"
            lead="Inside this world — not a wish for today. Say each one as a sentence that ends in because."
            questions={[
              { question: "Hope: what are we aspiring to, and who would it serve?", hint: "We hope ___ because ___." },
              {
                question: "Fear: who or what are we protecting, and what could be lost?",
                hint: "We fear ___ because ___.",
              },
              {
                question: "Why does that outcome matter to us?",
                hint: "A funding explanation says how it could happen. The because says why it matters.",
              },
              {
                question: "Name who gets what.",
                hint: "“Equity”, “trust”, “funding” are labels. Who does what differently, and who gains or loses?",
              },
            ]}
          />
        </section>
        <Directions title="Writing hopes and fears" lines={HOPES_DIRECTIONS} fold={hopesDirections} />
      </PromptRail>

      <div className="flex flex-col gap-5">
        {/* The walls first: this step is the writing, and what is under them is what it
            is written FROM — the themes, then the facilitator's summary of them. They used
            to sit above it, so a group opening step 3 met two things to read before
            anything to do. */}
        <section ref={setBoardEl} className="grid gap-4 lg:grid-cols-2">
          <CardWall
            tone="hope"
            title="Hopes"
            tall
            cards={hopes.map((e) => e.card)}
            editable={editable}
            busy={busy}
            slotQuestion="What are we aspiring to, and who would it serve?"
            addLabel="We hope … because …"
            emptyHint="What would we welcome in this future — and for whom?"
            onAdd={(text) => onAdd("hope", text)}
            onEdit={onEdit}
            onRequestDelete={setPendingDelete}
            badgeFor={(c) => (flippedFrom.get(c.id) ? "↩ flipped from a fear" : null)}
          />
          <CardWall
            tone="fear"
            title="Fears"
            tall
            cards={fears.map((e) => e.card)}
            editable={editable}
            busy={busy}
            slotQuestion="Who or what are we protecting, and what could be lost?"
            addLabel="We fear … because …"
            emptyHint="What would we dread losing in this future — and for whom?"
            onAdd={(text) => onAdd("fear", text)}
            onEdit={onEdit}
            onRequestDelete={setPendingDelete}
            badgeFor={(c) => (flippedFrom.get(c.id) ? "↩ flipped from a hope" : null)}
          />
        </section>

        {/* What step 2 produced, all of it, as the cards the group wrote it on. Two
            columns, one per kind, each grouped by theme: a hope or a fear is about the
            whole future, so what it is written from is the whole board's risks and the
            whole board's opportunities — read down one column at a time — rather than one
            theme at a time with both kinds beside it, which is step 2's own shape.

            It used to be a carousel of one theme. A group had to turn it to find out
            whether it had already said something, which is the one job this block has. */}
        {board.themes.length > 0 && (
          <section className="grid gap-4 lg:grid-cols-2">
            <StakeList
              tone="risk"
              title="Risks, by theme"
              groups={stakeGroups("risk")}
              activeId={themeId}
              emptyHint="None written in step 2."
            />
            <StakeList
              tone="opportunity"
              title="Opportunities, by theme"
              groups={stakeGroups("opportunity")}
              activeId={themeId}
              emptyHint="None written in step 2."
            />
          </section>
        )}

        <SummaryPanel
          summary={summary}
          admin={admin}
          currentCount={summaryCardCount(board)}
          currentHash={summaryHash}
          hasThemes={board.themes.length > 0}
          running={summarizing}
          error={summaryError}
          onGenerate={onSummarize}
        />
      </div>

      <ConfirmModal
        open={pendingDelete !== null}
        title={`Delete this ${pendingDelete?.cardKind ?? "card"}?`}
        busy={busy}
        confirmLabel="Delete"
        message={
          doomed.length === 0 ? (
            <>This can&rsquo;t be undone.</>
          ) : (
            <>
              This also deletes{" "}
              <strong className="text-ink">
                {doomed.length} card{doomed.length === 1 ? "" : "s"}
              </strong>{" "}
              flipped from it. This can&rsquo;t be undone.
            </>
          )
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const card = pendingDelete;
          setPendingDelete(null);
          if (card) onDelete(card);
        }}
      />
    </>
  );
}
