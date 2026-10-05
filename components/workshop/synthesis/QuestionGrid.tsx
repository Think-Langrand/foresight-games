"use client";

import { useEffect, useRef, useState } from "react";
import { CARD_TEXT_MAX, type RippleCard } from "@/lib/ripples-types";

// A set of questions as a grid of boxes. Each box carries its question and a circle that
// fills once it has an answer; clicking a box turns that box — only that box — into the
// place to write, so the others stay in view as the thing you are answering against.
//
// This is how every step of the week asks its questions. The answers are ordinary cards of
// the question's kind, which is why the grid never writes: it asks its caller to answer,
// edit or delete, and the caller knows which card that is.

export interface QuestionField<K extends string> {
  key: K;
  question: string;
  hint: string;
  accent: string; // a border-l-* class
}

export function QuestionGrid<K extends string>({
  title,
  lead,
  fields,
  answers,
  editable,
  busy,
  readOnly = false,
  onAnswer,
  onEdit,
  onDelete,
  columns = 2,
  framed = true,
}: {
  title: string;
  lead?: React.ReactNode;
  fields: readonly QuestionField<K>[];
  answers: Partial<Record<K, RippleCard>>;
  editable: boolean;
  busy: boolean;
  // Later steps show earlier answers for context; there the boxes read rather than invite.
  readOnly?: boolean;
  // A first answer to a question. Later saves edit the answer's card.
  onAnswer: (key: K, text: string) => void;
  onEdit: (card: RippleCard, text: string) => void;
  // Saving an empty answer removes its card rather than leaving a blank one.
  onDelete: (card: RippleCard) => void;
  columns?: 1 | 2;
  // The dashed-top padded block most sheets use; false when the caller frames it.
  framed?: boolean;
}) {
  const canEdit = editable && !readOnly;
  const [open, setOpen] = useState<K | null>(null);
  const answered = fields.filter((f) => (answers[f.key]?.text ?? "").trim().length > 0).length;

  return (
    <div className={framed ? "border-t-2 border-dashed border-black/15 px-5 py-4" : ""}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">{title}</h3>
        <span className="text-[11px] italic text-muted">
          {answered} of {fields.length} answered
          {canEdit && answered < fields.length && " · click a question to answer it"}
        </span>
      </div>
      {lead && <div className="mt-2">{lead}</div>}

      <div className={"mt-3 grid gap-3 " + (columns === 2 ? "sm:grid-cols-2" : "")}>
        {fields.map((f) => {
          const existing = answers[f.key];
          const text = existing?.text.trim() ?? "";
          const has = text.length > 0;
          if (open === f.key && canEdit) {
            return (
              <AnswerEditor
                key={f.key}
                question={f.question}
                hint={f.hint}
                accent={f.accent}
                initial={existing?.text ?? ""}
                busy={busy}
                onSave={(next) => {
                  const t = next.trim();
                  if (existing) {
                    if (t && t !== existing.text) onEdit(existing, t);
                    else if (!t) onDelete(existing);
                  } else if (t) {
                    onAnswer(f.key, t);
                  }
                  setOpen(null);
                }}
                onCancel={() => setOpen(null)}
              />
            );
          }
          const box =
            "flex w-full flex-col rounded-[3px] border border-black/15 border-l-4 bg-paper p-3 text-left " +
            f.accent +
            (canEdit ? " cursor-pointer hover:border-ink hover:border-l-ink" : "");
          const body = (
            <>
              <div className="flex items-start gap-2">
                <span
                  aria-hidden
                  className={
                    "mt-[3px] text-[12px] leading-none " +
                    (has ? "text-[var(--lime-deep)]" : "text-black/30")
                  }
                >
                  {has ? "●" : "○"}
                </span>
                <span className="text-[13.5px] font-bold leading-[1.35]">{f.question}</span>
              </div>
              {has ? (
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.5]">{text}</p>
              ) : (
                <p className="mt-2 text-[12px] italic leading-[1.4] text-muted">
                  {readOnly ? "Not answered yet." : f.hint}
                </p>
              )}
            </>
          );
          return canEdit ? (
            <button
              key={f.key}
              onClick={() => setOpen(f.key)}
              aria-label={`${has ? "Edit the answer to" : "Answer"}: ${f.question}`}
              className={box}
            >
              {body}
            </button>
          ) : (
            <div key={f.key} className={box}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// One box in its writing state. Enter saves, Shift+Enter breaks a line, Escape puts the
// box back without saving — the same keys InlineText uses, so the week has one grammar.
function AnswerEditor({
  question,
  hint,
  accent,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  question: string;
  hint: string;
  accent: string;
  initial: string;
  busy: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <div className={"flex flex-col rounded-[3px] border-2 border-ink border-l-4 bg-paper p-3 " + accent}>
      <div className="text-[13.5px] font-bold leading-[1.35]">{question}</div>
      <div className="mt-0.5 text-[11.5px] italic leading-[1.4] text-muted">{hint}</div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSave(text);
          }
        }}
        rows={4}
        maxLength={CARD_TEXT_MAX}
        disabled={busy}
        className="mt-2 w-full resize-y rounded-[2px] border border-ink bg-card p-2 text-[13px] leading-[1.5]"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => onSave(text)}
          disabled={busy}
          className="rounded-[2px] border border-ink bg-lime px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] hover:bg-lime-deep disabled:opacity-40"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted hover:text-ink"
        >
          Cancel
        </button>
        {initial.trim() && (
          <span className="ml-auto text-[10.5px] italic text-muted">Save an empty box to remove the answer.</span>
        )}
      </div>
    </div>
  );
}
