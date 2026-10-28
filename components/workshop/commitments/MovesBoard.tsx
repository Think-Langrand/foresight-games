"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import {
  DIRECTION_FIELDS,
  DIRECTION_FIELD_PLACEHOLDER,
  DIRECTION_MOVE,
  MAX_DIRECTIONS,
  sharpenCount,
  sharpenFor,
  type CommitmentsBoard,
  type DirectionFieldKey,
} from "@/lib/commitments-shape";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Callout } from "@/components/workshop/commitments/Callout";

// ACT 3.2 — three bold moves, WRITTEN rather than picked.
//
// A move is its own `direction` card. The group writes the move, then answers three
// questions about it (purpose, rationale, requirements), and act 2.2's pool of ideas is in
// the rail as the raw material it always was. See lib/commitments-shape for why a move is
// composed rather than chosen off the wall.
//
// THREE FIXED SLOTS, as the design draws them, and EVERY ONE OF THEM TOGGLES, written or
// not. By default the first empty slot is open as a draft form whose "Save move" creates
// the card and its answered fields in one go; once all three are written, the first move
// still missing a field opens instead. A written move shows its text as its title and
// opens to its four fields. A green check marks a move only once the move and all three
// of its fields are written. A fourth move (reachable by two tabs racing) is listed after
// the slots with a note, not hidden.
//
// DRAFTS LIVE ON THE BOARD COMPONENT, keyed by EMPTY ORDINAL (first empty slot, second
// empty slot), not by slot number and not inside the slot. A shared board changes under
// you: when a teammate saves into the slot you were typing in, that slot becomes a written
// move and the empty slots shift down by one. A draft keyed by ordinal shifts with them,
// so your words reappear in the next empty slot rather than unmounting with the form.
//
// THE MOVE IS THE CARD'S TEXT, not a fourth `sharpen` child. A card with no move is not a
// direction with one field missing, it is nothing, so it is the one field that cannot be
// blank and the one that cannot live in a child.

export type MoveDraft = { move: string } & Partial<Record<DirectionFieldKey, string>>;
export type PendingFields = Partial<Record<DirectionFieldKey, string>>;

// What one "Save move" produced: the card, and any fields whose write failed after the
// move itself landed. Those fields are not lost: the written slot seeds its boxes from
// them and a click away retries the save.
export type AddMoveResult = { card: RippleCard; failed: PendingFields } | null;

const fieldBox =
  "mt-1 w-full resize-y rounded-[3px] border border-[var(--hairline)] bg-paper px-3 py-2 text-[14px] leading-[1.5] outline-none focus:border-ink";

// A green check in a green ring, shown only when a move AND all three of its fields are
// written. Light on purpose: it says "done" and nothing else, and it stays as the group
// goes back and edits.
function DoneMark() {
  return (
    <svg
      aria-label="All four fields written"
      role="img"
      viewBox="0 0 20 20"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="#3f8f1f"
      strokeWidth="1.8"
    >
      <circle cx="10" cy="10" r="8.4" />
      <path d="M6 10.4l2.6 2.6L14.2 7.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The slot's header: the eyebrow "Bold move n", then the move's own words once there are
// any, so a filled slot reads by what it says rather than by its number.
function SlotHeader({
  n,
  title,
  done,
  open,
  meta,
  onToggle,
}: {
  n: number;
  title?: string;
  done: boolean;
  open: boolean;
  meta?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-start gap-3 px-5 py-4 text-left"
    >
      {done && (
        <span className="pt-[3px]">
          <DoneMark />
        </span>
      )}
      <span className="min-w-0 flex-1">
        {/* The number drops to an eyebrow once the move has words of its own; until then it
            is the title, said once. */}
        {title?.trim() && (
          <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-blue">
            Bold move {n}
          </span>
        )}
        <span className="mt-0.5 block text-[20px] font-extrabold leading-[1.2]">
          {title?.trim() || `Bold move ${n}`}
        </span>
        {meta && (
          <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
            {meta}
          </span>
        )}
      </span>
      <span className="shrink-0 pt-1 text-[13px] font-bold text-muted">
        {open ? "⌄ Collapse" : title ? "Open to edit →" : "Open to develop →"}
      </span>
    </button>
  );
}

function FieldLabel({ label, prompt }: { label: string; prompt: string }) {
  return (
    <>
      <span className="block text-[14px] font-bold">{label}</span>
      <span className="block text-[12.5px] leading-[1.4] text-muted">{prompt}</span>
    </>
  );
}

// The three questions that explain a written move.
//
// UNCONTROLLED, SAVING ON BLUR. A controlled textarea on a shared board fights every
// realtime push while someone is mid-sentence. `defaultValue` keyed by the answer's id and
// text means a field re-seeds when the answer changes underneath and otherwise leaves the
// typist alone. Clearing the box deletes the answer: an empty card would count as answered
// everywhere while showing nothing.
//
// `pending` is text the group typed on the draft form whose write failed after the move
// landed. It seeds an otherwise empty box so nothing typed is lost, and because it differs
// from the (absent) stored answer, the next click away saves it.
function SharpenFields({
  direction,
  board,
  editable,
  busy,
  pending,
  onSharpen,
}: {
  direction: RippleCard;
  board: CommitmentsBoard;
  editable: boolean;
  busy: boolean;
  pending?: PendingFields;
  onSharpen: (direction: RippleCard, field: DirectionFieldKey, text: string) => void;
}) {
  return (
    <div className="grid gap-4">
      {DIRECTION_FIELDS.map((f) => {
        const existing = sharpenFor(board, direction.id, f.key);
        const unsaved = !existing[0] && pending?.[f.key];
        return (
          <label key={f.key} className="block min-w-0">
            <FieldLabel label={f.label} prompt={f.prompt} />
            <textarea
              key={(existing[0]?.id ?? "new") + (existing[0]?.text ?? "")}
              defaultValue={existing[0]?.text ?? pending?.[f.key] ?? ""}
              disabled={!editable || busy}
              onBlur={(e) => {
                if (e.target.value.trim() === (existing[0]?.text ?? "").trim()) return;
                onSharpen(direction, f.key, e.target.value);
              }}
              rows={2}
              placeholder={DIRECTION_FIELD_PLACEHOLDER}
              className={fieldBox + (unsaved ? " border-coral" : "")}
            />
            {unsaved && (
              <span className="mt-1 block text-[11px] font-bold text-coral">
                Not saved yet. Click away from the box to try again.
              </span>
            )}
            {/* The database does not hold one-answer-per-field (see DIRECTION_FIELDS), so a
                second answer is SHOWN rather than hidden behind the one being edited. */}
            {existing.length > 1 && (
              <span className="mt-1 block text-[11px] italic text-muted">
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

// A slot holding a written move.
function WrittenMove({
  n,
  direction,
  board,
  open,
  onToggle,
  editable,
  busy,
  pending,
  onEditMove,
  onRequestDelete,
  onSharpen,
}: {
  n: number;
  direction: RippleCard;
  board: CommitmentsBoard;
  open: boolean;
  onToggle: () => void;
  editable: boolean;
  busy: boolean;
  pending?: PendingFields;
  onEditMove: (direction: RippleCard, move: string) => void;
  onRequestDelete: (direction: RippleCard) => void;
  onSharpen: (direction: RippleCard, field: DirectionFieldKey, text: string) => void;
}) {
  const answered = sharpenCount(board, direction.id);
  const done = answered === DIRECTION_FIELDS.length;
  return (
    <section
      className={
        "overflow-hidden rounded-[4px] border bg-card " +
        (open ? "border-2 border-ink" : "border-[var(--hairline)]")
      }
    >
      <SlotHeader
        n={n}
        title={direction.text}
        done={done}
        open={open}
        meta={`${answered} of ${DIRECTION_FIELDS.length} explained`}
        onToggle={onToggle}
      />
      {open && (
        <div className="flex flex-col gap-4 border-t border-[var(--hairline)] px-5 py-4">
          <label className="block">
            <FieldLabel label={DIRECTION_MOVE.label} prompt={DIRECTION_MOVE.prompt} />
            {/* A MOVE CANNOT BE BLANKED: the card IS its move. Emptying the box puts the
                text back rather than silently dropping the write. Delete is how a move goes. */}
            <textarea
              key={direction.id + direction.text}
              defaultValue={direction.text}
              disabled={!editable || busy}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t === direction.text) return;
                if (!t) {
                  e.target.value = direction.text;
                  return;
                }
                onEditMove(direction, t);
              }}
              rows={2}
              placeholder={DIRECTION_MOVE.placeholder}
              className={fieldBox + " font-bold"}
            />
          </label>
          <SharpenFields
            direction={direction}
            board={board}
            editable={editable}
            busy={busy}
            pending={pending}
            onSharpen={onSharpen}
          />
          {editable && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] italic text-muted">Fields save when you click away.</span>
              <button
                type="button"
                onClick={() => onRequestDelete(direction)}
                className="text-[12px] text-muted underline hover:text-coral"
              >
                Delete this move
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// An empty slot: the draft form when open, "Open to develop" when shut. The draft itself
// is the parent's, keyed by empty ordinal (see the header), so this is a plain view of it.
function EmptyMove({
  n,
  open,
  onToggle,
  busy,
  draft,
  onChange,
  onSave,
}: {
  n: number;
  open: boolean;
  onToggle: () => void;
  busy: boolean;
  draft: MoveDraft;
  onChange: (next: MoveDraft) => void;
  onSave: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const set = (k: keyof MoveDraft, v: string) => onChange({ ...draft, [k]: v });
  const submit = async () => {
    if (!draft.move.trim() || saving) return;
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };
  return (
    <section
      className={
        "overflow-hidden rounded-[4px] border bg-card " +
        (open ? "border-2 border-ink" : "border-[var(--hairline)] hover:border-ink")
      }
    >
      <SlotHeader n={n} title={draft.move} done={false} open={open} onToggle={onToggle} />
      {open && (
        <div className="flex flex-col gap-4 border-t border-[var(--hairline)] px-5 py-4">
          <label className="block">
            <FieldLabel label={DIRECTION_MOVE.label} prompt={DIRECTION_MOVE.prompt} />
            <textarea
              value={draft.move}
              onChange={(e) => set("move", e.target.value)}
              disabled={busy || saving}
              rows={2}
              placeholder={DIRECTION_MOVE.placeholder}
              className={fieldBox + " font-bold"}
            />
          </label>
          {DIRECTION_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <FieldLabel label={f.label} prompt={f.prompt} />
              <textarea
                value={draft[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                disabled={busy || saving}
                rows={2}
                placeholder={DIRECTION_FIELD_PLACEHOLDER}
                className={fieldBox}
              />
            </label>
          ))}
          <div>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || saving || !draft.move.trim()}
              className="rounded-[3px] border border-ink bg-lime px-5 py-2 text-[13px] font-bold hover:bg-lime-deep disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save move"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

const EMPTY_DRAFT: MoveDraft = { move: "" };

export function MovesBoard({
  board,
  vision,
  editable,
  busy,
  onAdd,
  onEditMove,
  onDelete,
  onSharpen,
  onGoToVision,
}: {
  board: CommitmentsBoard;
  // 3.1's saved statement, read back above the moves. Null when none is saved yet.
  vision: string | null;
  editable: boolean;
  busy: boolean;
  // Creates the move and every answered field. Resolves to the card and any fields whose
  // write failed, or null when the move itself did not land (the draft is then kept).
  onAdd: (move: string, fields: PendingFields) => Promise<AddMoveResult>;
  onEditMove: (direction: RippleCard, move: string) => void;
  onDelete: (direction: RippleCard) => void;
  onSharpen: (direction: RippleCard, field: DirectionFieldKey, text: string) => void;
  onGoToVision: () => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<RippleCard | null>(null);
  // Drafts by empty ordinal, and failed field writes by card id. See the header.
  const [drafts, setDrafts] = useState<Record<number, MoveDraft>>({});
  const [pendingFields, setPendingFields] = useState<Record<string, PendingFields>>({});
  // Which slot is open. Null means "the default": the first empty slot, else the first
  // written move still missing a field, else the first. Clicking a slot pins it; -1 pins
  // everything shut.
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const written = board.directions.slice(0, MAX_DIRECTIONS);
  const overflow = board.directions.slice(MAX_DIRECTIONS);
  const defaultOpen = (() => {
    if (written.length < MAX_DIRECTIONS) return written.length;
    const unfinished = written.findIndex(
      (d) => sharpenCount(board, d.id) < DIRECTION_FIELDS.length
    );
    return unfinished === -1 ? 0 : unfinished;
  })();
  const open = openSlot ?? defaultOpen;

  const saveDraft = async (ordinal: number, slotIndex: number) => {
    const d = drafts[ordinal] ?? EMPTY_DRAFT;
    const { move, ...fields } = d;
    const res = await onAdd(move.trim(), fields);
    if (!res) return; // the move did not land: keep the draft where it is
    // The move is in slot `slotIndex` now and the empty slots have shifted: drop this
    // ordinal and move every later draft down one so each stays with its words.
    setDrafts((prev) => {
      const next: Record<number, MoveDraft> = {};
      for (const [k, v] of Object.entries(prev)) {
        const i = Number(k);
        if (i < ordinal) next[i] = v;
        else if (i > ordinal) next[i - 1] = v;
      }
      return next;
    });
    if (Object.keys(res.failed).length > 0) {
      setPendingFields((p) => ({ ...p, [res.card.id]: res.failed }));
      setOpenSlot(slotIndex); // show the group the box that still needs a click away
    }
  };

  // Which empty ordinal each slot is (the k-th empty slot reads drafts[k], whatever slot
  // number it happens to be); -1 for a written slot. A plain loop, because the rendering
  // callbacks below must not mutate anything.
  const ordinalBySlot: number[] = [];
  for (let i = 0, k = 0; i < MAX_DIRECTIONS; i++) ordinalBySlot.push(written[i] ? -1 : k++);

  return (
    <div className="flex flex-col gap-5">
      <Callout label="Our vision · From vision">
        {vision ? (
          <p className="m-0 whitespace-pre-line">{vision}</p>
        ) : (
          <p className="m-0 italic text-muted">
            No vision saved yet.{" "}
            <button
              type="button"
              onClick={onGoToVision}
              className="font-bold not-italic text-blue hover:underline"
            >
              Write it on 3.1 →
            </button>
          </p>
        )}
      </Callout>

      {/* KEYED BY SLOT NUMBER, not by card id: a slot is a fixed place on the page, and
          re-keying it when a card lands would unmount whatever was in it. */}
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {Array.from({ length: MAX_DIRECTIONS }, (_, i) => {
          const d = written[i];
          if (d) {
            return (
              <li key={i}>
                <WrittenMove
                  n={i + 1}
                  direction={d}
                  board={board}
                  open={open === i}
                  onToggle={() => setOpenSlot(open === i ? -1 : i)}
                  editable={editable}
                  busy={busy}
                  pending={pendingFields[d.id]}
                  onEditMove={onEditMove}
                  onRequestDelete={setPendingDelete}
                  onSharpen={onSharpen}
                />
              </li>
            );
          }
          const ordinal = ordinalBySlot[i];
          return (
            <li key={i}>
              {editable ? (
                <EmptyMove
                  n={i + 1}
                  open={open === i}
                  onToggle={() => setOpenSlot(open === i ? -1 : i)}
                  busy={busy}
                  draft={drafts[ordinal] ?? EMPTY_DRAFT}
                  onChange={(next) => setDrafts((p) => ({ ...p, [ordinal]: next }))}
                  onSave={() => saveDraft(ordinal, i)}
                />
              ) : (
                <div className="rounded-[4px] border border-dashed border-[var(--hairline)] px-5 py-4 text-[14px] italic text-muted">
                  Bold move {i + 1}: not written yet.
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Only reachable by two people saving a third move at the same moment. Reported, not
          hidden: the group decides which one goes. */}
      {overflow.length > 0 && (
        <section className="rounded-[3px] border border-coral/60 bg-coral/10 px-5 py-4">
          <p className="m-0 text-[13px] font-bold text-coral">
            {overflow.length} more than {MAX_DIRECTIONS}. Delete the ones you would not defend.
          </p>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
            {overflow.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-3 text-[13.5px]">
                <span className="min-w-0">{d.text}</span>
                {editable && (
                  <button
                    type="button"
                    onClick={() => setPendingDelete(d)}
                    className="shrink-0 text-[11px] text-muted underline hover:text-coral"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="m-0 text-[12.5px] italic leading-[1.45] text-muted">
        A bold move can combine ideas from several priorities. Complete the same four fields
        for each move.
      </p>

      <ConfirmModal
        open={pendingDelete !== null}
        title="Delete this bold move?"
        message={
          <>
            <span className="block">{pendingDelete?.text}</span>
            {pendingDelete && sharpenCount(board, pendingDelete.id) > 0 && (
              <span className="mt-2 block font-bold">
                This takes {sharpenCount(board, pendingDelete.id)} answered question
                {sharpenCount(board, pendingDelete.id) === 1 ? "" : "s"} with it.
              </span>
            )}
          </>
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
