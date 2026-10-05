"use client";

import type { RippleCard } from "@/lib/ripples-types";
import {
  READING_FIELDS,
  themeAnswers,
  type ReadingField,
  type SynthesisBoard,
} from "@/lib/synthesis-shape";
import { QuestionGrid, type QuestionField } from "@/components/workshop/synthesis/QuestionGrid";

// The theme's four questions — "how does this future work?" — as a 2×2 of boxes.
//
// This replaced a sheet that began with a concrete example and asked four questions of it.
// Groups did not find the questions in it. The answers are ordinary cards of the question's
// kind, hung straight off the theme, so the admin viewer, export and delete cascade keep
// working; an older board's reading still shows its answers through themeAnswers().

export const PROMPTS: Record<ReadingField, { question: string; hint: string; accent: string }> = {
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

export const READING_QUESTIONS: readonly QuestionField<ReadingField>[] = READING_FIELDS.map((key) => ({
  key,
  ...PROMPTS[key],
}));

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
  readOnly?: boolean;
  onAnswer: (theme: RippleCard, field: ReadingField, text: string) => void;
  onEdit: (card: RippleCard, text: string) => void;
  onDelete: (card: RippleCard) => void;
}) {
  return (
    <QuestionGrid
      title="How does this future work?"
      fields={READING_QUESTIONS}
      answers={themeAnswers(board, theme.id)}
      editable={editable}
      busy={busy}
      readOnly={readOnly}
      onAnswer={(field, text) => onAnswer(theme, field, text)}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}
