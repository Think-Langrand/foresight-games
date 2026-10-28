"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import {
  outcomesFor,
  responsesFor,
  strayOutcomes,
  type CommitmentsBoard,
  type PrioritySlot,
} from "@/lib/commitments-shape";
import { ConfirmModal } from "@/components/ConfirmModal";

// ACT 2.1 — one or two desired outcomes under each priority.
//
// A CARD PER OUTCOME, UNDER ITS PICK. Outcomes used to be one flat authored prompt with the
// priorities shown beside it as context, and nothing linked an outcome to the priority it
// answered. Act 2.2 now writes response ideas under each outcome, so the link has to be
// real: an `outcome` is a SECOND card whose parent is the pick (lib/commitments-shape).
//
// UNCONTROLLED, SAVING ON BLUR, the same contract as a bold move's fields. A controlled
// textarea on a shared board fights every realtime push while someone is mid-sentence.
// `key` carries the card's id and text so a field re-seeds when a teammate edits it and
// otherwise leaves the typist alone. Clearing a box deletes the outcome, after a confirm
// that says how many response ideas go with it (0007's cascade takes them).

type Kind = "risk" | "opportunity";

function OutcomeField({
  label,
  optional,
  card,
  responseCount,
  editable,
  busy,
  onSave,
  onRequestDelete,
}: {
  label: string;
  optional: boolean;
  card: RippleCard | null;
  responseCount: number;
  editable: boolean;
  busy: boolean;
  onSave: (text: string) => void;
  onRequestDelete: (card: RippleCard) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-baseline gap-2 text-[14px] font-bold">
        {label}
        {optional && <span className="text-[12px] font-normal text-muted">· Optional</span>}
        {card && responseCount > 0 && (
          <span className="ml-auto font-mono text-[9.5px] font-normal uppercase tracking-[0.1em] text-muted">
            {responseCount} {responseCount === 1 ? "idea" : "ideas"}
          </span>
        )}
      </span>
      <textarea
        key={card ? card.id + card.text : "new"}
        defaultValue={card?.text ?? ""}
        disabled={!editable || busy}
        rows={3}
        placeholder="Describe the desired outcome…"
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (card) {
            if (next === card.text.trim()) return;
            if (!next) {
              // Put the words back; the confirm decides whether they go.
              e.target.value = card.text;
              onRequestDelete(card);
              return;
            }
            onSave(next);
            return;
          }
          if (!next) return;
          // A BLANK EMPTIES ITSELF AS IT SAVES. The new card renders in its own keyed box
          // and this blank slides down to be the next empty one, still the same DOM node.
          // Left alone, the words just typed would show up again in the box below.
          e.target.value = "";
          onSave(next);
        }}
        className="w-full resize-y rounded-[3px] border border-[var(--hairline)] bg-paper px-3 py-2 text-[14px] leading-[1.5] outline-none focus:border-ink"
      />
    </label>
  );
}

export function OutcomesBoard({
  board,
  slots,
  textOf,
  kindOf,
  editable,
  busy,
  onAdd,
  onEdit,
  onDelete,
  legacy,
}: {
  board: CommitmentsBoard;
  slots: PrioritySlot[];
  textOf: (pick: RippleCard) => string;
  kindOf: (pick: RippleCard) => Kind | undefined;
  editable: boolean;
  busy: boolean;
  onAdd: (pick: RippleCard, text: string) => void;
  onEdit: (outcome: RippleCard, text: string) => void;
  onDelete: (outcome: RippleCard) => void;
  // Flat outcomes from the retired `w4-outcomes` prompt, on boards that have any. The
  // shell renders the worksheet block and passes it here so it lands under the cards.
  legacy?: React.ReactNode;
}) {
  // How many boxes each priority shows in all, written or blank. Two to start (the
  // design's "outcome 1" and "outcome 2 · optional"); "+ Add another outcome" raises it by
  // one past whatever is written. Local, because an unwritten box is nothing on the board.
  const [target, setTarget] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<RippleCard | null>(null);
  const pendingResponses = pending ? responsesFor(board, pending.id).length : 0;
  const stray = strayOutcomes(board);

  return (
    <div className="flex flex-col gap-5">
      {slots.length === 0 && (
        <p className="m-0 rounded-[3px] border border-[var(--hairline)] px-4 py-3 text-[13.5px] italic text-muted">
          No priorities yet. Score the risks and opportunities on 1.2 and confirm three, and
          they appear here to write outcomes for.
        </p>
      )}

      {slots.map((slot, i) => {
        const written = outcomesFor(board, slot.card.id);
        const blanks = Math.max(0, (target[slot.card.id] ?? 2) - written.length);
        const fields: (RippleCard | null)[] = [
          ...written,
          ...Array.from({ length: blanks }, () => null),
        ];
        const kind = kindOf(slot.card);
        return (
          <section
            key={slot.card.id}
            className="overflow-hidden rounded-[4px] border border-[var(--hairline)] border-l-[4px] border-l-blue bg-card"
          >
            <header className="px-5 pb-3 pt-4" style={{ background: "var(--board)" }}>
              <div className="flex items-baseline gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-blue">
                Priority {i + 1} · From prioritize
                {kind && (
                  <span className="text-muted">{kind}</span>
                )}
              </div>
              <h3 className="m-0 mt-1 text-[16px] font-extrabold leading-[1.35]">{textOf(slot.card)}</h3>
              {slot.card.description && (
                <p className="m-0 mt-1 text-[12.5px] italic leading-[1.45] text-muted">
                  {slot.card.description}
                </p>
              )}
            </header>
            <div className="px-5 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* BLANKS ARE KEYED BY BLANK ORDINAL, not by position in the list. When a
                    teammate adds an outcome the written cards grow by one and every blank
                    moves down a place; keyed by position, the box someone was typing in
                    would unmount and take their words with it. */}
                {fields.map((card, k) => (
                  <OutcomeField
                    key={card?.id ?? `blank-${k - written.length}`}
                    label={`Desired outcome ${k + 1}`}
                    optional={k >= 1}
                    card={card}
                    responseCount={card ? responsesFor(board, card.id).length : 0}
                    editable={editable}
                    busy={busy}
                    onSave={(text) => (card ? onEdit(card, text) : onAdd(slot.card, text))}
                    onRequestDelete={setPending}
                  />
                ))}
              </div>
              {editable && (
                <button
                  type="button"
                  onClick={() =>
                    setTarget((m) => ({
                      ...m,
                      [slot.card.id]: Math.max(m[slot.card.id] ?? 2, written.length) + 1,
                    }))
                  }
                  className="mt-3 text-[14px] font-bold text-blue hover:underline"
                >
                  + Add another outcome
                </button>
              )}
            </div>
          </section>
        );
      })}

      {/* NOT LOST. Outcomes written under an issue the group has since replaced as a
          priority. They come back the moment it is a priority again; until then they are
          listed so nobody wonders where their words went. */}
      {stray.length > 0 && (
        <section className="rounded-[3px] border border-amber/60 bg-amber/10 px-5 py-4">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
            No longer a priority
          </div>
          <p className="m-0 mt-1 text-[12.5px] italic leading-[1.45] text-muted">
            Outcomes you wrote for issues that are not in your three any more. They return if
            the issue does; delete them if not.
          </p>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {stray.map(({ pick, outcomes }) => (
              <li key={pick.id} className="text-[13.5px] leading-[1.45]">
                <span className="font-bold">{textOf(pick)}</span>
                <ul className="m-0 mt-1 flex list-none flex-col gap-1.5 p-0 pl-3">
                  {outcomes.map((o) => {
                    const ideas = responsesFor(board, o.id);
                    return (
                      <li key={o.id}>
                        <div className="flex items-start justify-between gap-3">
                          <span className="min-w-0">{o.text}</span>
                          {editable && (
                            <button
                              type="button"
                              onClick={() => setPending(o)}
                              className="shrink-0 text-[11px] text-muted underline hover:text-coral"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                        {/* The ideas written toward it ride along: they go with the
                            outcome if it is deleted, and come back with it if the issue
                            is a priority again. */}
                        {ideas.length > 0 && (
                          <ul className="m-0 mt-1 flex list-disc flex-col gap-0.5 pl-5 text-[12.5px] text-muted">
                            {ideas.map((r) => (
                              <li key={r.id}>{r.text}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {legacy && (
        <section className="rounded-[3px] border border-[var(--hairline)] px-5 py-4">
          <div className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
            Not linked to a priority
          </div>
          {legacy}
        </section>
      )}

      <ConfirmModal
        open={pending !== null}
        title="Delete this outcome?"
        message={
          <>
            <span className="block">{pending?.text}</span>
            {pendingResponses > 0 && (
              <span className="mt-2 block font-bold">
                This takes {pendingResponses} response {pendingResponses === 1 ? "idea" : "ideas"}{" "}
                with it.
              </span>
            )}
          </>
        }
        busy={busy}
        onConfirm={() => {
          if (pending) onDelete(pending);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
