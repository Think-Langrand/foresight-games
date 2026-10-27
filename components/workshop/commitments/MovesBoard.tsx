"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import {
  DIRECTION_FIELDS,
  DIRECTION_MOVE,
  MAX_DIRECTIONS,
  sharpenCount,
  sharpenFor,
  type CommitmentsBoard,
  type DirectionFieldKey,
} from "@/lib/commitments-shape";
import { Directions, DIRECTIONS_FOLD } from "@/components/workshop/synthesis/Directions";
import { makePrefStore } from "@/components/workshop/synthesis/prefStore";
import { ConfirmModal } from "@/components/ConfirmModal";
import { StepIntro } from "@/components/workshop/commitments/StepIntro";

// ACT 6 — three directions, WRITTEN rather than picked.
//
// AN EARLIER SHAPE MADE THIS A DOWN-SELECT: tick three cards off act 4's wall and answer
// three questions about each. It read fine on an empty board and badly on a finished one —
// nothing on the handoff said where the three had come from or why those three, because
// nobody had written that down. The wall was the menu, so the recommendation was never
// composed, only chosen.
//
// A direction is its own card now. The group writes the move, then answers three questions
// about it, and act 4's wall is in the rail as the raw material it always was. That is also
// why there is no cap enforcement beyond the composer closing: an over-write is a thing to
// tell the group about, not a thing to make impossible.
//
// THE MOVE IS THE CARD'S TEXT, not a fourth `sharpen` child. It is the thing the direction
// IS — a card with no move is not a direction with one field missing, it is nothing — so it
// is the one field you cannot leave blank and the one that cannot live in a child.

const movesDirections = makePrefStore("commitments.directions.moves", "open", DIRECTIONS_FOLD);

// The activity's discussion prompts, as guidance. The output is the three cards.
const MOVES_DIRECTIONS = [
  `Write up to ${MAX_DIRECTIONS}. If everything is bold, nothing is.`,
  "Which three would contribute most to your vision? Do they work together, or does one undo another?",
  "Draw on your response wall, but do not just copy it. A direction is the recommendation you would defend, in your own words.",
  "Answer all three questions on each. If nobody can say what a move is for, it is not ready.",
  "Test: if you pursued only these three moves, would you make meaningful progress toward your vision?",
];

// The three questions that sharpen one direction.
//
// UNCONTROLLED, SAVING ON BLUR. A controlled textarea on a shared board fights every
// realtime push while someone is mid-sentence, and these are short paragraphs rather than a
// word. `defaultValue` keyed by the card's id means a field re-seeds when the answer changes
// underneath and otherwise leaves the typist alone. Clearing the box deletes the answer — an
// empty card would count as answered everywhere while showing nothing.
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
    <div className="grid gap-4 border-t border-ink/15 px-4 py-4 sm:grid-cols-3">
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
            {/* The database does not hold one-answer-per-field (see DIRECTION_FIELDS), so a
                second answer is SHOWN rather than hidden behind the one being edited. */}
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
  onAdd,
  onEditMove,
  onDelete,
  onSharpen,
}: {
  board: CommitmentsBoard;
  editable: boolean;
  busy: boolean;
  onAdd: (move: string) => void;
  onEditMove: (direction: RippleCard, move: string) => void;
  onDelete: (direction: RippleCard) => void;
  onSharpen: (direction: RippleCard, field: DirectionFieldKey, text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<RippleCard | null>(null);
  const written = board.directions.length;
  const atCap = written >= MAX_DIRECTIONS;
  const over = written > MAX_DIRECTIONS;

  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    onAdd(t);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-5">
      <StepIntro
        n="06"
        title="Select and sharpen three directions"
        // THE FOUR QUESTIONS BESIDE THE PROSE, not buried in it. A group should be able to
        // see the shape of a direction before it writes one — four questions is a form, and
        // a form read as a paragraph is a form nobody holds in their head. They are also
        // the exact labels the composer below asks under, so the header is a key to it.
        aside={
          <dl className="m-0 grid gap-2.5">
            {[DIRECTION_MOVE, ...DIRECTION_FIELDS].map((f) => (
              <div key={f.label}>
                <dt className="m-0 font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-blue">
                  {f.label}
                </dt>
                <dd className="m-0 text-[12.5px] italic leading-[1.4] text-muted">
                  {f.prompt}
                </dd>
              </div>
            ))}
          </dl>
        }
      >
        <p className="m-0">
          What are three directions the field of public health should take to achieve the
          vision, and why do they matter?
        </p>
        <p className="m-0">
          Which three moves would make the greatest contribution to achieving this vision? Do
          they work together? What would change? What would need to be in place, or done
          differently from today, for each move to work?
        </p>
        <p className="m-0 font-bold">
          Test: if we pursued only these three moves, would we make meaningful progress
          toward our vision?
        </p>
      </StepIntro>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-2 border-ink pb-2">
        <span className="text-[14px] font-bold">
          {written} of {MAX_DIRECTIONS} written
        </span>
        <span className="text-[12px] italic text-muted">
          {over
            ? `That is ${written - MAX_DIRECTIONS} more than ${MAX_DIRECTIONS}. Delete the ones you would not defend.`
            : atCap
              ? "Delete one to make room for another."
              : `Write ${MAX_DIRECTIONS - written} more.`}
        </span>
      </div>

      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {board.directions.map((d, i) => (
          <li
            key={d.id}
            className="overflow-hidden rounded-[4px] border-2 border-ink"
            // A --blue wash, the colour this week already uses for its own accents (the
            // field labels, the step numbers). It does two jobs: three directions read as
            // three objects rather than one long form, and every input inside them keeps
            // `bg-paper`, so a box you can type in is the one thing on the card that is
            // NOT tinted. Light, because this is a card you read and write in rather than
            // a panel you glance at — HandoffGuideLocked's heavier 13% is sized for the
            // latter and would fight the text here.
            style={{ background: "rgba(39,93,226,0.07)" }}
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <span className="pt-[3px] font-mono text-[12px] font-bold tabular-nums text-blue">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <span className="mb-1 block font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-blue">
                  {DIRECTION_MOVE.label}
                </span>
                <span className="mb-1 block text-[11.5px] italic leading-[1.35] text-muted">
                  {DIRECTION_MOVE.prompt}
                </span>
                {/* Same uncontrolled-on-blur handling as the fields below, and for the same
                    reason: this is a shared board and someone may be mid-sentence. */}
                <textarea
                  key={d.id}
                  defaultValue={d.text}
                  disabled={!editable || busy}
                  onBlur={(e) => {
                    const t = e.target.value.trim();
                    if (!t || t === d.text) return;
                    onEditMove(d, t);
                  }}
                  rows={2}
                  className="w-full rounded-[3px] border border-[var(--rule)] bg-paper px-2 py-1.5 text-[13.5px] font-bold leading-[1.45]"
                />
                <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                  {sharpenCount(board, d.id)} of {DIRECTION_FIELDS.length} questions answered
                </span>
              </div>
              {editable && (
                <button
                  type="button"
                  onClick={() => setPending(d)}
                  className="shrink-0 text-[11px] text-muted underline hover:text-coral"
                >
                  Delete
                </button>
              )}
            </div>
            <SharpenFields
              direction={d}
              board={board}
              editable={editable}
              busy={busy}
              onSharpen={onSharpen}
            />
          </li>
        ))}
      </ol>

      {/* The composer closes at the cap rather than refusing on submit: a box you can type
          into and then be told no is worse than one that is not there. */}
      {editable && !atCap && (
        <div className="rounded-[4px] border-2 border-dashed border-[var(--rule)] px-4 py-3">
          <label className="block">
            <span className="mb-1 block font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-blue">
              {DIRECTION_MOVE.label}
            </span>
            <span className="mb-1.5 block text-[11.5px] italic leading-[1.35] text-muted">
              {DIRECTION_MOVE.prompt} Write one, then answer the three questions about it.
            </span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
              rows={2}
              placeholder="One move. Who does what…"
              className="w-full rounded-[3px] border border-[var(--rule)] bg-paper px-2 py-1.5 text-[13.5px] leading-[1.45]"
            />
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !draft.trim()}
            className="mt-2 rounded-[3px] bg-ink px-4 py-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-paper disabled:opacity-40"
          >
            Add direction
          </button>
        </div>
      )}

      <Directions
        title="Writing three directions"
        lines={MOVES_DIRECTIONS}
        fold={movesDirections}
      />

      <ConfirmModal
        open={pending !== null}
        title="Delete this direction?"
        message={
          <>
            <span className="block">{pending?.text}</span>
            {pending && sharpenCount(board, pending.id) > 0 && (
              <span className="mt-2 block font-bold">
                This takes {sharpenCount(board, pending.id)} answered question
                {sharpenCount(board, pending.id) === 1 ? "" : "s"} with it.
              </span>
            )}
          </>
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (pending) onDelete(pending);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
