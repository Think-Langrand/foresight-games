import "server-only";

import OpenAI from "openai";
import { poolCohortItems } from "./cohort-pool";
import { PLAIN_WORDS_PROSE } from "./theme-guidance";
import {
  MAX_CANDIDATES,
  MAX_SHARED,
  MAX_TENSIONS,
  coerceUnifiedVision,
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
// THE PROMPT'S WHOLE JOB IS TO STOP THE MODEL FLATTENING THE DIFFERENCES. Asked plainly to
// unify four vision statements, a model returns the intersection: "Public health is trusted,
// equitable and community-centred" — true of all four, committing to nothing, and exactly
// the "generic aspirations" failure the facilitator's own guidance warns about. The rooms
// worked DIFFERENT scenarios, so where they differ is often the real finding rather than
// noise to average away. Hence the three asks are separate (shared / tensions / candidates),
// every candidate must say what it did with the tensions, and the pitfall is named.

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

function systemPrompt(): string {
  return [
    "You are a foresight facilitator. Several design groups each explored a DIFFERENT " +
      "scenario of the future and each wrote one vision statement for public health in the " +
      "future they worked. You are helping the facilitator see what those visions share, " +
      "where they genuinely differ, and what single vision the whole cohort could stand " +
      "behind.",
    "THE GROUPS WORKED DIFFERENT FUTURES. A difference between two visions is therefore " +
      "evidence about which future each room was in, not a mistake to be averaged away. A " +
      "commitment that survives all of them is robust to which future actually arrives, " +
      "and that is the most valuable thing you can identify.",
    "DO NOT RETREAT TO THE INTERSECTION. 'Healthy, equitable, trusted communities' is true " +
      "of every vision ever written, commits to nothing, and is useless. Say what public " +
      "health actually BECOMES and what that makes POSSIBLE. If a commitment is only in " +
      "some of the visions, put it in the tensions rather than quietly dropping it or " +
      "promoting it to shared.",
    "A tension is a real difference in what public health becomes, who holds " +
      "responsibility, or what it is for. Two rooms using different words for the same " +
      "commitment is NOT a tension.",
    "Attribute every point with the group keys (G1, G2, …) you read it from. Use only the " +
      "keys you are given.",
    PLAIN_WORDS_PROSE,
  ].join("\n\n");
}

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
        { role: "system", content: systemPrompt() },
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

  const vision = coerceUnifiedVision(raw, { sources, missing, model: MODEL });
  if (!vision)
    return { ok: false, status: 502, error: "The model's reading could not be understood." };
  return { ok: true, vision };
}
