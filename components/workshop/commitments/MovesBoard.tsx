"use client";

import type { RippleCard } from "@/lib/ripples-types";
import {
  DIRECTION_FIELDS,
  MAX_BOLD_MOVES,
  sharpenCount,
  sharpenFor,
  strandedSharpening,
  type CommitmentsBoard,
  type DirectionFieldKey,
} from "@/lib/commitments-shape";
import { Directions, DIRECTIONS_FOLD } from "@/components/workshop/synthesis/Directions";
import { makePrefStore } from "@/components/workshop/synthesis/prefStore";

// ACT 6 — select and sharpen three directions. Two halves, and the order matters: the wall
// from act 4 is the option space, the group says which three it would stand behind, and
// then it answers three questions about each.
//
// A DIRECTION IS A RESPONSE CARRYING `shortlisted`. There is no second card and no rank
// column — see lib/commitments-shape's header. That means a tick here is a real write, not
// transient client state: it survives a reload and every member of the group sees it.
//
// THE MOVE IS THE RESPONSE'S OWN TEXT, which is why only three fields are composed here
// rather than four. "What should change?" was answered on the wall; editing it is editing
// the response, which happens on act 4 where it was written.
//
// SHARPENING SURVIVES UN-CHOOSING. The three answers are children of the response, so
// un-ticking a direction strands them rather than deleting them and re-ticking brings them
// back whole. That is reported rather than left to be discovered — see the stranded note.
//
// The cap is enforced HERE and not by the database. Counting server-side would be a
// read-then-write race on a board several people work at once, so the copy says "up to
// three" and the shape reports a fourth rather than hiding it. An over-pick is a thing to
// tell the group about, not a thing to make impossible.

const movesDirections = makePrefStore("commitments.directions.moves", "open", DIRECTIONS_FOLD);

// The activity's discussion prompts, as guidance. The group's answer is the three it
// chooses and what it writes about them, not a paragraph typed under a heading.
const MOVES_DIRECTIONS = [
  `Pick up to ${MAX_BOLD_MOVES}. If everything is bold, nothing is.`,
  "Which three would contribute most to your vision? Do they work together, or does one undo another?",
  "Choose the ones that would change what your group actually does, not the ones that are easiest to agree on.",
  "Then answer the three questions on each. If nobody can say what a move is for, it is not ready.",
  "Test: if you did only these three, would you get anywhere near your vision?",
  "You can reword a move on step 4; the card is the same card.",
  "Nothing is lost by un-picking. The move goes back to the wall and keeps what you wrote about it.",
];

// The three questions that sharpen one chosen direction.
//
// UNCONTROLLED, SAVING ON BLUR. A controlled textarea on a shared board fights every
// realtime push while someone is mid-sentence, and these are short paragraphs rather than
// a word. `defaultValue` keyed by the card's id means a field re-seeds when the direction
// changes and otherwise leaves the typist alone. Clearing the box deletes the answer —
// an empty card would count as answered everywhere while showing nothing.
function SharpenFields({
  direction,
  board,
  editable,
  busy,
  onSharpen,
}: {
  direction: RippleCard;
  board: CommitmentsBoard;
  editable: boolean;
  busy: boolean;
  onSharpen: (direction: RippleCard, field: DirectionFieldKey, text: string) => void;
}) {
  return (
    <div className="grid gap-4 border-t border-[var(--hairline)] bg-blue/[0.04] px-3 py-4 pl-10 sm:grid-cols-3">
      {DIRECTION_FIELDS.map((f) => {
        const existing = sharpenFor(board, direction.id, f.key);
        return (
          <label key={f.key} className="flex min-w-0 flex-col gap-1">
            <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-blue">
              {f.label}
            </span>
            <span className="text-[11.5px] italic leading-[1.35] text-muted">{f.prompt}</span>
            <textarea
              key={existing[0]?.id ?? "new"}
              defaultValue={existing[0]?.text ?? ""}
              disabled={!editable || busy}
              onBlur={(e) => {
                if (e.target.value.trim() === (existing[0]?.text ?? "")) return;
                onSharpen(direction, f.key, e.target.value);
              }}
              rows={3}
              className="mt-0.5 w-full rounded-[3px] border border-[var(--rule)] bg-paper px-2 py-1.5 text-[12.5px] leading-[1.45]"
            />
            {/* The database does not hold one-answer-per-field (see DIRECTION_FIELDS), so
                a second answer is SHOWN rather than hidden behind the one being edited. */}
            {existing.length > 1 && (
              <span className="text-[11px] italic text-muted">
                {existing.length - 1} other answer{existing.length > 2 ? "s" : ""} on this
                field: {existing.slice(1).map((c) => c.text).join(" · ")}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

export function MovesBoard({
  board,
  editable,
  busy,
  onToggle,
  onSharpen,
  onGoToResponses,
}: {
  board: CommitmentsBoard;
  editable: boolean;
  // Passed for the FIELDS only. The ticks below are deliberately not gated on it — see the
  // note at the checkbox.
  busy: boolean;
  onToggle: (card: RippleCard, shortlisted: boolean) => void;
  onSharpen: (direction: RippleCard, field: DirectionFieldKey, text: string) => void;
  onGoToResponses: () => void;
}) {
  const picked = board.boldMoves.length;
  const stranded = strandedSharpening(board);
  const atCap = picked >= MAX_BOLD_MOVES;
  const over = picked > MAX_BOLD_MOVES;

  if (board.responses.length === 0) {
    return (
      <div className="flex flex-col gap-5">
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
                          ★ a direction &middot; {sharpenCount(board, c.id)} of{" "}
                          {DIRECTION_FIELDS.length} answered
                        </span>
                      )}
                    </span>
                  </label>
                  {/* THE FIELDS SIT UNDER THE MOVE THEY SHARPEN, not on a tab of their
                      own. The questions are about THIS direction and are meaningless
                      apart from it, and a group reading them in a separate list would
                      have to hold the move in its head while answering. */}
                  {on && (
                    <SharpenFields
                      direction={c}
                      board={board}
                      editable={editable}
                      busy={busy}
                      onSharpen={onSharpen}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          {/* "Where did what I wrote go?" answered before it is asked. Un-choosing a
              direction leaves its three answers intact under the response, so this says
              so rather than letting the group find out by re-choosing. */}
          {stranded.length > 0 && (
            <p className="m-0 rounded-[3px] border-l-[3px] border-blue bg-blue/10 px-3 py-2 text-[12.5px] leading-[1.45]">
              {stranded.length} answer{stranded.length === 1 ? "" : "s"} you wrote about a
              move you have since un-picked.{" "}
              <span className="italic text-muted">
                Pick it again and they come back.
              </span>
            </p>
          )}
          <Directions
            title="Choosing three, then sharpening them"
            lines={MOVES_DIRECTIONS}
            fold={movesDirections}
            first
          />
        </div>
      </div>
    </div>
  );
}
