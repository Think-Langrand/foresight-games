"use client";

import { useEffect, useRef, useState } from "react";
import { CARD_TEXT_MAX, type RippleCard } from "@/lib/ripples-types";
import {
  READING_FIELDS,
  themeAnswers,
  type ReadingField,
  type SynthesisBoard,
} from "@/lib/synthesis-shape";

// The theme's four questions, as a 2×2 of boxes. Each box carries its question and a circle
// that fills once it has an answer; clicking a box turns that box — only that box — into
// the place to write the answer, so the other three stay in view as the thing you are
// answering against.
//
// This replaces a sheet that began with a concrete example and asked four questions of it.
// Groups did not find the questions in it. The answers are ordinary cards of the question's
// kind, hung straight off the theme, so the admin viewer, export and delete cascade keep
// working; an older board's reading still shows its answers through themeAnswers().

export const PROMPTS: Record<
  ReadingField,
  { question: string; hint: string; accent: string }
> = {
  benefit: {
    question: "Who benefits, and how?",
    hint: "Who gains from this change, and what do they gain?",
    accent: "border-l-[var(--lime-deep)]",
  },
  cost: {
    question: "Who bears a cost or loses access?",
    hint: "Who pays, in money, time, standing or reach — and who is left out?",
    accent: "border-l-coral",
  },
  experience: {
    question: "Who might experience this differently?",
    hint: "The same change read from another place, role or situation.",
    accent: "border-l-blue",
  },
  mechanism: {
    question: "What would make that happen?",
    hint: "The rules, resources, authority or relationships it depends on.",
    accent: "border-l-black/30",
  },
};

export function ReadingBoard({
  theme,
  board,
  editable,
  busy,
  readOnly = false,
  onAnswer,
  onEdit,
  onDelete,
}: {
  theme: RippleCard;
  board: SynthesisBoard;
  editable: boolean;
  busy: boolean;
  // The hopes & fears step shows the same answers for context while values are written;
  // there the work is a different question, so the boxes read rather than invite.
  readOnly?: boolean;
  // Writes a first answer to a question. Later saves edit the answer's card.
  onAnswer: (theme: RippleCard, field: ReadingField, text: string) => void;
  onEdit: (card: RippleCard, text: string) => void;
  // Saving an empty answer removes its card rather than leaving a blank one.
  onDelete: (card: RippleCard) => void;
}) {
  const answers = themeAnswers(board, theme.id);
  const canEdit = editable && !readOnly;
  const [open, setOpen] = useState<ReadingField | null>(null);
  const answered = READING_FIELDS.filter((f) => (answers[f]?.text ?? "").trim().length > 0).length;

  return (
    <div className="border-t-2 border-dashed border-black/15 px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
          How does this future work?
        </h3>
        <span className="text-[11px] italic text-muted">
          {answered} of {READING_FIELDS.length} answered
          {canEdit && answered < READING_FIELDS.length && " · click a question to answer it"}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {READING_FIELDS.map((f) => {
          const p = PROMPTS[f];
          const existing = answers[f];
          const text = existing?.text.trim() ?? "";
          const has = text.length > 0;
          if (open === f && canEdit) {
            return (
              <AnswerEditor
                key={f}
                question={p.question}
                hint={p.hint}
                accent={p.accent}
                initial={existing?.text ?? ""}
                busy={busy}
                onSave={(next) => {
                  const t = next.trim();
                  if (existing) {
                    if (t && t !== existing.text) onEdit(existing, t);
                    else if (!t) onDelete(existing);
                  } else if (t) {
                    onAnswer(theme, f, t);
                  }
                  setOpen(null);
                }}
                onCancel={() => setOpen(null)}
              />
            );
          }
          const box =
            "flex w-full flex-col rounded-[3px] border border-black/15 border-l-4 bg-paper p-3 text-left " +
            p.accent +
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
                <span className="text-[13.5px] font-bold leading-[1.35]">{p.question}</span>
              </div>
              {has ? (
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.5]">{text}</p>
              ) : (
                <p className="mt-2 text-[12px] italic leading-[1.4] text-muted">
                  {readOnly ? "Not answered yet." : p.hint}
                </p>
              )}
            </>
          );
          return canEdit ? (
            <button
              key={f}
              onClick={() => setOpen(f)}
              aria-label={`${has ? "Edit the answer to" : "Answer"}: ${p.question}`}
              className={box}
            >
              {body}
            </button>
          ) : (
            <div key={f} className={box}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// One box in its writing state. Enter saves, Shift+Enter breaks a line, Escape puts the
// box back without saving — the same keys InlineText uses, so the sheet has one grammar.
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
