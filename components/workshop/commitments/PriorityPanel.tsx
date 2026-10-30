"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import { cardScores } from "@/lib/ripples-scoring";
import { MAX_PRIORITIES, type PrioritySlot } from "@/lib/commitments-shape";
import { Eyebrow } from "@/components/workshop/commitments/StarterQuestions";

type Kind = "risk" | "opportunity";

// "Confirm your three priorities": the scores suggest, the group keeps or replaces.
//
// Each slot shows the issue, whether it is a SUGGESTION (the ranking put it there) or
// CONFIRMED (the group did), and a box for why it needs attention. Keep confirms a
// suggestion in place; Replace opens the list of every other scored issue. Writing a why on
// a suggestion confirms it too, because explaining a priority is choosing it.
//
// WHICH ITEM LEAVES ON REPLACE is the parent's rule (see replacePriority in the view):
// every other slot is confirmed as it stands, so the one the group clicked is the one that
// goes rather than whichever the ranking would have dropped or re-suggested next.
function KindDot({ kind }: { kind: Kind | undefined }) {
  if (!kind) return null;
  return (
    <span
      aria-hidden
      className={
        "mt-[7px] inline-block h-2.5 w-2.5 shrink-0 rounded-full " +
        (kind === "risk" ? "bg-coral" : "bg-lime ring-1 ring-[var(--lime-deep)]")
      }
    />
  );
}

function ReplacePicker({
  candidates,
  textOf,
  kindOf,
  themeOf,
  onPick,
  onClose,
}: {
  candidates: RippleCard[];
  textOf: (pick: RippleCard) => string;
  kindOf: (pick: RippleCard) => Kind | undefined;
  themeOf: (pick: RippleCard) => string | undefined;
  onPick: (pick: RippleCard) => void;
  onClose: () => void;
}) {
  const byKind = (k: Kind) => candidates.filter((c) => kindOf(c) === k);
  const group = (k: Kind, label: string) => {
    const rows = byKind(k);
    if (rows.length === 0) return null;
    return (
      <div>
        <Eyebrow>{label}</Eyebrow>
        <ul className="m-0 mt-1 list-none p-0">
          {rows.map((c) => {
            const s = cardScores(c);
            return (
              <li key={c.id} className="border-b border-[var(--hairline)] last:border-b-0">
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  className="flex w-full items-start gap-2.5 py-2 text-left hover:bg-lime/30"
                >
                  <KindDot kind={k} />
                  <span className="min-w-0 flex-1">
                    {themeOf(c) && (
                      <span className="block font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                        {themeOf(c)}
                      </span>
                    )}
                    <span className="block text-[13.5px] leading-[1.4]">{textOf(c)}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted">
                    L{s.plausibility} · I{s.impact}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Replace this priority"
        className="flex max-h-[80vh] w-full max-w-[36rem] flex-col rounded-[4px] border-2 border-ink bg-paper"
      >
        <div className="flex items-baseline justify-between gap-3 border-b border-ink px-5 py-3">
          <h3 className="m-0 text-[16px] font-extrabold">Replace with…</h3>
          <button type="button" onClick={onClose} className="text-[12px] text-muted underline">
            Cancel
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          {candidates.length === 0 ? (
            <p className="m-0 text-[13px] italic text-muted">
              Every scored item is already a priority. Score another to have something to
              swap in.
            </p>
          ) : (
            <>
              {group("risk", "Risks")}
              {group("opportunity", "Opportunities")}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function PriorityPanel({
  slots,
  candidates,
  textOf,
  kindOf,
  themeOf,
  editable,
  busy,
  onKeep,
  onUndo,
  onReplace,
  onWhy,
}: {
  slots: PrioritySlot[];
  // Scored picks not in a slot, strongest first: what Replace offers.
  candidates: RippleCard[];
  // The Session 3 card's CURRENT words for a pick, so a typo fixed on Session 3 shows here.
  textOf: (pick: RippleCard) => string;
  kindOf: (pick: RippleCard) => Kind | undefined;
  themeOf: (pick: RippleCard) => string | undefined;
  editable: boolean;
  busy: boolean;
  onKeep: (pick: RippleCard) => void;
  // The way back out of a Keep, offered on a CONFIRMED slot where Keep is offered on a
  // suggested one. Never both on one row: the pair is the badge, as a control.
  onUndo: (pick: RippleCard) => void;
  onReplace: (slotIndex: number, next: RippleCard) => void;
  onWhy: (pick: RippleCard, why: string) => void;
}) {
  const [replacing, setReplacing] = useState<number | null>(null);
  const over = slots.length > MAX_PRIORITIES;
  // Empty slots up to three, so the panel always shows the shape it is asking for.
  const rows: (PrioritySlot | null)[] = [
    ...slots,
    ...Array.from({ length: Math.max(0, MAX_PRIORITIES - slots.length) }, () => null),
  ];

  return (
    <section className="rounded-[4px] border-2 border-ink bg-card px-5 py-4">
      <h3 className="m-0 text-[20px] font-extrabold leading-[1.2]">
        Confirm your three priorities
      </h3>
      <p className="m-0 mt-1 text-[13px] leading-[1.5] text-muted">
        The tool suggests three based on your scores. Keep or replace them, then note why
        each matters.
        {editable && candidates.length > 0 && " Replacing one keeps the other two."}
      </p>
      {/* A REPORT, NOT A DEMAND. Carrying a fourth works: every step after this reads the
          slots as they are, so the fourth gets its own outcome box on 2.1, its ideas on
          2.2 and its own row in the handoff. The one thing it changes is the bar, because
          the handoff asks for an outcome under EVERY priority, so a fourth is a fourth
          outcome to write. That is a real cost and a group should know it, but it is the
          group's call, so this says what is true and where the way back is rather than
          telling them to undo. */}
      {over && (
        <p className="m-0 mt-2 text-[12.5px] font-bold text-coral">
          {slots.length} confirmed, {slots.length - MAX_PRIORITIES} more than the{" "}
          {MAX_PRIORITIES} this step asks for. That is fine if the group means it: each one
          needs its own desired outcome. Undo any to drop it back to a suggestion.
        </p>
      )}

      <ol className="m-0 mt-4 flex list-none flex-col gap-4 p-0">
        {rows.map((slot, i) => (
          <li
            key={slot?.card.id ?? `empty-${i}`}
            className="border-t border-[var(--hairline)] pt-3"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] bg-[var(--board)] font-mono text-[13px] font-bold tabular-nums">
                {i + 1}
              </span>
              {slot ? (
                <>
                  <KindDot kind={kindOf(slot.card)} />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[15px] font-bold leading-[1.4]">{textOf(slot.card)}</p>
                    <span
                      className={
                        "mt-1 inline-block rounded-[2px] px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.1em] " +
                        (slot.status === "confirmed"
                          ? "bg-lime text-ink"
                          : "bg-[var(--board)] text-muted")
                      }
                    >
                      {slot.status === "confirmed" ? "Confirmed" : "Suggested from scores"}
                    </span>
                  </div>
                  {editable && (
                    <span className="flex shrink-0 gap-1.5">
                      {/* ONE OF THE PAIR, NEVER BOTH. A row is suggested or confirmed, so
                          Keep and Undo swap in the same place: the control says what the
                          next press would do. Undo is the quiet variant because it takes
                          something away, where Keep is the step's affirmative act. */}
                      {slot.status === "suggested" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onKeep(slot.card)}
                          className="rounded-[2px] border border-ink bg-lime px-2.5 py-1 text-[12px] font-bold hover:bg-lime-deep disabled:opacity-40"
                        >
                          Keep
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onUndo(slot.card)}
                          title="Back to a suggestion. Scores and notes are kept."
                          className="rounded-[2px] border border-[var(--hairline)] bg-paper px-2.5 py-1 text-[12px] font-bold hover:border-ink disabled:opacity-40"
                        >
                          Undo
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setReplacing(i)}
                        className="rounded-[2px] border border-[var(--hairline)] bg-paper px-2.5 py-1 text-[12px] font-bold hover:border-ink disabled:opacity-40"
                      >
                        Replace
                      </button>
                    </span>
                  )}
                </>
              ) : (
                // No picker here: a slot is empty only when every scored item is already
                // in a slot, so there is never anything to choose from.
                <p className="m-0 min-w-0 flex-1 text-[13.5px] italic leading-[1.4] text-muted">
                  Score more items to fill this slot.
                </p>
              )}
            </div>
            {slot && (
              // KEYED ON THE STORED WHY, saving on blur, like the bold moves' fields: a
              // box that mounted empty must learn about a teammate's words, and a no-op
              // blur must not post a blank over them.
              <input
                key={slot.card.id + (slot.card.description ?? "")}
                type="text"
                defaultValue={slot.card.description ?? ""}
                disabled={!editable || busy}
                placeholder="Why does this need our attention?"
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next === (slot.card.description ?? "").trim()) return;
                  onWhy(slot.card, next);
                }}
                className="mt-2.5 w-full rounded-[3px] border border-[var(--hairline)] bg-paper px-3 py-2 text-[13.5px] leading-[1.45] outline-none focus:border-ink"
              />
            )}
          </li>
        ))}
      </ol>

      {replacing !== null && (
        <ReplacePicker
          candidates={candidates}
          textOf={textOf}
          kindOf={kindOf}
          themeOf={themeOf}
          onPick={(next) => {
            onReplace(replacing, next);
            setReplacing(null);
          }}
          onClose={() => setReplacing(null)}
        />
      )}
    </section>
  );
}
