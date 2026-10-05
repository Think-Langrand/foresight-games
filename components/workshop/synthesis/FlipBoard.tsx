"use client";

import { useMemo, useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import {
  boardChainCards,
  descendantsOf,
  flipProgress,
  type HopeFear,
  type SynthesisBoard,
} from "@/lib/synthesis-shape";
import { PromptRail, Prompts } from "@/components/workshop/synthesis/PromptRail";
import { HopeFearGallery } from "@/components/workshop/synthesis/HopeFearGallery";
import { HopeFearPair } from "@/components/workshop/synthesis/HopeFearPair";
import { ConfirmModal } from "@/components/ConfirmModal";

// STEP 4 — flip the fears. The board's fears from step 3, laid out to pick from; the one
// picked sits beside a face-down hope, and writing that hope is the step. A flipped hope
// is stored as the fear's child (see HopeFearPair), which is what lets the gallery say
// "flipped" and the hopes wall say where a hope came from.
//
// Fears into hopes only. The point of the exercise is to find the hope inside a fear;
// the other direction would be a different exercise.

export function FlipBoard({
  board,
  editable,
  busy,
  focusId,
  onFocus,
  onFlip,
  onEdit,
  onDelete,
  onGoToHopes,
}: {
  board: SynthesisBoard;
  editable: boolean;
  busy: boolean;
  // Which fear is open. Owned by the view so leaving and returning keeps your place.
  focusId: string | null;
  onFocus: (id: string | null) => void;
  onFlip: (parent: RippleCard, kind: HopeFear, text: string) => void;
  onEdit: (card: RippleCard, text: string) => void;
  onDelete: (card: RippleCard) => void;
  onGoToHopes: () => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<RippleCard | null>(null);
  const doomed = pendingDelete ? descendantsOf(board, pendingDelete.id) : [];

  const fears = useMemo(() => boardChainCards(board).filter((e) => e.card.cardKind === "fear"), [board]);
  const { flipped, total } = flipProgress(board);
  const isFlipped = (fear: RippleCard) => (board.chains.get(fear.id) ?? []).some((c) => c.cardKind === "hope");
  // Derived, never synced: a deleted card falls back to the first rather than to nothing.
  const focused = fears.find((e) => e.card.id === focusId)?.card ?? fears[0]?.card ?? null;

  const prompts = (
    <PromptRail>
      <Prompts
        heading="Flip the fears"
        lead="Same facts, said as a hope."
        questions={[
          { question: "What was the fear protecting?", hint: "That value is the hope's because." },
          {
            question: "Was our way of working the only way to get it?",
            hint: "Staffing it ourselves was one way, not the only way.",
          },
          { question: "A flip is a hope, not a plan.", hint: "Say what people would experience, not the fix." },
          {
            question: "Keep both on the board.",
            hint: "The fear and the hope are two honest readings of the same facts. The tension is the finding.",
          },
        ]}
      />
    </PromptRail>
  );

  if (fears.length === 0) {
    return (
      <>
        {prompts}
        <div className="rounded-[3px] border border-[var(--hairline)] bg-card p-6 text-center">
          <p className="text-[14px] font-bold">No fears yet.</p>
          <p className="mx-auto mt-1 max-w-[50ch] text-[13px] text-muted">
            This step flips the fears the group wrote in the last one.
          </p>
          <button
            onClick={onGoToHopes}
            className="mt-3 rounded-[2px] border border-ink bg-lime px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep"
          >
            ← Go to Hopes &amp; fears
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {prompts}

      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[20px] font-extrabold uppercase leading-[1.1] tracking-tight">Flip the fears</h2>
          <span
            className={
              "rounded-[2px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] " +
              (total > 0 && flipped === total ? "border-ink bg-lime text-ink" : "border-[var(--rule)] text-muted")
            }
          >
            {flipped} of {total} fear{total === 1 ? "" : "s"} flipped
          </span>
        </div>

        <HopeFearGallery
          entries={fears}
          selectedId={focused?.id ?? null}
          editable={editable}
          busy={busy}
          heading="The board’s fears"
          lead="Pick one to flip it below."
          addKinds={[]}
          status={({ card }) =>
            isFlipped(card) ? { label: "✓ Flipped", done: true } : { label: "Not flipped yet", done: false }
          }
          onSelect={(c) => onFocus(c.id)}
          onRequestDelete={setPendingDelete}
          onQuickAdd={() => {}}
        />

        {focused && (
          <div className="border-t border-black/10 pt-5">
            <HopeFearPair
              key={focused.id}
              card={focused}
              board={board}
              editable={editable}
              busy={busy}
              plain
              onEdit={onEdit}
              onFlip={onFlip}
              onRequestDelete={setPendingDelete}
            />
          </div>
        )}
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
