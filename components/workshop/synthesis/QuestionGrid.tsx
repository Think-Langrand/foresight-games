"use client";

import { useEffect, useRef, useState } from "react";
import { CARD_TEXT_MAX, type RippleCard } from "@/lib/ripples-types";
import type { AddResult } from "@/components/workshop/synthesis/SynthesisCard";
import { ConfirmModal } from "@/components/ConfirmModal";

// A set of questions as a grid of boxes. Each box carries its question, a checkbox that
// ticks once it has been answered, and the answers themselves; writing happens inside the
// box, so the other questions stay in view as the thing you are answering against.
//
// A question takes SEVERAL answers. Three people in a breakout read "who benefits, and how?"
// three ways, and all three readings belong on the sheet — so each box is a short list that
// grows, one card per answer, the way Week 1's question sections work. One answer reads as a
// statement; two or more pick up bullets.
//
// This is how every step of the week asks its questions. The answers are ordinary cards of
// the question's kind, which is why the grid never writes: it asks its caller to answer,
// edit or delete, and the caller knows which card that is.

// The answered mark: a checkbox, ticked once the question has an answer. Drawn, not an
// <input> — it reports, it is not how you answer — but shaped like one, because "which
// of these have we done" is a checklist question and a checklist is what people look for.
export function AnswerCheck({ answered, className = "" }: { answered: boolean; className?: string }) {
  return (
    <span
      role="img"
      aria-label={answered ? "Answered" : "Not answered yet"}
      className={
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border-2 text-[12px] font-extrabold leading-none " +
        (answered ? "border-ink bg-lime text-ink" : "border-black/30 bg-paper text-transparent") +
        " " +
        className
      }
    >
      ✓
    </span>
  );
}

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
  // Every answer to each question, in the order the group wrote them.
  answers: Partial<Record<K, RippleCard[]>>;
  editable: boolean;
  busy: boolean;
  // Later steps show earlier answers for context; there the boxes read rather than invite.
  readOnly?: boolean;
  // Another answer to a question — a card of its own, so two people adding at once both land.
  // Hands back whether the write landed, so a refused add keeps the composer and its draft.
  onAnswer: (key: K, text: string) => AddResult;
  onEdit: (card: RippleCard, text: string) => void;
  // Either the ✕ on an answer, or saving one empty rather than leaving a blank card.
  onDelete: (card: RippleCard) => void;
  columns?: 1 | 2;
  // The dashed-top padded block most sheets use; false when the caller frames it.
  framed?: boolean;
}) {
  const canEdit = editable && !readOnly;
  // Which box is being written in, and whether that is a new answer (cardId null) or one of
  // the answers already there. One at a time: the boxes around it are the context.
  const [open, setOpen] = useState<{ field: K; cardId: string | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RippleCard | null>(null);

  const written = (key: K) => (answers[key] ?? []).filter((c) => c.text.trim().length > 0);
  const answered = fields.filter((f) => written(f.key).length > 0).length;
  const total = fields.reduce((n, f) => n + written(f.key).length, 0);

  return (
    <div className={framed ? "border-t-2 border-dashed border-black/15 px-5 py-4" : ""}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">{title}</h3>
        <span className="text-[11px] italic text-muted">
          {answered} of {fields.length} answered
          {total > answered && ` · ${total} answers in all`}
          {/* While the group can still write, the hint stays up even once every question has
              an answer: one answer each is the floor, not the finish, and that is exactly the
              moment a breakout benefits from knowing a second reading is welcome. "All done"
              belongs to the read-only recap, where the sheet is a record rather than an
              invitation — beside the hint it would argue with it. */}
          {canEdit
            ? " · a question takes as many as you have"
            : answered === fields.length && " · all done"}
        </span>
      </div>
      {lead && <div className="mt-2">{lead}</div>}

      <div className={"mt-3 grid gap-3 " + (columns === 2 ? "sm:grid-cols-2" : "")}>
        {fields.map((f) => {
          const list = written(f.key);
          const here = open?.field === f.key ? open : null;
          const adding = here !== null && here.cardId === null;
          // One answer is a statement; the bullets arrive with the second, as in Week 1.
          const single = list.length === 1;
          return (
            <div
              key={f.key}
              className={
                "flex w-full flex-col rounded-[3px] border border-l-4 bg-paper p-3 text-left " +
                f.accent +
                (here ? " border-ink" : " border-black/15")
              }
            >
              <div className="flex items-start gap-2.5">
                <AnswerCheck answered={list.length > 0} />
                <span className="text-[13.5px] font-bold leading-[1.35]">{f.question}</span>
              </div>

              {list.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {list.map((c) =>
                    here?.cardId === c.id ? (
                      <li key={c.id}>
                        <AnswerEditor
                          initial={c.text}
                          busy={busy}
                          onSave={(next) => {
                            const t = next.trim();
                            if (t && t !== c.text) onEdit(c, t);
                            else if (!t) onDelete(c);
                            setOpen(null);
                          }}
                          onCancel={() => setOpen(null)}
                        />
                      </li>
                    ) : (
                      <li key={c.id} className="group flex items-start gap-1.5">
                        {!single && (
                          <span aria-hidden className="mt-[1px] shrink-0 select-none text-[13px] leading-[1.5] text-muted">
                            •
                          </span>
                        )}
                        <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => setOpen({ field: f.key, cardId: c.id })}
                              title="Click to edit"
                              aria-label={`Edit this answer to: ${f.question}`}
                              className="min-w-0 flex-1 cursor-text whitespace-pre-wrap rounded-[2px] text-left text-[13px] leading-[1.5] outline-none focus-visible:ring-2 focus-visible:ring-ink"
                            >
                              {c.text.trim()}
                            </button>
                          ) : (
                            <p className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-[1.5]">
                              {c.text.trim()}
                            </p>
                          )}
                          {canEdit && (
                            <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                              <button
                                onClick={() => setOpen({ field: f.key, cardId: c.id })}
                                aria-label="Edit answer"
                                title="Edit"
                                className="rounded-[2px] px-1 text-[14px] leading-none text-muted hover:text-ink"
                              >
                                ✎
                              </button>
                              <button
                                onClick={() => setPendingDelete(c)}
                                aria-label="Delete answer"
                                title="Delete"
                                className="rounded-[2px] px-1 text-[14px] leading-none text-muted hover:text-coral"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  )}
                </ul>
              ) : (
                !adding && (
                  <p className="mt-2 text-[12px] italic leading-[1.4] text-muted">
                    {readOnly ? "Not answered yet." : f.hint}
                  </p>
                )
              )}

              {adding && (
                <div className="mt-2">
                  <AnswerEditor
                    hint={f.hint}
                    initial=""
                    busy={busy}
                    onSave={async (next) => {
                      const t = next.trim();
                      if (!t) {
                        setOpen(null);
                        return;
                      }
                      // Close only once the write landed. A refused add — the step moved on,
                      // the session closed, the connection dropped — keeps the composer open
                      // with the text in it, so the person retries rather than retypes.
                      const landed = await onAnswer(f.key, t);
                      if (landed !== false) setOpen(null);
                    }}
                    onCancel={() => setOpen(null)}
                  />
                </div>
              )}

              {canEdit && !adding && (
                <button
                  type="button"
                  onClick={() => setOpen({ field: f.key, cardId: null })}
                  className="mt-2 self-start rounded-[2px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ink"
                >
                  ＋ {list.length > 0 ? "Add another answer" : "Answer this"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmModal
        open={pendingDelete !== null}
        title="Delete this answer?"
        message={
          <>
            <span className="block whitespace-pre-wrap text-ink">{pendingDelete?.text}</span>
            <span className="mt-2 block">
              It is one of the group&rsquo;s answers to this question, and this cannot be undone.
            </span>
          </>
        }
        busy={busy}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

// One answer in its writing state, inside its question's box — the question itself is already
// above it, so this is the hint, the text and the two buttons. Enter saves, Shift+Enter breaks
// a line, Escape puts it back without saving: the same keys InlineText uses, so the week has
// one grammar.
function AnswerEditor({
  hint,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  // Only when adding: an empty box needs to say what belongs in it.
  hint?: string;
  initial: string;
  busy: boolean;
  onSave: (text: string) => void | Promise<void>;
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
    <div className="flex flex-col">
      {hint && <div className="text-[11.5px] italic leading-[1.4] text-muted">{hint}</div>}
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
        rows={3}
        maxLength={CARD_TEXT_MAX}
        disabled={busy}
        className="mt-1.5 w-full resize-y rounded-[2px] border border-ink bg-card p-2 text-[13px] leading-[1.5]"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
          <span className="ml-auto text-[10.5px] italic text-muted">Save it empty to remove this answer.</span>
        )}
      </div>
    </div>
  );
}
