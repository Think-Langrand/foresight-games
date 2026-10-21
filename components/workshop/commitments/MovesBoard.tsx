"use client";

import type { RippleCard } from "@/lib/ripples-types";
import type { WorksheetSection } from "@/lib/exercise-types";
import { MAX_BOLD_MOVES, type CommitmentsBoard } from "@/lib/commitments-shape";
import { Directions, DIRECTIONS_FOLD } from "@/components/workshop/synthesis/Directions";
import { makePrefStore } from "@/components/workshop/synthesis/prefStore";
import { AspirationRecap } from "@/components/workshop/commitments/AspirationRecap";

// STEP 3 — the bold moves. Choosing is the work: the wall from step 2 is the option space,
// and this step is the group saying which three it would actually stand behind.
//
// A BOLD MOVE IS A RESPONSE CARRYING `shortlisted`. There is no second card and no rank
// column — see lib/commitments-shape's header. That means a tick here is a real write, not
// transient client state: it survives a reload, every member of the group sees it, and
// step 4 reads it straight off the same cards.
//
// The cap is enforced HERE and not by the database. Counting server-side would be a
// read-then-write race on a board several people work at once, so the copy says "up to
// three" and the shape reports a fourth rather than hiding it (boldMoveProgress). An
// over-pick is a thing to tell the group about, not a thing to make impossible.

const movesDirections = makePrefStore("commitments.directions.moves", "open", DIRECTIONS_FOLD);

const MOVES_DIRECTIONS = [
  `Pick up to ${MAX_BOLD_MOVES}. If everything is bold, nothing is.`,
  "Choose the ones that would change what your group actually does, not the ones that are easiest to agree on.",
  "You can sharpen the wording of a move on step 2; the card is the same card.",
  "Nothing is lost by un-picking. The move goes back to the wall and keeps any milestones you gave it.",
];

export function MovesBoard({
  board,
  sections,
  cards,
  editable,
  onToggle,
  onGoToAspiration,
  onGoToResponses,
}: {
  board: CommitmentsBoard;
  sections: WorksheetSection[];
  cards: RippleCard[];
  editable: boolean;
  // No `busy`: this step has no composer, and gating the ticks on a board-wide flag is
  // exactly the bug the comment below describes.
  onToggle: (card: RippleCard, shortlisted: boolean) => void;
  onGoToAspiration: () => void;
  onGoToResponses: () => void;
}) {
  const picked = board.boldMoves.length;
  const atCap = picked >= MAX_BOLD_MOVES;
  const over = picked > MAX_BOLD_MOVES;

  if (board.responses.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <AspirationRecap sections={sections} cards={cards} onGoToAspiration={onGoToAspiration} />
        <div className="rounded-[4px] border border-dashed border-[var(--rule)] px-5 py-6 text-center">
          <p className="m-0 text-[14px] font-bold">Nothing to choose between yet.</p>
          <p className="m-0 mt-1 text-[13px] text-muted">
            Open the option space first, then come back and pick {MAX_BOLD_MOVES}.
          </p>
          <button
            type="button"
            onClick={onGoToResponses}
            className="mt-3 text-[13px] text-blue underline hover:no-underline"
          >
            &larr; Go to Strategic responses
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <AspirationRecap sections={sections} cards={cards} onGoToAspiration={onGoToAspiration} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {/* The count is the step's whole state, so it sits above the list and stays
              there rather than floating over it: this list is short enough to see at
              once, and a bar that covers the last card is worse than a heading. */}
          <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-2 border-ink bg-paper px-1 py-2">
            <span className="text-[14px] font-bold">
              {picked} of {MAX_BOLD_MOVES} chosen
            </span>
            <span className="text-[12px] italic text-muted">
              {over
                ? `That is ${picked - MAX_BOLD_MOVES} more than ${MAX_BOLD_MOVES}. Un-pick the ones you would not defend.`
                : atCap
                  ? "Un-pick one to swap it for another."
                  : `Pick the ${MAX_BOLD_MOVES - picked === 1 ? "one" : MAX_BOLD_MOVES - picked} you would stand behind.`}
            </span>
          </div>

          <ul className="m-0 list-none p-0">
            {board.responses.map((c) => {
              const on = c.shortlisted;
              // At the cap the unpicked go genuinely disabled rather than silently
              // no-op'ing on click: a tick that does nothing reads as a bug.
              const locked = !on && atCap;
              return (
                <li key={c.id} className="border-b border-[var(--hairline)] last:border-b-0">
                  <label
                    className={
                      "flex cursor-pointer items-start gap-3 py-3 pl-2 pr-3 transition-colors " +
                      (on ? "bg-blue/10" : locked ? "opacity-45" : "hover:bg-black/[0.03]") +
                      (locked ? " cursor-not-allowed" : "")
                    }
                  >
                    {/* NOT disabled on `busy`. That flag is board-wide, so gating the
                        ticks on it disabled every checkbox for the length of each write
                        and a group ticking three moves in a row lost the second and third
                        clicks silently. The optimistic overlay shows a tick at once and
                        `run` surfaces a refusal as the flash, so there is nothing to wait
                        for; the cap below reads the same overlay, so it is enforced from
                        the first click rather than from the round trip. */}
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!editable || locked}
                      onChange={() => onToggle(c, !on)}
                      className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--blue)]"
                    />
                    <span className="min-w-0">
                      <span
                        className={
                          "block max-w-[76ch] text-[14px] leading-[1.45] " + (on ? "font-bold" : "")
                        }
                      >
                        {c.text}
                      </span>
                      {on && (
                        <span className="mt-1 block font-mono text-[9.5px] font-bold uppercase tracking-[0.1em] text-blue">
                          ★ a bold move
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <Directions
            title="Choosing three"
            lines={MOVES_DIRECTIONS}
            fold={movesDirections}
            first
          />
        </div>
      </div>
    </div>
  );
}
