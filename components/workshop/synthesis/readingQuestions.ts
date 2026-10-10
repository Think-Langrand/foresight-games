import { READING_FIELDS, type ReadingField } from "@/lib/synthesis-shape";
import type { QuestionField } from "@/components/workshop/synthesis/QuestionGrid";

// The four questions a theme used to be asked — "how does this future work?".
//
// Step 2 no longer asks them: it is about a theme's risks and opportunities, read against
// the implications it was built from. But boards already hold their answers, and step 3's
// theme deck still reads them out, so the question text has to live somewhere. Here,
// rather than in a component nothing mounts any more.
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
