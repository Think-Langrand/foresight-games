import { READING_FIELDS, type ReadingField } from "@/lib/synthesis-shape";
import type { QuestionField } from "@/components/workshop/synthesis/QuestionGrid";

// The four questions a theme used to be asked — "how does this future work?".
//
// Nothing on the board asks or shows them any more: step 2 stopped asking, and step 3's
// theme deck now reads out the theme's risks and opportunities instead. Answers already
// written are kept, and still reach the CSV, the admin panel and the facilitator summary
// through ANSWER_LABELS.
//
// This file and QuestionGrid are held together, unmounted, so that putting the questions
// back — read-only, or facilitator-only — is an import rather than a rewrite. If that is
// not wanted, both go.
//
// NOTE there is a second copy of these strings in ANSWER_LABELS (lib/synthesis-shape.ts),
// which the CSV export, the admin panel and the facilitator summary read. Reword a
// question and both have to move.

const PROMPTS: Record<ReadingField, { question: string; hint: string; accent: string }> = {
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
