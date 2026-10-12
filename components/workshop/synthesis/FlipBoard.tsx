"use client";

import type { AddResult } from "@/components/workshop/synthesis/SynthesisCard";
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
import { LeftRail } from "@/components/workshop/synthesis/LeftRail";
import { useRailBand } from "@/components/workshop/synthesis/useRailBand";
import { Directions, DIRECTIONS_FOLD } from "@/components/workshop/synthesis/Directions";
import { makePrefStore } from "@/components/workshop/synthesis/prefStore";
import { HopeFearPair } from "@/components/workshop/synthesis/HopeFearPair";
import { ConfirmModal } from "@/components/ConfirmModal";

// STEP 4 — flip the fears. Every fear from step 3, listed down the page, each one beside a
// face-down hope; writing that hope is the step. A flipped hope is stored as the fear's
// child (see HopeFearPair), which is what lets a row say "flipped" and the hopes wall say
// where a hope came from.
//
// Fears into hopes only. The point of the exercise is to find the hope inside a fear;
// the other direction would be a different exercise.

// Its own fold key, like every step's: this step's directions are not step 3's.
const flipDirections = makePrefStore("synthesis.directions.flip", "open", DIRECTIONS_FOLD);

// What the questions above them do not say: how this surface works. They do not repeat the
// prompts — a rail that says the same thing twice is a rail nobody reads twice.
const FLIP_DIRECTIONS = [
  "Every fear the group wrote is listed below, each beside its other side: a face-down hope.",
  "Writing that hope is the step: click the face-down card, finish the sentence and add it.",
  "Both halves stay live once written, so either one can be edited or deleted afterwards.",
  "A flipped hope joins step 3's hopes wall too, marked with the fear it came from.",
  "The count beside the heading says how many of the board's fears have been flipped.",
] as const;

export function FlipBoard({
  board,
  editable,
  busy,
  onFlip,
  onEdit,
  onDelete,
  onGoToHopes,
  scenarioTitle,
}: {
  board: SynthesisBoard;
  editable: boolean;
  busy: boolean;
  onFlip: (parent: RippleCard, kind: HopeFear, text: string) => AddResult;
  onEdit: (card: RippleCard, text: string) => void;
  onDelete: (card: RippleCard) => void;
  onGoToHopes: () => void;
  // The world the group is working in, as the rail's eyebrow.
  scenarioTitle?: string;
}) {
  const [pendingDelete, setPendingDelete] = useState<RippleCard | null>(null);
  // The board, so the rail's band is as tall as the header beside it — see useRailBand.
  // Set from whichever branch renders, since only one of them is ever mounted.
  const [boardEl, setBoardEl] = useState<HTMLElement | null>(null);
  useRailBand(boardEl);
  const doomed = pendingDelete ? descendantsOf(board, pendingDelete.id) : [];

  const entries = useMemo(() => boardChainCards(board), [board]);
  const fears = entries.filter((e) => e.card.cardKind === "fear");
  const { flipped, total } = flipProgress(board);
  const isFlipped = (fear: RippleCard) => (board.chains.get(fear.id) ?? []).some((c) => c.cardKind === "hope");

  // Step 4 has no themes to pick, and a rail all the same: the band says which step this
  // is and which world it is in, as it does on the other three, and the rail is what holds
  // the page's left gutter so the board does not move as you step into it. What goes under
  // the band is still open — something carried over from step 3, most likely.
  const rail = (
    <LeftRail
      top={
        <>
          {scenarioTitle && <p className="eyebrow mb-1 truncate">{scenarioTitle}</p>}
          <p className="text-[19px] font-extrabold leading-[1.15] tracking-tight">
            4. Turn each fear into the hope inside it
          </p>
        </>
      }
    />
  );

  const prompts = (
    <PromptRail>
      {/* The questions on step 1's lime, directions folded under them — the same two bands
          in the same order as every other step. */}
      <section
        className="-mx-3 -mt-4 border-b border-ink px-3 pb-5 pt-4"
        style={{ background: "color-mix(in srgb, var(--lime) 26%, var(--card))" }}
      >
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
      </section>
      <Directions title="Flipping a fear" lines={FLIP_DIRECTIONS} fold={flipDirections} />
    </PromptRail>
  );

  if (fears.length === 0) {
    return (
      <>
        {rail}
        {prompts}
        <div ref={setBoardEl} className="rounded-[3px] border border-[var(--hairline)] bg-card p-6 text-center">
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
      {rail}
      {prompts}

      <section ref={setBoardEl} className="flex flex-col gap-5">
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

        {/* Every fear, each beside its own hope. The step used to be a gallery of fears,
            one open pair, and a gallery of the hopes made so far — which showed the thing
            the step is actually for exactly once, and put the group's own output in a
            third place. The list IS the work: one row per fear, the hope written in the
            row, and how far the group has got readable by scrolling. */}
        {fears.map((e, i) => {
          const done = isFlipped(e.card);
          return (
            // Keyed by the card, never by the index: each pair holds a composer with a
            // draft in it, and an index key would carry one fear's half-typed hope into
            // another's box when the list above it changes.
            <div key={e.card.id} className="border-t border-black/10 pt-5">
              <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                  Fear {i + 1} of {fears.length}
                </span>
                <span
                  className={
                    "rounded-[2px] border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em] " +
                    (done ? "border-ink bg-lime text-ink" : "border-[var(--rule)] text-muted")
                  }
                >
                  {done ? "✓ Flipped" : "Not flipped yet"}
                </span>
              </div>
              <HopeFearPair
                card={e.card}
                board={board}
                editable={editable}
                busy={busy}
                plain
                onEdit={onEdit}
                onFlip={onFlip}
                onRequestDelete={setPendingDelete}
              />
            </div>
          );
        })}
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
