"use client";

import { CARD_TEXT_MAX, type RippleCard } from "@/lib/ripples-types";
import {
  READING_FIELDS,
  readingsFor,
  type ReadingField,
  type SynthesisBoard,
} from "@/lib/synthesis-shape";
import { useState } from "react";

import {
  AddCardForm,
  CardMenu,
  CardMenuItem,
  InlineText,
} from "@/components/workshop/synthesis/SynthesisCard";

// STEP 2 — how does this future work?
//
// Replaces the risks/opportunities lists. Those asked what could be lost or gained, which
// a group can answer without ever working out HOW the future produces either — so the
// answers stayed at the level of the headline. This asks for a concrete example first and
// then the arrangements behind it, which is the question the next steps build on.
//
// A theme can hold several readings, because two people can read one change differently
// and the disagreement is worth keeping rather than resolving into a single sheet.
//
// The reading's own text is the concrete example. The four questions are its children, so
// each is an ordinary card: the admin viewer, the CSV export and the delete cascade all
// already know how to handle those, and nothing had to learn a new shape.

const PROMPTS: Record<
  ReadingField,
  { eyebrow: string; question: string; hint: string; accent: string }
> = {
  experience: {
    eyebrow: "People's experience",
    question: "What changes for people?",
    hint: "Who gains, bears a cost or experiences this differently?",
    accent: "border-l-[var(--lime-deep)]",
  },
  mechanism: {
    eyebrow: "How it could happen",
    question: "What could produce that outcome?",
    hint: "What rules, resources, authority or relationships does it depend on?",
    accent: "border-l-blue",
  },
  assumed_role: {
    eyebrow: "Our assumed role",
    question: "Where do we imagine public health?",
    hint: "How might others describe our role? What does that story reveal or hide?",
    accent: "border-l-coral",
  },
  question: {
    eyebrow: "The question to carry forward",
    question: "What do we still need to understand?",
    hint: "Keep uncertainties and missing perspectives visible.",
    accent: "border-l-black/30",
  },
};

export function ReadingBoard({
  theme,
  board,
  editable,
  busy,
  readOnly = false,
  onAddReading,
  onEdit,
  onSetField,
  onDeleteReading,
}: {
  theme: RippleCard;
  board: SynthesisBoard;
  editable: boolean;
  busy: boolean;
  // Step 3 shows the same readings for context while values are written; there the work is
  // a different question, so the sheet reads rather than invites.
  readOnly?: boolean;
  // The example IS the reading — there is no such thing as a reading without one, so it
  // is written before the card exists rather than left as an empty box to fill in later.
  onAddReading: (theme: RippleCard, example: string) => void;
  onEdit: (card: RippleCard, text: string) => void;
  // Writes the field, creating its card the first time it is used.
  onSetField: (reading: RippleCard, field: ReadingField, text: string) => void;
  onDeleteReading: (reading: RippleCard) => void;
}) {
  const readings = readingsFor(board, theme.id);
  const canEdit = editable && !readOnly;
  const [adding, setAdding] = useState(false);

  const composer = (
    <div className="max-w-[46rem]">
      <AddCardForm
        label="A resident working a night shift cannot attend a budget hearing."
        busy={busy}
        autoFocus
        onAdd={(text) => {
          onAddReading(theme, text);
          setAdding(false);
        }}
        onDone={() => setAdding(false)}
      />
    </div>
  );

  if (readings.length === 0) {
    return (
      <div className="border-t-2 border-dashed border-black/15 px-5 py-4">
        {readOnly ? (
          <p className="text-[12px] italic text-muted">Nothing explored on this theme yet.</p>
        ) : (
          <>
            <p className="max-w-[70ch] text-[12.5px] leading-[1.5] text-muted">
              Start with a concrete example — a person, a situation or a decision inside this
              change — then work out the arrangements behind it.
            </p>
            {adding ? (
              <div className="mt-2.5">{composer}</div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                disabled={busy}
                className="mt-2.5 rounded-[2px] border border-ink bg-lime px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep disabled:opacity-40"
              >
                ＋ Start a reading
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {readings.map(({ card, fields }, i) => (
        <section key={card.id} className="border-t-2 border-dashed border-black/15 px-5 py-4">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
              {readings.length > 1 ? `Reading ${i + 1} · ` : ""}Start with a concrete example
            </div>
            {canEdit && (
              <CardMenu>
                {(close) => (
                  <CardMenuItem
                    danger
                    onClick={() => {
                      close();
                      onDeleteReading(card);
                    }}
                  >
                    Delete this reading…
                  </CardMenuItem>
                )}
              </CardMenu>
            )}
          </div>

          {/* The example runs full width above the four questions, because all four are
              asked ABOUT it — it is the thing being read, not one reading among five. */}
          <div className="mt-1.5 rounded-[3px] border border-black/15 bg-paper p-2.5 text-[13.5px] leading-[1.45]">
            <InlineText
              text={card.text}
              editable={canEdit}
              busy={busy}
              emptyLabel="＋ Describe a person, situation or decision…"
              placeholder="A resident working a night shift cannot attend a budget hearing."
              maxLength={CARD_TEXT_MAX}
              rows={2}
              onSave={(t) => onEdit(card, t)}
            />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {READING_FIELDS.map((f) => {
              const p = PROMPTS[f];
              const existing = fields[f];
              if (readOnly && !existing?.text.trim()) return null;
              return (
                <div
                  key={f}
                  className={"rounded-[3px] border border-black/15 border-l-4 bg-paper p-3 " + p.accent}
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                    {p.eyebrow}
                  </div>
                  <div className="mt-1 text-[13px] font-bold leading-[1.35]">{p.question}</div>
                  {!readOnly && (
                    <div className="mt-0.5 text-[11.5px] italic leading-[1.4] text-muted">
                      {p.hint}
                    </div>
                  )}
                  <div className="mt-1.5 text-[13px] leading-[1.45]">
                    <InlineText
                      text={existing?.text ?? ""}
                      editable={canEdit}
                      busy={busy}
                      emptyLabel="＋ Answer this"
                      placeholder={p.hint}
                      maxLength={CARD_TEXT_MAX}
                      rows={3}
                      onSave={(t) => {
                        if (existing) onEdit(existing, t);
                        else onSetField(card, f, t);
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {canEdit && (
        <div className="border-t-2 border-dashed border-black/15 px-5 py-3">
          {adding ? (
            composer
          ) : (
            <button
              onClick={() => setAdding(true)}
              disabled={busy}
              className="text-[11px] font-bold uppercase tracking-[0.05em] text-blue hover:underline disabled:opacity-40"
            >
              ＋ Add another reading
            </button>
          )}
          <p className="mt-1 max-w-[62ch] text-[11.5px] italic leading-[1.4] text-muted">
            A second reading is for a different way of seeing the same change — keep the
            disagreement rather than settling it.
          </p>
        </div>
      )}
    </div>
  );
}
