"use client";

import type { RippleCard } from "@/lib/ripples-types";
import {
  answerOf,
  boardAnswersOf,
  roleProgress,
  valuesFor,
  valuesProgress,
  type RoleField,
  type SynthesisBoard,
} from "@/lib/synthesis-shape";
import { ThemeRail } from "@/components/workshop/synthesis/ThemeRail";
import { PromptRail, Prompts } from "@/components/workshop/synthesis/PromptRail";
import { QuestionGrid, type QuestionField } from "@/components/workshop/synthesis/QuestionGrid";
import { STATE_DOT, STATE_LABEL, stateGlyph } from "@/components/workshop/synthesis/themeProgress";

// STEP 3 — what role should public health play? ONE answer for the board, not one per
// theme: a desirable role, what it could make possible, what it could put at risk or miss,
// and what DG4 should investigate. Asked across every theme at once — the values the group
// named and the other ways it found the needs could be met are gathered above the
// questions, theme by theme, as the material to answer from. This sheet IS the share-out.
//
// The rail stays, as the week's constant and as reference: hovering a square reads a theme
// in full. Nothing here is picked per theme, so clicking one does nothing.

export const ROLE_QUESTIONS: readonly QuestionField<RoleField>[] = [
  {
    key: "desired_role",
    question: "A desirable role for public health",
    hint: "Who would it serve, what would it contribute, and how would it work with others?",
    accent: "border-l-blue",
  },
  {
    key: "opportunity",
    question: "What could this role make possible?",
    hint: "An opportunity it opens.",
    accent: "border-l-[var(--lime-deep)]",
  },
  {
    key: "risk",
    question: "What could it put at risk or miss?",
    hint: "A risk, or a perspective it leaves out.",
    accent: "border-l-coral",
  },
  {
    key: "investigate",
    question: "What should DG4 investigate?",
    hint: "What authority, resources, relationships or evidence would this role require?",
    accent: "border-l-black/30",
  },
];

export function RoleBoard({
  board,
  editable,
  busy,
  onAnswer,
  onEdit,
  onDelete,
  onGoToCluster,
}: {
  board: SynthesisBoard;
  editable: boolean;
  busy: boolean;
  // A first answer to one of the four, for the board.
  onAnswer: (field: RoleField, text: string) => void;
  onEdit: (card: RippleCard, text: string) => void;
  onDelete: (card: RippleCard) => void;
  onGoToCluster: () => void;
}) {
  const answers = boardAnswersOf(board);
  const state = roleProgress(board);

  const rail = (
    <ThemeRail
      board={board}
      activeId={null}
      onPick={() => {}}
      progressFor={(t) => valuesProgress(board, t.id)}
      progressLabel="Values & alternatives"
      hint="The themes, for reference. Hover one to read it."
    />
  );
  const prompts = (
    <PromptRail>
      <Prompts
        heading="What role should public health play?"
        lead="Connect what matters with what could work differently — across every theme. Carry the reasoning and open questions into DG4."
        questions={ROLE_QUESTIONS.map((q) => ({ question: q.question, hint: q.hint }))}
      />
    </PromptRail>
  );

  if (board.themes.length === 0) {
    return (
      <>
        {rail}
        {prompts}
        <div className="rounded-[3px] border border-[var(--hairline)] bg-card p-6 text-center">
          <p className="text-[14px] font-bold">No themes yet.</p>
          <p className="mx-auto mt-1 max-w-[50ch] text-[13px] text-muted">
            The role is answered across the themes, so the group needs to cluster its
            implications first.
          </p>
          <button
            onClick={onGoToCluster}
            className="mt-3 rounded-[2px] border border-ink bg-lime px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep"
          >
            ← Go to Themes
          </button>
        </div>
      </>
    );
  }

  // What this is answered from: per theme, its values and its alternative.
  const material = board.themes.map((t, i) => ({
    theme: t,
    n: i + 1,
    values: valuesFor(board, t.id),
    alternative: answerOf(board, t.id, "alternative"),
  }));
  const anyMaterial = material.some((m) => m.values.length > 0 || m.alternative?.text.trim());

  return (
    <>
      {rail}
      {prompts}

      <section className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-[4px] border-2 border-ink bg-[rgba(196,255,103,0.16)]">
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">Across every theme</div>
              <span className={"flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.06em] " + STATE_DOT[state]}>
                <span aria-hidden>{stateGlyph(state)}</span>
                {STATE_LABEL[state]}
              </span>
            </div>
            <h2 className="mt-1 text-[20px] font-extrabold uppercase leading-[1.1] tracking-tight">
              What role should public health play?
            </h2>
            <p className="mt-1.5 max-w-[70ch] text-[13px] leading-[1.5] text-ink/80">
              One answer for the board, drawn from what matters and what could work differently on
              each theme. Roles can differ across themes — keep the disagreements in the answer
              rather than settling them.
            </p>
          </div>

          {/* The material: what the group said matters, and the other ways it found, theme by
              theme. Folded by default once there is a lot of it? No — this is what the four
              questions are answered FROM, so it stays open; each theme is one compact row. */}
          <div className="border-t-2 border-dashed border-black/15 px-5 py-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">What this is answered from</h3>
              <span className="text-[11px] italic text-muted">Each theme&rsquo;s values, and the other way it could work.</span>
            </div>
            {anyMaterial ? (
              <ul className="mt-3 flex flex-col gap-2">
                {material.map(({ theme, n, values, alternative }) => (
                  <li key={theme.id} className="grid gap-x-4 gap-y-1.5 rounded-[3px] border border-black/15 bg-paper p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="sm:col-span-2 flex items-baseline gap-2">
                      <span className="rounded-[2px] bg-ink px-1 py-px text-[9.5px] font-bold text-paper">{n}</span>
                      <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.06em] text-muted" title={theme.text}>
                        {theme.text}
                      </span>
                    </div>
                    <div className="border-l-4 border-[var(--lime-deep)] pl-2.5">
                      <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">What matters</div>
                      {values.length > 0 ? (
                        <ul className="mt-1 flex flex-col gap-1 text-[12.5px] leading-[1.4]">
                          {values.map(({ card, value }) => (
                            <li key={card.id} className="flex items-start gap-1.5">
                              <span className={"mt-[2px] shrink-0 rounded-[2px] px-1 text-[8.5px] font-bold uppercase tracking-[0.06em] " + (card.cardKind === "hope" ? "bg-lime text-ink" : "bg-coral text-white")}>
                                {card.cardKind}
                              </span>
                              <span>{value}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-[12px] italic text-muted">No value captured yet.</p>
                      )}
                    </div>
                    <div className="border-l-4 border-blue pl-2.5">
                      <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">Another way it could work</div>
                      {alternative?.text.trim() ? (
                        <p className="mt-1 text-[12.5px] leading-[1.4]">{alternative.text}</p>
                      ) : (
                        <p className="mt-1 text-[12px] italic text-muted">No alternative explored yet.</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[12.5px] italic text-muted">
                Nothing from the last step yet — the values and alternatives written on each theme
                will gather here.
              </p>
            )}
          </div>

          <QuestionGrid
            title="Public health's role"
            fields={ROLE_QUESTIONS}
            answers={answers}
            editable={editable}
            busy={busy}
            onAnswer={onAnswer}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      </section>
    </>
  );
}
