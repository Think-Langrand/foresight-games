import "server-only";

import OpenAI from "openai";
import { updateTeam } from "@/lib/teams";
import type { Team } from "@/lib/workshop-types";

// Server-side LLM tagging, shared by the single-suggest route, the bulk route,
// and the auto-tag-on-submit hook. Uses OpenAI GPT-5 with a strict JSON schema so
// the response always validates. Best-effort throughout: any failure returns
// null rather than throwing, so tagging never blocks the caller's real work.

const MODEL = "gpt-5";

const FAMILY_HINTS = [
  "Localized trust",
  "Corporate & consumer capture",
  "Renewal & civic",
  "Epistemic collapse",
  "Authoritarian data",
];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tone: { type: "string", enum: ["hopeful", "dark"] },
    family: { type: "string", description: "Short scenario-family label (2-4 words)." },
  },
  required: ["tone", "family"],
} as const;

const NARRATIVE_KEYS = [
  "convergence",
  "definingCharacteristics",
  "centralTension",
  "newNormal",
  "brokenAssumption",
] as const;

export type NarrativeInput = Partial<Record<(typeof NARRATIVE_KEYS)[number], string>>;

export interface SuggestedTags {
  tone: "hopeful" | "dark";
  family: string;
}

export function llmConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function narrativeText(input: NarrativeInput): string {
  return NARRATIVE_KEYS.map((k) => {
    const v = (input[k] ?? "").trim();
    return v ? `${k}: ${v}` : null;
  })
    .filter(Boolean)
    .join("\n");
}

/** One GPT-5 classification. Returns null if unconfigured, empty, or on error. */
export async function suggestTags(input: NarrativeInput): Promise<SuggestedTags | null> {
  if (!llmConfigured()) return null;
  const narrative = narrativeText(input);
  if (!narrative) return null;

  try {
    const client = new OpenAI();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a foresight facilitator classifying a submitted scenario 'kernel'. " +
            "Judge its overall TONE — 'hopeful' (constructive, restorative, optimistic) or " +
            "'dark' (dystopian, extractive, declining) — and assign a short scenario FAMILY " +
            "label grouping worlds by their central pattern. Prefer one of these families when " +
            `it fits: ${FAMILY_HINTS.join(", ")}. Otherwise coin a concise 2-4 word label.`,
        },
        { role: "user", content: `Scenario narrative:\n${narrative}` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "kernel_tags", schema: SCHEMA, strict: true },
      },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { tone?: string; family?: string };
    if (parsed.tone !== "hopeful" && parsed.tone !== "dark") return null;
    return { tone: parsed.tone, family: (parsed.family ?? "").trim().slice(0, 80) };
  } catch (err) {
    console.error("[suggestTags]", err);
    return null;
  }
}

/**
 * Suggest and SAVE tags for a team, but only if it is currently untagged — never
 * overwrites a facilitator's manual call. Returns the saved tags, or null if
 * nothing was written (already tagged, no narrative, LLM off, or error).
 */
export async function autoTagTeam(
  team: Pick<Team, "id" | "tone"> & NarrativeInput
): Promise<SuggestedTags | null> {
  if (team.tone) return null; // respect existing facilitator tags
  const tags = await suggestTags(team);
  if (!tags) return null;
  try {
    await updateTeam(team.id, "", { tone: tags.tone, family: tags.family });
    return tags;
  } catch (err) {
    console.error("[autoTagTeam] save failed", err);
    return null;
  }
}

/** Run `worker` over `items` with a bounded number in flight at once. */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}
