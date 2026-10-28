"use client";

import { useState } from "react";
import { CARD_TEXT_MAX, type RippleCard } from "@/lib/ripples-types";
import { ConfirmModal } from "@/components/ConfirmModal";

// One box for one statement: the vision, the overlook note, how the three moves work
// together. Each is an authored worksheet section underneath (so the admin viewer, the CSV
// and the deck read it with no special case), but the activity asks for ONE answer the
// group agrees on rather than a list, so this edits the section's first card in place.
//
// EXPLICIT SAVE, not save-on-blur. The screenshot design puts a Save button under each of
// these, and two of the three sit beside fields that DO save on blur (a bold move's
// explanations), so the one rule per box has to be the one the button says.
//
// EXTRAS ARE SHOWN, NOT HIDDEN. The database does not hold one-answer-per-section, and an
// admin can add a second card through the editor. A second answer under the box, with its
// own delete, beats a card nobody can see or remove.
export function SingleAnswer({
  label,
  help,
  placeholder,
  card,
  extras = [],
  editable,
  busy,
  rows = 5,
  saveLabel = "Save",
  onSave,
  onDelete,
}: {
  label: string;
  help?: string;
  placeholder: string;
  // The first answer on the section, if any. Keyed on id AND text so a teammate's edit
  // re-seeds the box, while a box someone is typing in keeps its draft via `dirty`.
  card: RippleCard | undefined;
  extras?: RippleCard[];
  editable: boolean;
  busy: boolean;
  rows?: number;
  saveLabel?: string;
  onSave: (text: string) => void;
  onDelete?: (card: RippleCard) => void;
}) {
  const stored = card?.text ?? "";
  const [draft, setDraft] = useState(stored);
  const [seed, setSeed] = useState(stored);
  const [pendingClear, setPendingClear] = useState(false);
  // Adjusted during render, the way React asks for state that follows a prop: when the
  // stored text changes under an UNDIRTY box, take it. A dirty box keeps its draft.
  if (seed !== stored) {
    setSeed(stored);
    if (draft === seed) setDraft(stored);
  }
  const dirty = draft.trim() !== stored.trim();
  const over = draft.trim().length > CARD_TEXT_MAX;

  const save = () => {
    const t = draft.trim();
    if (over) return;
    if (!t) {
      if (card && onDelete) setPendingClear(true);
      return;
    }
    if (t !== stored.trim()) onSave(t);
  };

  return (
    <section>
      <h3 className="m-0 text-[18px] font-extrabold leading-[1.25]">{label}</h3>
      {help && <p className="m-0 mt-1 text-[13px] leading-[1.5] text-muted">{help}</p>}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        readOnly={!editable}
        disabled={busy}
        rows={rows}
        placeholder={placeholder}
        className="mt-3 w-full resize-y rounded-[3px] border border-[var(--hairline)] bg-paper px-4 py-3 text-[14.5px] leading-[1.55] outline-none focus:border-ink"
      />
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        {editable && (
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty || over}
            className="rounded-[3px] border border-ink bg-lime px-5 py-2 text-[13px] font-bold hover:bg-lime-deep disabled:opacity-40"
          >
            {saveLabel}
          </button>
        )}
        <span className={"font-mono text-[10px] " + (over ? "font-bold text-coral" : "text-muted")}>
          {draft.trim().length}/{CARD_TEXT_MAX}
        </span>
        {dirty && !over && (
          <span className="text-[11.5px] italic text-muted">Unsaved.</span>
        )}
      </div>
      {extras.length > 0 && (
        <ul className="m-0 mt-3 list-none border-t border-[var(--hairline)] p-0 pt-2">
          {extras.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-3 py-1.5 text-[13px] leading-[1.45]"
            >
              <span className="min-w-0">
                <span className="mr-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                  also
                </span>
                {c.text}
              </span>
              {editable && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(c)}
                  className="shrink-0 text-[11px] text-muted underline hover:text-coral"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmModal
        open={pendingClear}
        title="Clear this?"
        message="The box is empty. Saving it empty deletes what was stored."
        confirmLabel="Delete"
        busy={busy}
        onConfirm={() => {
          setPendingClear(false);
          if (card) onDelete?.(card);
        }}
        onCancel={() => setPendingClear(false)}
      />
    </section>
  );
}
