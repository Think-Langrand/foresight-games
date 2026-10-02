import "server-only";

import OpenAI from "openai";
import { clusterVectors, type LabeledVector } from "./cluster";
import { mapPool } from "./suggest";
import {
  reconcileLlmGroups,
  type ImplicationClusterResponse,
  type ImplicationItem,
  type RawGroup,
  type SuggestedTheme,
} from "./implication-cluster-shape";

// Proposing themes for a design group's Week 2 implications, two ways.
//
// Neither writes anything. The output is a suggestion a facilitator reads, and the two
// methods exist side by side so they can be compared on real material before either is
// trusted enough to put cards on a board.
//
// The honest difference, which the panel repeats to the facilitator:
//   clusterByLlm       — criteria decide the grouping
//   clusterByEmbedding — cosine decides the grouping, criteria only steer the names

const CHAT_MODEL = "gpt-5";
const EMBED_MODEL = "text-embedding-3-small";
// One request per batch of inputs. A design group has tens of implications, so this is
// almost always a single call; the loop is here for the group that surprises us.
const EMBED_BATCH = 96;

// --- shared ------------------------------------------------------------------

// A group's implications are long sentences and their ids are uuids. Putting 50 uuids in
// a prompt costs tokens and invites the model to mistype one, so it sees short ordinal
// keys instead and we map back here. Anything that fails to map is left untouched so
// reconcileLlmGroups counts it as an unknown id rather than silently dropping it.
function shortKeys(items: ImplicationItem[]): {
  toShort: Map<string, string>;
  toReal: Map<string, string>;
} {
  const toShort = new Map<string, string>();
  const toReal = new Map<string, string>();
  items.forEach((item, i) => {
    const key = `i${i + 1}`;
    toShort.set(item.id, key);
    toReal.set(key, item.id);
  });
  return { toShort, toReal };
}

function base(
  method: ImplicationClusterResponse["method"],
  items: ImplicationItem[],
  criteria: string | null,
  model: string
) {
  return {
    method,
    criteria: criteria || null,
    items,
    model,
    generatedAt: new Date().toISOString(),
  };
}

// --- method 1: one model call, criteria drive the grouping -------------------

const GROUPS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    groups: {
      type: "array",
      description: "The themes. Every implication should appear in exactly one.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: {
            type: "string",
            description:
              "The theme, phrased as a statement about change (e.g. 'Responsibility moves " +
              "to communities faster than resources do'), not a topic label.",
          },
          summary: { type: "string", description: "One sentence on what these share." },
          member_ids: {
            type: "array",
            description: "The ids of the implications in this theme, exactly as given.",
            items: { type: "string" },
          },
        },
        required: ["label", "summary", "member_ids"],
      },
    },
  },
  required: ["groups"],
} as const;

export async function clusterByLlm(
  items: ImplicationItem[],
  criteria: string | null
): Promise<ImplicationClusterResponse | null> {
  if (!process.env.OPENAI_API_KEY || items.length === 0) return null;
  const { toShort, toReal } = shortKeys(items);

  // The key change each implication came from is included deliberately: it is real context
  // for grouping, and it is also the thing a facilitator most often wants to cut ACROSS
  // ("don't just regroup by key change"), which they can only ask for if the model can see it.
  const digest = items
    .map((it) => `${toShort.get(it.id)}: ${it.text} [from key change: ${it.keyChange}]`)
    .join("\n");

  try {
    const client = new OpenAI();
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a foresight facilitator preparing a workshop. A group mapped out the " +
            "implications of a future scenario; your job is to propose how those implications " +
            "could be clustered into themes, so the group has somewhere to start rather than a " +
            "blank board.\n\n" +
            "Name each theme as a STATEMENT ABOUT CHANGE — 'Responsibility moves to communities " +
            "faster than resources do', not 'Community capacity'. Put every implication in " +
            "exactly one theme, and use the ids exactly as given. Aim for 3-6 themes unless the " +
            "facilitator's criteria say otherwise. These are suggestions a group will argue " +
            "with, so prefer a cut that is interesting and arguable over one that is safe.",
        },
        {
          role: "user",
          content:
            (criteria?.trim()
              ? `The facilitator asks you to group them this way:\n${criteria.trim()}\n\n`
              : "") + `Implications:\n${digest}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "implication_groups", schema: GROUPS_SCHEMA, strict: true },
      },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { groups?: unknown };
    const groups: RawGroup[] = Array.isArray(parsed.groups) ? (parsed.groups as RawGroup[]) : [];

    // Short keys back to real ids before anything is checked against the board.
    const translated: RawGroup[] = groups.map((g) => ({
      ...g,
      member_ids: Array.isArray(g.member_ids)
        ? g.member_ids.map((k) => (typeof k === "string" ? (toReal.get(k) ?? k) : k))
        : g.member_ids,
    }));

    const { themes, ungrouped, notes } = reconcileLlmGroups(items, translated);
    return {
      ...base("llm", items, criteria, CHAT_MODEL),
      minSimilarity: null,
      themes,
      ungrouped,
      notes,
    };
  } catch (err) {
    console.error("[clusterByLlm]", err);
    return null;
  }
}

// --- method 2: cosine clustering, model only names the groups ----------------

// No cache this round. The kernel cache is keyed on team_id with an FK to public.teams, so
// implications cannot ride it without a migration, and a design group is tens of short
// sentences — one request, well under a second. Worth caching only if this gets used on
// something much larger.
async function embedImplications(items: ImplicationItem[]): Promise<LabeledVector[]> {
  const client = new OpenAI();
  const out: LabeledVector[] = [];
  for (let i = 0; i < items.length; i += EMBED_BATCH) {
    const batch = items.slice(i, i + EMBED_BATCH);
    const res = await client.embeddings.create({
      model: EMBED_MODEL,
      // The implication text ALONE. Including its key change would put the same string in
      // every sibling's vector and pull the clustering back towards the Week 2 structure —
      // which is exactly the grouping this is meant to offer an alternative to.
      input: batch.map((b) => b.text),
    });
    res.data.forEach((d, n) => {
      out.push({ id: batch[n].id, vector: d.embedding as number[] });
    });
  }
  return out;
}

async function labelImplicationCluster(
  members: ImplicationItem[],
  criteria: string | null
): Promise<{ label: string; summary: string } | null> {
  if (!process.env.OPENAI_API_KEY || members.length === 0) return null;
  const digest = members
    .slice(0, 10)
    .map((m) => `• ${m.text}`)
    .join("\n")
    .slice(0, 4000);

  try {
    const client = new OpenAI();
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a foresight facilitator naming a cluster of scenario implications that an " +
            "embedding model grouped together. Name the theme as a STATEMENT ABOUT CHANGE " +
            "(e.g. 'Responsibility moves to communities faster than resources do'), not a topic " +
            "label, and write one sentence on what these implications share. Name what is " +
            "common across them, not any single one." +
            (criteria?.trim() ? `\n\nThe facilitator asks: ${criteria.trim()}` : ""),
        },
        { role: "user", content: `Implications in this cluster:\n${digest}` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "theme_label",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: { label: { type: "string" }, summary: { type: "string" } },
            required: ["label", "summary"],
          },
          strict: true,
        },
      },
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      label?: string;
      summary?: string;
    };
    const label = (parsed.label ?? "").trim().slice(0, 80);
    if (!label) return null;
    return { label, summary: (parsed.summary ?? "").trim().slice(0, 240) };
  } catch (err) {
    console.error("[labelImplicationCluster]", err);
    return null;
  }
}

export async function clusterByEmbedding(
  items: ImplicationItem[],
  opts: { minSimilarity?: number; criteria?: string | null } = {}
): Promise<ImplicationClusterResponse | null> {
  if (!process.env.OPENAI_API_KEY || items.length === 0) return null;
  const criteria = opts.criteria ?? null;
  const byId = new Map(items.map((i) => [i.id, i]));
  const notes: string[] = [];

  try {
    const vectors = await embedImplications(items);
    if (vectors.length < items.length) {
      notes.push(`${items.length - vectors.length} implications could not be embedded.`);
    }
    const clusters = clusterVectors(vectors, { center: true, minSimilarity: opts.minSimilarity });

    // Singletons get no LLM call — naming a cluster of one is just restating it, and it
    // would be one request per loose card.
    const multi = clusters.filter((c) => c.size > 1);
    const labels = await mapPool(multi, 3, (c) =>
      labelImplicationCluster(
        c.ids.map((id) => byId.get(id)).filter((x): x is ImplicationItem => Boolean(x)),
        criteria
      )
    );
    const unnamed = labels.filter((l) => l === null).length;
    if (unnamed > 0) notes.push(`${unnamed} cluster${unnamed === 1 ? "" : "s"} could not be named.`);

    const themes: SuggestedTheme[] = multi.map((c, i) => ({
      label: labels[i]?.label ?? "Unnamed group",
      summary: labels[i]?.summary ?? null,
      memberIds: c.ids,
      cohesion: c.cohesion,
    }));

    // Every id clusterVectors returned as a singleton, plus anything that failed to embed.
    const placed = new Set(themes.flatMap((t) => t.memberIds));
    const ungrouped = items.filter((i) => !placed.has(i.id)).map((i) => i.id);
    if (ungrouped.length > 0) {
      notes.push(
        `${ungrouped.length} implication${ungrouped.length === 1 ? "" : "s"} did not join a group at this setting.`
      );
    }

    return {
      ...base("embedding", items, criteria, `${EMBED_MODEL} + ${CHAT_MODEL}`),
      minSimilarity: opts.minSimilarity ?? null,
      themes,
      ungrouped,
      notes,
    };
  } catch (err) {
    console.error("[clusterByEmbedding]", err);
    return null;
  }
}
