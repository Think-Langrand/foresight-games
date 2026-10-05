"use client";

import { useMemo, useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import {
  boardChainCards,
  descendantsOf,
  type HopeFear,
  type SynthesisBoard,
} from "@/lib/synthesis-shape";
import { PromptRail, Prompts } from "@/components/workshop/synthesis/PromptRail";
import { CardWall } from "@/components/workshop/synthesis/CardWall";
import { ConfirmModal } from "@/components/ConfirmModal";

// STEP 3 — hopes and fears, for the board. Not per theme: having just worked every theme
// through, the group says what it hopes for and what it fears about this future as a
// whole, as many as it can, one idea per card. Two big walls, hopes in lime and fears in
// coral, each with its add slot where the eye lands first.
//
// A hope written in step 4 (flipped from a fear) is still a hope, so it shows on the hopes
// wall too, marked with where it came from.

export function HopesFearsBoard({
  board,
  editable,
  busy,
  onAdd,
  onEdit,
  onDelete,
}: {
  board: SynthesisBoard;
  editable: boolean;
  busy: boolean;
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
          lead="About this future as a whole, not one theme. As many as you can — one idea per card."
          questions={[
            { question: "What would it mean to us if this went well?", hint: "A hope." },
            { question: "What would we hate to lose here?", hint: "A fear." },
          ]}
        />
      </PromptRail>

      <section className="grid gap-4 lg:grid-cols-2">
        <CardWall
          tone="hope"
          title="Hopes"
          tall
          cards={hopes.map((e) => e.card)}
          editable={editable}
          busy={busy}
          addLabel="What would it mean to us if this went well?"
          emptyHint="What do we hope for in this future?"
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
          addLabel="What would we hate to lose here?"
          emptyHint="What do we fear in this future?"
          onAdd={(text) => onAdd("fear", text)}
          onEdit={onEdit}
          onRequestDelete={setPendingDelete}
          badgeFor={(c) => (flippedFrom.get(c.id) ? "↩ flipped from a hope" : null)}
        />
      </section>

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
