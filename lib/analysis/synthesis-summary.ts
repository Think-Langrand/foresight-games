import "server-only";

import OpenAI from "openai";
import type { SynthesisExercise } from "@/components/design-groups/AnswerPanels";
import {
  SUMMARY_LIMITS,
  summaryDigest,
  type SynthesisSummary,
} from "@/lib/synthesis-summary-shape";

// The facilitator's executive summary of a Week 3 board's first two steps — themes, the
// four answers on each, risks and opportunities — written for the group to read before it
// writes hopes and fears. Same shape as theme-label.ts: one chat call with a strict JSON
// schema, clamped in code, null on any failure so the route can answer 502.
//
// Themes are referred to by short keys (t1, t2…) in both directions, as the clustering
// tool does. The schema pins `themeId` to exactly those keys with an enum, so the model
// cannot invent a theme or lose one in the mapping back.

const MODEL = "gpt-5";

export type GeneratedSummary = Omit<SynthesisSummary, "generatedAt" | "cardCount">;

function schemaFor(keys: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      overview: {
        type: "string",
        description:
          "Across every theme, what is at stake in this future for public health and the people it serves. At most 120 words.",
      },
      themes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            themeId: { type: "string", enum: keys },
            title: { type: "string", description: "The theme's name, as the group wrote it." },
            about: { type: "string", description: "What this theme is about, in one or two sentences." },
            atStake: {
              type: "string",
              description:
                "The group's four answers condensed: who benefits, who bears a cost, who experiences it differently, what would make it happen. One to three sentences.",
            },
            risks: { type: "array", items: { type: "string" }, description: "The theme's risks, each one short sentence." },
            opportunities: { type: "array", items: { type: "string" }, description: "The theme's opportunities, each one short sentence." },
          },
          required: ["themeId", "title", "about", "atStake", "risks", "opportunities"],
        },
      },
      tensions: {
        type: "array",
        items: { type: "string" },
        description:
          "Where the group's material pulls in different directions or disagrees, across themes. Named, not resolved. Empty if none.",
      },
    },
    required: ["overview", "themes", "tensions"],
  } as const;
}

const SYSTEM =
  "You are a foresight facilitator writing an executive summary of a design group's work so far, " +
  "for people who were not in the room. The group has clustered a scenario's implications into " +
  "themes, answered four questions on each theme, and listed the risks and opportunities each " +
  "carries. Write in plain, concrete sentences, using the group's own words and examples wherever " +
  "you can. Invent nothing: say only what the material supports, and leave a field short when the " +
  "group wrote little. One theme block per theme, in the order given, referring to each by its key. " +
  "Keep risks and opportunities as the group's, condensed, not as your advice. Where the material " +
  "pulls in different directions or the group disagrees, name the tension without resolving it. " +
  "This will be read before the group writes its hopes and fears, so make what is at stake vivid " +
  "and specific — who is affected, and how.";

export async function summarizeSynthesis(
  ex: SynthesisExercise,
  scenarioTitle: string
): Promise<GeneratedSummary | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const digest = summaryDigest(ex);
  if (digest.themes.length === 0) return null;
  const keys = digest.themes.map((t) => t.key);

  try {
    const client = new OpenAI();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content:
            `Scenario: ${scenarioTitle || "(untitled)"}\n\n` +
            `The group's themes, with their answers, risks and opportunities:\n\n${digest.text}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "synthesis_summary", schema: schemaFor(keys), strict: true },
      },
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      overview?: unknown;
      themes?: unknown;
      tensions?: unknown;
    };
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const list = (v: unknown) =>
      Array.isArray(v)
        ? v
            .map((x) => str(x, SUMMARY_LIMITS.item))
            .filter(Boolean)
            .slice(0, SUMMARY_LIMITS.items)
        : [];

    const overview = str(parsed.overview, SUMMARY_LIMITS.overview);
    if (!overview) return null;
    // One block per digest theme, in digest order, whatever the model did: the schema can
    // say "themeId is one of these keys" but not "each exactly once", so a valid reply can
    // still skip a theme or name one twice. The first block for a key wins; a theme the
    // model left out gets a block that carries its title and nothing else, so the
    // facilitator sees the gap rather than a summary that quietly has fewer themes than
    // the board.
    const written = new Map<string, Record<string, unknown>>();
    for (const t of Array.isArray(parsed.themes) ? parsed.themes : []) {
      if (typeof t !== "object" || t === null) continue;
      const key = str((t as Record<string, unknown>).themeId, 16);
      if (!written.has(key)) written.set(key, t as Record<string, unknown>);
    }
    const themes = digest.themes.slice(0, SUMMARY_LIMITS.themes).map((source) => {
      const t = written.get(source.key) ?? {};
      return {
        themeId: source.themeId,
        title: str(t.title, SUMMARY_LIMITS.item) || source.title,
        about: str(t.about, SUMMARY_LIMITS.field),
        atStake: str(t.atStake, SUMMARY_LIMITS.field),
        risks: list(t.risks),
        opportunities: list(t.opportunities),
      };
    });
    return { overview, themes, tensions: list(parsed.tensions) };
  } catch (err) {
    console.error("[summarizeSynthesis]", err);
    return null;
  }
}
