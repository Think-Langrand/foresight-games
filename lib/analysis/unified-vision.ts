import "server-only";

import OpenAI from "openai";
import { poolCohortItems } from "./cohort-pool";
import {
  MAX_CANDIDATES,
  MAX_SHARED,
  MAX_TENSIONS,
  coerceUnifiedVision,
  composeVisionPrompt,
  visionKeys,
  visionSources,
  type UnifiedVision,
  type VisionSource,
} from "./unified-vision-shape";

// Drafting one vision from the groups' several. One chat call with a strict JSON schema,
// clamped in unified-vision-shape, failures returned as a status rather than thrown — the
// same shape as cohort-narrative.ts and synthesis-summary.ts beside it.
//
// READ-ONLY, like every other admin analysis route: nothing here writes a card, a config
// key or a row. A facilitator can run it as many times as they like and nothing on any
// board changes, which is what makes it safe to run on real group material mid-session.
//
// THE PROMPT LIVES IN unified-vision-shape.ts, not here, because a facilitator can replace
// it from the panel and therefore has to be able to read it — see the note there on what
// every paragraph of it is holding the line against. The SCHEMA stays here and is not
// overridable: it is the response contract this module parses, and the clustering route
// draws the same line.

const MODEL = "gpt-5";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    shared: {
      type: "array",
      description: `At most ${MAX_SHARED} things these visions already agree on. Say the commitment, not the topic.`,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string", description: "One sentence naming what they share." },
          group_keys: {
            type: "array",
            description: "The keys (G1, G2, …) whose vision this was read from.",
            items: { type: "string" },
          },
        },
        required: ["text", "group_keys"],
      },
    },
    tensions: {
      type: "array",
      description: `At most ${MAX_TENSIONS} places where these visions genuinely pull apart — a real difference in what public health becomes or who acts, NOT a difference in wording.`,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string", description: "One sentence naming the difference." },
          group_keys: {
            type: "array",
            description: "The keys whose visions sit on the different sides of it.",
            items: { type: "string" },
          },
        },
        required: ["text", "group_keys"],
      },
    },
    candidates: {
      type: "array",
      description: `Exactly ${MAX_CANDIDATES} candidate unified visions, each a genuinely different way of holding these statements together — not three rewordings of one.`,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: {
            type: "string",
            description:
              "Two or three sentences describing what public health becomes and what that makes possible for communities. Written to be read aloud to the whole cohort.",
          },
          keeps: {
            type: "string",
            description:
              "One sentence on what this draft does with the tensions above — which difference it keeps, and which it sets aside.",
          },
        },
        required: ["text", "keeps"],
      },
    },
  },
  required: ["shared", "tensions", "candidates"],
} as const;

function userPrompt(sources: VisionSource[], criteria: string | null): string {
  const { toShort } = visionKeys(sources);
  const digest = sources
    .map((s) => {
      const key = toShort.get(s.groupId);
      const scenario = s.scenarioTitle ? ` — scenario: ${s.scenarioTitle}` : "";
      return `${key} (${s.groupName}${scenario}):\n${s.text}`;
    })
    .join("\n\n");
  return [
    criteria?.trim() ? `The facilitator asks you to pay attention to:\n${criteria.trim()}` : null,
    `There are ${sources.length} vision statements.`,
    digest,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface UnifiedVisionArgs {
  projectId: string;
  criteria?: string | null;
  // Replaces the whole system prompt. Blank or absent means the default.
  promptOverride?: string | null;
  weekSort?: number;
  groupIds?: string[];
}

export type UnifiedVisionResult =
  | { ok: true; vision: UnifiedVision }
  | { ok: false; status: number; error: string };

export async function draftUnifiedVision(
  args: UnifiedVisionArgs
): Promise<UnifiedVisionResult> {
  // Pooled through the ordinary path, so what this reads is exactly what the picker
  // previewed for the Vision statements source.
  const pool = await poolCohortItems(args.projectId, {
    source: "aspirations",
    weekSort: args.weekSort,
    groupIds: args.groupIds,
  });

  if (!pool.week)
    return {
      ok: false,
      status: 400,
      error: "No group in this project has a Session 4 week that could hold a vision.",
    };

  const { sources, missing } = visionSources(pool.items, pool.groups);

  // TWO is the floor, because one statement cannot be read against anything — there is no
  // shared ground and no tension in a single vision, only the vision.
  if (sources.length < 2) {
    const blank = missing.map((m) => m.groupName);
    return {
      ok: false,
      status: 400,
      error:
        `Only ${sources.length} group${sources.length === 1 ? "" : "s"} has written a vision at ` +
        `${pool.week.title}, so there is nothing to read them against` +
        (blank.length > 0 ? ` (nothing yet from: ${blank.join(", ")})` : "") +
        ".",
    };
  }

  let raw: unknown;
  try {
    const client = new OpenAI();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: composeVisionPrompt(args.promptOverride) },
        { role: "user", content: userPrompt(sources, args.criteria ?? null) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "unified_vision", schema: SCHEMA, strict: true },
      },
    });
    raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  } catch (err) {
    console.error("[draftUnifiedVision]", err);
    return { ok: false, status: 502, error: "The model did not return a reading." };
  }

  const vision = coerceUnifiedVision(raw, {
    sources,
    missing,
    model: MODEL,
    promptOverride: args.promptOverride?.trim() || null,
  });
  if (!vision)
    return { ok: false, status: 502, error: "The model's reading could not be understood." };
  return { ok: true, vision };
}
