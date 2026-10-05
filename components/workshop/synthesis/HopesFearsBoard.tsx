"use client";

import { useMemo, useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import {
  boardChainCards,
  descendantsOf,
  summaryCardCount,
  type HopeFear,
  type SynthesisBoard,
} from "@/lib/synthesis-shape";
import type { SynthesisSummary } from "@/lib/synthesis-summary-shape";
import type { AdminTools } from "@/lib/analysis/implication-cluster-shape";
import { PromptRail, Prompts } from "@/components/workshop/synthesis/PromptRail";
import { CardWall } from "@/components/workshop/synthesis/CardWall";
import { ThemeDeck } from "@/components/workshop/synthesis/ThemeDeck";
import { SummaryPanel } from "@/components/workshop/synthesis/SummaryPanel";
import { ConfirmModal } from "@/components/ConfirmModal";

// STEP 3 — hopes and fears, for the board. Not per theme: having just worked every theme
// through, the group says what it hopes for and what it fears about this future as a
// whole, as many as it can, one idea per card. Two big walls, hopes in lime and fears in
// coral, each with its add slot where the eye lands first.
//
// Above the walls, what the group is writing FROM: the facilitator's summary of steps 1–2
// if there is one, and the themes one card at a time. The co-lead guides' one rule for
// this step is that a hope or fear is a sentence that ends in "because" — one-word hopes
// ("equity", "funding") are the failure mode — so the composer is the sentence to finish
// and the slot carries the question.
//
// A hope written in step 4 (flipped from a fear) is still a hope, so it shows on the hopes
// wall too, marked with where it came from.

export function HopesFearsBoard({
  board,
  editable,
  busy,
  admin,
  summary,
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
  summary: SynthesisSummary | null;
  summarizing: boolean;
  summaryError: string | null;
  onSummarize: () => void;
  onAdd: (kind: HopeFear, text: string) => void;
  onEdit: (card: RippleCard, text: string) => void;
  onDelete: (card: RippleCard) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<RippleCard | null>(null);
  const doomed = pendingDelete ? descendantsOf(board, pendingDelete.id) : [];

  const entries = useMemo(() => boardChainCards(board), [board]);
  const hopes = entries.filter((e) => e.card.cardKind === "hope");
  const fears = entries.filter((e) => e.card.cardKind === "fear");
  const flippedFrom = new Map(entries.map((e) => [e.card.id, e.flippedFrom]));

  return (
    <>
      <PromptRail>
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
      </PromptRail>

      <div className="flex flex-col gap-5">
        <SummaryPanel
          summary={summary}
          admin={admin}
          currentCount={summaryCardCount(board)}
          hasThemes={board.themes.length > 0}
          running={summarizing}
          error={summaryError}
          onGenerate={onSummarize}
        />

        <ThemeDeck board={board} />

        <section className="grid gap-4 lg:grid-cols-2">
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
