"use client";

import { useState } from "react";
import { CARD_DESCRIPTION_MAX, type RippleCard } from "@/lib/ripples-types";
import type { StakeKind, SynthesisBoard } from "@/lib/synthesis-shape";
import {
  AddCardForm,
  CardMenu,
  CardMenuItem,
  InlineText,
} from "@/components/workshop/synthesis/SynthesisCard";

// STEP 2 — what's at stake, filled in ON the theme card.
//
// The three prompts live inside the theme's own card, as fields of one sheet, because
// they are all answering the same question about the same theme. Splitting them into
// separate blocks underneath made them read as three unrelated exercises that happened to
// share a page.
//
// The analytical step, and the reason the week works: without it, hopes and fears end up
// carrying the analysis and the group just restates its observations in warmer language.
// Here a card says what could be LOST or GAINED and through what mechanism; step 3 then
// asks the separate question of why that matters.
//
// "Who could benefit? Who could lose?" are prompts on the composer rather than fields of
// their own — they are how you arrive at the mechanism note, not separate answers.
//
// Park is deliberately NOT offered. A parked card lands in a flat pile with no record of
// which theme or list it came from; these are cheap to retype, so Delete is the only exit.

const LISTS: {
  kind: StakeKind;
  title: string;
  blurb: string;
  prompt: string;
  mechanism: string;
  accent: string;
}[] = [
  {
    kind: "risk",
    title: "Risks",
    blurb: "What could be lost? Who could lose it, and through what chain of consequences?",
    prompt: "What could be lost…",
    mechanism: "Through what mechanism, and for whom?",
    accent: "border-l-coral",
  },
  {
    kind: "opportunity",
    title: "Opportunities",
    blurb: "What could be gained? Who could benefit, and through what chain of consequences?",
    prompt: "What could be gained…",
    mechanism: "Through what mechanism, and for whom?",
    accent: "border-l-[var(--lime-deep)]",
  },
  {
    kind: "tension",
    title: "Surprises & disagreements",
    blurb: "What surprised the group, or where did you not agree? Keep it rather than resolving it.",
    prompt: "What surprised you, or where did you split…",
    mechanism: "",
    accent: "border-l-blue",
  },
];

export function StakeBoard({
  theme,
  board,
  editable,
  busy,
  onAdd,
  onEdit,
  onDescribe,
  onDelete,
}: {
  theme: RippleCard;
  board: SynthesisBoard;
  editable: boolean;
  busy: boolean;
  onAdd: (parent: RippleCard, kind: StakeKind, text: string) => void;
  onEdit: (card: RippleCard, text: string) => void;
  onDescribe: (card: RippleCard, description: string) => void;
  onDelete: (card: RippleCard) => void;
}) {
  const [adding, setAdding] = useState<StakeKind | null>(null);

  const cardsFor = (kind: StakeKind) =>
    (kind === "risk"
      ? board.risks
      : kind === "opportunity"
        ? board.opportunities
        : board.tensions
    ).get(theme.id) ?? [];

  return (
    <div>
      {LISTS.map((list) => {
        const cards = cardsFor(list.kind);
        return (
          // A field of the dossier, divided the way the playing card's fields are.
          <section key={list.kind} className="border-t-2 border-dashed border-black/15 px-5 py-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                {list.title}
                {cards.length > 0 && <span className="ml-1.5">({cards.length})</span>}
              </h3>
              {editable && (
                <button
                  onClick={() => setAdding(adding === list.kind ? null : list.kind)}
                  className="text-[10px] font-bold uppercase tracking-[0.05em] text-blue hover:underline"
                >
                  ＋ Add
                </button>
              )}
            </div>
            <p className="mt-0.5 max-w-[72ch] text-[11.5px] leading-[1.45] text-muted">
              {list.blurb}
            </p>

            <div className="mt-2 flex flex-col gap-2">
              {cards.map((c) => (
                <div
                  key={c.id}
                  className={
                    "group rounded-[3px] border border-black/15 border-l-4 bg-paper p-2.5 " +
                    list.accent
                  }
                >
                  <div className="flex items-start gap-1.5">
                    <div className="min-w-0 flex-1 text-[13px] leading-[1.45]">
                      <InlineText
                        text={c.text}
                        editable={editable}
                        busy={busy}
                        onSave={(t) => onEdit(c, t)}
                      />
                    </div>
                    {editable && (
                      <CardMenu>
                        {(close) => (
                          <CardMenuItem
                            danger
                            onClick={() => {
                              close();
                              onDelete(c);
                            }}
                          >
                            Delete
                          </CardMenuItem>
                        )}
                      </CardMenu>
                    )}
                  </div>

                  {/* The mechanism. A risk without one is just a worry — this is the line
                      that makes it explainable to a committee. Tensions have no mechanism
                      to give, so they do not offer the field. */}
                  {list.mechanism && (
                    <div className="mt-1 text-[11.5px] leading-[1.4] text-muted">
                      <InlineText
                        text={c.description ?? ""}
                        editable={editable}
                        busy={busy}
                        emptyLabel="＋ Through what mechanism, and for whom?"
                        placeholder={list.mechanism}
                        maxLength={CARD_DESCRIPTION_MAX}
                        rows={2}
                        onSave={(next) => onDescribe(c, next)}
                      />
                    </div>
                  )}

                  {c.shortlisted && (
                    <div className="mt-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-blue">
                      ★ On the committee shortlist
                    </div>
                  )}
                </div>
              ))}

              {adding === list.kind && (
                <div className="max-w-[40rem]">
                  <AddCardForm
                    label={list.prompt}
                    busy={busy}
                    autoFocus
                    onAdd={(text) => onAdd(theme, list.kind, text)}
                    onDone={() => setAdding(null)}
                  />
                </div>
              )}

              {cards.length === 0 && adding !== list.kind && (
                <p className="py-1 text-[12px] italic text-muted">Nothing yet.</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
