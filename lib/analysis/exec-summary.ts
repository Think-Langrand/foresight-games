import "server-only";

import OpenAI from "openai";
import { PLAIN_WORDS_PROSE } from "@/lib/analysis/theme-guidance";
import { EXEC_SUMMARY_LIMITS } from "@/lib/exec-summary-shape";

// Draft the handoff's lead from a group's own Session 4 work.
//
// WHY A MODEL WRITES THE FIRST PASS, when GroupSummary's own comment argues against a
// machine précis leading a document whose claim is that it is the group's. The objection
// was to text nobody in the group ever sees or accepts. Here the draft lands in an editor
// on the group's own board, it is labelled "drafted" until a human changes a word, and the
// group can rewrite or delete it. The model does the stitching; the group keeps the pen.
//
// IT GETS EVERYTHING, not just the two written steps it summarises. The group's key
// changes, the stakes it ranked and the responses it chose are what make the lead specific
// rather than a paraphrase of four answers — and the group has already decided all of it,
// so nothing here is the model's opinion.

const MODEL = "gpt-5";

const SYSTEM =
  "You are a foresight facilitator writing the opening paragraph of a design group's handoff " +
  "to a steering committee. The committee was not in the room and will read four of these, one " +
  "per scenario, side by side.\n\n" +
  "You are given everything the group decided in its final session: how it says the field has " +
  "changed in this world, which of today's assumptions it says stop holding, the risks and " +
  "opportunities it ranked, the responses it chose, the role it would argue for, and the boldest " +
  "moves it would make.\n\n" +
  "Write three short paragraphs: what is different in this world, what stops being true, and " +
  "what public health is for here. Use the group's own words and examples wherever you can. " +
  "Invent nothing — say only what the material supports, and write less rather than reaching. " +
  "Do not hedge, do not recommend, and do not describe the exercise: no 'the group felt' or " +
  "'this session explored'. Write it as the group's own statement about the world.\n\n" +
  PLAIN_WORDS_PROSE;

// One block of the group's material, as the route assembles it.
export interface ExecSummaryInput {
  scenarioTitle: string;
  changes: { label: string; answers: string[] }[];
  role: { label: string; answers: string[] }[];
  keyChanges: string[];
  // NO kind HERE. A pick stores its source's id and words, not whether that source came
  // from Week 3's risk wall or its opportunity wall, and only a caller holding Week 3's
  // board can say which. Rather than load another week to label them, they go in as "what
  // the group ranked highest" — telling the model an opportunity is a risk would be worse
  // than telling it nothing.
  stakes: { text: string; score: number | null }[];
  responses: string[];
  // Act 6's three recommendations, each already flattened to "the move — purpose —
  // rationale — requirements". The week's HEADLINE OUTPUT, and for a while the one thing
  // the model never saw: the old shape fed them in as section answers under `role`, and
  // when act 6 became cards of its own that path quietly emptied while the readiness gate
  // went on requiring three of them before it would let anyone press the button.
  directions: string[];
}

function digest(i: ExecSummaryInput): string {
  const block = (title: string, lines: string[]) =>
    lines.length ? `${title}:\n${lines.map((l) => `- ${l}`).join("\n")}\n` : "";
  return [
    block(
      "How the group says this world works, and what stops holding",
      i.changes.flatMap((b) => b.answers.map((a) => `${b.label} — ${a}`))
    ),
    block("The key changes it carried in from Session 2", i.keyChanges),
    block(
      "What it ranked as most at stake, strongest first",
      i.stakes.map((s) => `${s.score === null ? "" : `(${s.score}) `}${s.text}`)
    ),
    block("The responses it chose", i.responses),
    block("The three directions it recommends", i.directions),
    block(
      "The role it would argue for, and its boldest moves",
      i.role.flatMap((b) => b.answers.map((a) => `${b.label} — ${a}`))
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

// Null rather than throwing when there is no key: a server without one should show the
// group "drafting is not available here", not a 500 that reads like their board is broken.
export async function draftExecSummary(input: ExecSummaryInput): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const text = digest(input);
  if (!text.trim()) return null;

  try {
    const client = new OpenAI();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Scenario: ${input.scenarioTitle || "(untitled)"}\n\n${text}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "exec_summary",
          schema: {
            type: "object",
            additionalProperties: false,
            // Paragraphs rather than one string: it is the only way to make the three-part
            // shape a constraint the model has to satisfy instead of a request it can
            // round down to one block of prose.
            properties: {
              paragraphs: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
            },
            required: ["paragraphs"],
          },
          strict: true,
        },
      },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { paragraphs?: unknown };
    const paras = Array.isArray(parsed.paragraphs)
      ? parsed.paragraphs
          .map((p) => (typeof p === "string" ? p.replace(/\s+/g, " ").trim() : ""))
          .filter(Boolean)
      : [];
    if (!paras.length) return null;
    // Blank lines, because that is the paragraph break the slide and the editor both read.
    return paras.join("\n\n").slice(0, EXEC_SUMMARY_LIMITS.text);
  } catch (err) {
    console.error("[draftExecSummary]", err);
    return null;
  }
}
