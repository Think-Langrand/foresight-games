import "server-only";

import OpenAI from "openai";
import type { KernelEntry } from "./types";

// Best-effort LLM naming for a cluster of kernels. Given the worlds grouped into
// one theme, coin a short label and a one-line description of what they share.
// Returns null on any failure so clustering still renders unlabeled.

const MODEL = "gpt-5";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string", description: "A 2-5 word theme name for this cluster of futures." },
    summary: {
      type: "string",
      description: "One sentence naming the pattern these worlds share.",
    },
  },
  required: ["label", "summary"],
} as const;

export interface ThemeLabel {
  label: string;
  summary: string;
}

// Compact digest of one member for the prompt: title + the two most telling
// narrative fields, trimmed so a big cluster stays within a sane token budget.
function memberDigest(entry: KernelEntry): string {
  const title = (entry.worldTitle ?? "").trim() || "(untitled)";
  const tension = (entry.centralTension ?? "").trim();
  const normal = (entry.newNormal ?? "").trim();
  const bits = [tension && `tension: ${tension}`, normal && `new normal: ${normal}`]
    .filter(Boolean)
    .join("; ");
  return bits ? `• ${title} — ${bits}` : `• ${title}`;
}

export async function labelCluster(members: KernelEntry[]): Promise<ThemeLabel | null> {
  if (!process.env.OPENAI_API_KEY || members.length === 0) return null;
  // Cap the digest at a handful of members — enough to name the theme without
  // ballooning the prompt on a large cluster.
  const digest = members.slice(0, 8).map(memberDigest).join("\n").slice(0, 4000);

  try {
    const client = new OpenAI();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a foresight facilitator naming a cluster of submitted scenario 'kernels' " +
            "that an embedding model grouped together. Coin a short, evocative THEME label " +
            "(2-5 words) and a one-sentence SUMMARY of the pattern these futures share. Name " +
            "what is common across them, not any single world.",
        },
        { role: "user", content: `Worlds in this cluster:\n${digest}` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "theme_label", schema: SCHEMA, strict: true },
      },
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { label?: string; summary?: string };
    const label = (parsed.label ?? "").trim().slice(0, 80);
    const summary = (parsed.summary ?? "").trim().slice(0, 240);
    if (!label) return null;
    return { label, summary };
  } catch (err) {
    console.error("[labelCluster]", err);
    return null;
  }
}
