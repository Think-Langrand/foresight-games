"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import {
  outcomesFor,
  responsesFor,
  type CommitmentsBoard,
  type PrioritySlot,
} from "@/lib/commitments-shape";
import { CardWall, TONE } from "@/components/workshop/synthesis/CardWall";
import {
  AddCardForm,
  CardMenu,
  CardMenuItem,
  InlineText,
  type AddResult,
} from "@/components/workshop/synthesis/SynthesisCard";
import { ConfirmModal } from "@/components/ConfirmModal";

// ACT 2.2 — response ideas, written under the outcome each one advances.
//
// NESTED, NOT A SINGLE WALL. The wall used to be one untagged pool, and the next activity
// then asked the group to build three moves out of it with no way to see which idea served
// which outcome. A response is a TERMINAL card under an `outcome` now, and this board reads
// priority → outcome → ideas in that order. A ROOT response from a board worked under the
// old shape still shows, under "Not linked to an outcome".
//
// NOTHING ON THIS BOARD IS CHOSEN. Act 3.2 does not pick three of these; it asks the group
// to WRITE three bold moves with this pool as raw material, which is why there is no star
// here and no counter.

type Kind = "risk" | "opportunity";

// One outcome's row of ideas: the cards it has, then a dashed slot that becomes the
// composer. Same card face as CardWall's, so an idea here and a legacy idea on the loose
// wall below look like the same thing.
function ResponseRow({
  responses,
  editable,
  busy,
  onAdd,
  onEdit,
  onRequestDelete,
}: {
  responses: RippleCard[];
  editable: boolean;
  busy: boolean;
  onAdd: (text: string) => AddResult;
  onEdit: (card: RippleCard, text: string) => void;
  onRequestDelete: (card: RippleCard) => void;
}) {
  const [adding, setAdding] = useState(false);
  const t = TONE.response;
  return (
    <div className="flex flex-wrap content-start gap-2.5">
      {responses.map((card) => (
        <div
          key={card.id}
          className={"flex w-56 flex-col rounded-[3px] border px-3 pb-3 pt-2 " + t.edge + " " + t.well}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-blue">
              Response idea
            </span>
            {editable && (
              <CardMenu>
                {(close) => (
                  <CardMenuItem
                    danger
                    onClick={() => {
                      close();
                      onRequestDelete(card);
                    }}
                  >
                    Delete
                  </CardMenuItem>
                )}
              </CardMenu>
            )}
          </div>
          <InlineText
            text={card.text}
            editable={editable}
            busy={busy}
            onSave={(next) => onEdit(card, next)}
            className="mt-1 text-[13px] leading-[1.45]"
          />
        </div>
      ))}
      {editable &&
        (adding ? (
          <div className="flex w-56 flex-col rounded-[3px] border-2 border-ink bg-paper p-2.5">
            <div className="mb-1.5 text-[11.5px] font-bold leading-[1.3]">What could we do?</div>
            <AddCardForm
              label="One idea. Who does what…"
              busy={busy}
              autoFocus
              onAdd={onAdd}
              onDone={() => setAdding(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={
              "flex min-h-[6rem] w-56 items-center justify-center rounded-[3px] border-2 border-dashed px-3 text-center text-[13px] font-bold text-blue transition-all hover:-translate-y-0.5 hover:border-ink " +
              t.slot
            }
          >
            + Add response for this outcome
          </button>
        ))}
      {!editable && responses.length === 0 && (
        <p className="m-0 text-[12.5px] italic text-muted">No ideas yet.</p>
      )}
    </div>
  );
}

export function ResponseBoard({
  board,
  slots,
  textOf,
  kindOf,
  editable,
  busy,
  onAdd,
  onEdit,
  onDelete,
  onGoToOutcomes,
}: {
  board: CommitmentsBoard;
  slots: PrioritySlot[];
  textOf: (pick: RippleCard) => string;
  kindOf: (pick: RippleCard) => Kind | undefined;
  editable: boolean;
  busy: boolean;
  onAdd: (outcome: RippleCard, text: string) => AddResult;
  onEdit: (card: RippleCard, text: string) => void;
  onDelete: (card: RippleCard) => void;
  onGoToOutcomes: () => void;
}) {
  const [pending, setPending] = useState<RippleCard | null>(null);

  return (
    <div className="flex flex-col gap-5">
      {slots.length === 0 && (
        <p className="m-0 rounded-[3px] border border-[var(--hairline)] px-4 py-3 text-[13.5px] italic text-muted">
          No priorities yet. Confirm three on 1.2 and write an outcome for each on 2.1, and
          they appear here to brainstorm against.
        </p>
      )}

      {slots.map((slot, i) => {
        const outcomes = outcomesFor(board, slot.card.id);
        const kind = kindOf(slot.card);
        return (
          <section
            key={slot.card.id}
            className="overflow-hidden rounded-[4px] border border-[var(--hairline)] border-l-[4px] border-l-blue bg-card"
          >
            <header className="px-5 pb-3 pt-4" style={{ background: "var(--board)" }}>
              <div className="flex items-baseline gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-blue">
                Priority {i + 1}
                {kind && <span className="text-muted">{kind}</span>}
              </div>
              <h3 className="m-0 mt-1 text-[16px] font-extrabold leading-[1.35]">{textOf(slot.card)}</h3>
            </header>
            <div className="flex flex-col gap-5 px-5 py-4">
              {outcomes.length === 0 ? (
                <p className="m-0 text-[13.5px] italic text-muted">
                  No desired outcome for this priority yet.{" "}
                  <button
                    type="button"
                    onClick={onGoToOutcomes}
                    className="font-bold not-italic text-blue hover:underline"
                  >
                    Write one on 2.1 first →
                  </button>
                </p>
              ) : (
                outcomes.map((o, k) => (
                  <div key={o.id} className="border-t border-[var(--hairline)] pt-3 first:border-t-0 first:pt-0">
                    <h4 className="m-0 mb-2.5 text-[14.5px] font-bold leading-[1.4]">
                      <span className="mr-1.5 text-muted">
                        Outcome {i + 1}.{k + 1} ·
                      </span>
                      {o.text}
                    </h4>
                    <ResponseRow
                      responses={responsesFor(board, o.id)}
                      editable={editable}
                      busy={busy}
                      onAdd={(text) => onAdd(o, text)}
                      onEdit={onEdit}
                      onRequestDelete={setPending}
                    />
                  </div>
                ))
              )}
            </div>
          </section>
        );
      })}

      <p className="m-0 text-[12.5px] italic leading-[1.45] text-muted">
        Ideas can support several outcomes. Add each idea where it would advance the outcome.
        Duplicates are okay.
      </p>

      {/* Boards worked before responses were nested wrote them as roots. Shown, editable,
          and never seeded into the rows above: which outcome an old idea served is not a
          thing the software can guess. */}
      {board.looseResponses.length > 0 && (
        <section>
          <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
            Not linked to an outcome
          </div>
          <CardWall
            tone="response"
            title="Strategic responses"
            cards={board.looseResponses}
            editable={editable}
            busy={busy}
            onEdit={onEdit}
            onRequestDelete={setPending}
          />
        </section>
      )}

      <ConfirmModal
        open={pending !== null}
        title="Delete this response idea?"
        message={<span className="block">{pending?.text}</span>}
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
