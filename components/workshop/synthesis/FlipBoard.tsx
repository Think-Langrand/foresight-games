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

// Its own fold key, like every step's: this step's directions are not step 3's.
const flipDirections = makePrefStore("synthesis.directions.flip", "open", DIRECTIONS_FOLD);

// What the questions above them do not say: how this surface works. They do not repeat the
// prompts — a rail that says the same thing twice is a rail nobody reads twice.
const FLIP_DIRECTIONS = [
  "Pick a fear from the gallery below. It opens beside its other side, a face-down hope.",
  "Writing that hope is the step: finish the sentence on the face-down card and add it.",
  "Both halves stay live once written, so either one can be edited or deleted afterwards.",
  "A flipped hope joins step 3's hopes wall too, marked with the fear it came from.",
  "The count beside the heading says how many of the board's fears have been flipped.",
] as const;

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
  scenarioTitle,
}: {
  board: SynthesisBoard;
  editable: boolean;
  busy: boolean;
  // Which fear is open. Owned by the view so leaving and returning keeps your place.
  focusId: string | null;
  onFocus: (id: string | null) => void;
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
  // Derived, never synced: a deleted card falls back to the first rather than to nothing.
  const focused = fears.find((e) => e.card.id === focusId)?.card ?? fears[0]?.card ?? null;
  // Every hope written on this step. The pair above shows one at a time, so without this
  // the step's own output is invisible while you do it: you flip a fear, the card goes
  // quiet, and the only place the hope turns up is step 3.
  const flips = entries.filter((e) => e.card.cardKind === "hope" && e.flippedFrom);

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

        {/* The hopes this step has made, as the same cards as the fears above it — the
            gallery's green hope face, not a summary list. Clicking one goes back to the
            fear it came from, which is where it can be edited: one card, one place to
            type into. */}
        <div className="border-t border-black/10 pt-5">
          <HopeFearGallery
            entries={flips}
            selectedId={flips.find((e) => e.flippedFrom?.id === focused?.id)?.card.id ?? null}
            editable={editable}
            busy={busy}
            heading="Hopes flipped so far"
            lead={
              flips.length > 0
                ? "Click one to go back to the fear it came from."
                : "The hopes you write above collect here."
            }
            addKinds={[]}
            status={null}
            onSelect={(c) => {
              const from = flips.find((e) => e.card.id === c.id)?.flippedFrom;
              if (from) onFocus(from.id);
            }}
            onRequestDelete={setPendingDelete}
            onQuickAdd={() => {}}
          />
        </div>
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
