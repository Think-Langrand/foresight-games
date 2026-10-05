"use client";

import { CARD_DESCRIPTION_MAX, CARD_TEXT_MAX, type RippleCard } from "@/lib/ripples-types";
import { answerOf, type HopeFear, type SynthesisBoard } from "@/lib/synthesis-shape";
import { CardMenu, CardMenuItem, InlineText } from "@/components/workshop/synthesis/SynthesisCard";
import { AnswerCheck } from "@/components/workshop/synthesis/QuestionGrid";

// One hope or fear, with room to do the actual work on it.
//
// The three prompts this step is built around all belong to a single card — what we hope or
// fear, who it concerns, and why that matters to us — so they get one place with space to
// write rather than a node in a tree. Who it concerns is its own small card under this one;
// why it matters is this card's description.
//
// Flipping keeps the pair in the data (the new card hangs off this one), which is what
// lets the gallery say "flipped from a hope" without drawing a tree to prove it.

const FACE: Record<HopeFear, { chip: string; tint: string; rule: string; mark: string }> = {
  hope: {
    chip: "bg-lime text-ink",
    tint: "bg-lime/25",
    rule: "border-[var(--lime-deep)]",
    mark: "☀",
  },
  fear: {
    chip: "bg-coral text-white",
    tint: "bg-coral/20",
    rule: "border-coral",
    mark: "☂",
  },
};

// A labelled area of the card, the way a form on a physical card is laid out. The circle
// says whether it has been answered, like the question boxes on the other steps.
function Field({
  label,
  hint,
  answered,
  children,
  rule,
}: {
  label: string;
  hint?: string;
  answered: boolean;
  children: React.ReactNode;
  rule: string;
}) {
  return (
    <div className={"border-t-2 border-dashed px-6 py-4 " + rule}>
      <div className="flex items-start gap-2.5">
        <AnswerCheck answered={answered} />
        <div>
          <div className="text-[12.5px] font-bold leading-[1.3]">{label}</div>
          {hint && <div className="mt-0.5 text-[11px] italic leading-[1.4] text-muted">{hint}</div>}
        </div>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function HopeFearFocus({
  card,
  board,
  editable,
  busy,
  onEdit,
  onDescribe,
  onConcern,
  onRequestDelete,
}: {
  card: RippleCard;
  board: SynthesisBoard;
  editable: boolean;
  busy: boolean;
  onEdit: (card: RippleCard, text: string) => void;
  onDescribe: (card: RippleCard, description: string) => void;
  // "Who does this concern?" — written, edited or (saved empty) removed.
  onConcern: (card: RippleCard, text: string) => void;
  onRequestDelete: (card: RippleCard) => void;
}) {
  const kind = card.cardKind as HopeFear;
  const face = FACE[kind];
  const concerns = answerOf(board, card.id, "concerns");
  const why = (card.description ?? "").trim();

  return (
    // An oversized playing card: the group is filling one in, so it should look like one
    // rather than like a settings panel. The pair around it decides the width.
    <div
      className={
        "relative flex w-full flex-col overflow-hidden rounded-[10px] border-2 border-ink shadow-[4px_6px_0_rgba(36,36,34,0.18)] " +
        face.tint
      }
    >
      {/* Corner pips, the second one rotated, the way a court card reads either way up. */}
      <span aria-hidden className="pointer-events-none absolute left-4 top-3 text-[20px] leading-none opacity-30">
        {face.mark}
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-3 right-4 rotate-180 text-[20px] leading-none opacity-30"
      >
        {face.mark}
      </span>

      <div className="px-6 pb-4 pt-5">
        <div className="flex items-start gap-3 pl-8">
          <span className={"shrink-0 rounded-[2px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] " + face.chip}>
            {kind}
          </span>
          {editable && (
            <div className="ml-auto">
              <CardMenu>
                {(close) => (
                  <CardMenuItem
                    danger
                    onClick={() => {
                      close();
                      onRequestDelete(card);
                    }}
                  >
                    Delete…
                  </CardMenuItem>
                )}
              </CardMenu>
            </div>
          )}
        </div>

        {/* The first of the three questions, styled like the other two so the card reads
            as one set of three — not a title with two questions under it. Always answered:
            a hope or fear is written before the card exists. */}
        <div className="mt-3 flex items-start gap-2.5 pl-8">
          <AnswerCheck answered />
          <div className="text-[12.5px] font-bold leading-[1.3]">
            What do we {kind === "hope" ? "hope" : "fear"}?
          </div>
        </div>
        <div className="mt-2 pl-8 pr-2 text-[20px] font-extrabold leading-[1.25]">
          <InlineText text={card.text} editable={editable} busy={busy} onSave={(t) => onEdit(card, t)} editIcon />
        </div>
      </div>

      <Field
        label="Who does this concern?"
        hint="Whose lives or work would be affected?"
        answered={Boolean(concerns?.text.trim())}
        rule={face.rule}
      >
        <div className="text-[14px] leading-[1.55]">
          <InlineText
            text={concerns?.text ?? ""}
            editable={editable}
            busy={busy}
            emptyLabel="＋ Name who this concerns"
            placeholder="Residents who…, the staff who…, the towns that…"
            maxLength={CARD_TEXT_MAX}
            rows={2}
            onSave={(next) => onConcern(card, next)}
          />
        </div>
      </Field>

      {/* Why it matters. The step's whole point: the last step said what could happen,
          this says what it touches in us. Given real room, because it is a sentence not a
          label. */}
      <Field
        label="Why does this matter?"
        hint="What are we protecting or trying to make possible?"
        answered={why.length > 0}
        rule={face.rule}
      >
        <div className="text-[14px] leading-[1.55]">
          <InlineText
            text={card.description ?? ""}
            editable={editable}
            busy={busy}
            emptyLabel="＋ Write why this matters"
            placeholder="…because ___. This tells us we want to protect or advance ___."
            maxLength={CARD_DESCRIPTION_MAX}
            rows={4}
            onSave={(next) => onDescribe(card, next)}
          />
        </div>
      </Field>
    </div>
  );
}
