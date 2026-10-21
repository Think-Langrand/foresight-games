import "server-only";

import OpenAI from "openai";
import { centerVectors, clusterVectors, type LabeledVector } from "./cluster";
import {
  GROUPING_GUIDANCE,
  NAME_SHAPE,
  PLAIN_WORDS,
  composeClusterPrompt,
  IMPLICATION_MATERIAL,
  type PoolMaterial,
} from "./theme-guidance";
import { mapPool } from "./suggest";
import {
  GROUPING_PRESETS,
  SUGGESTED_LABEL_MAX,
  SUGGESTED_SUMMARY_MAX,
  rankByCentroid,
  reconcileLlmGroups,
  secondaryMemberships,
  type ImplicationClusterResponse,
  type ImplicationItem,
  type RawGroup,
  type SimilarResponse,
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
      description:
        "The themes. An implication may appear in several, or in none if it is an outlier.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: {
            type: "string",
            description:
              "The theme, phrased as a statement about change (e.g. 'Responsibility moves " +
              "to communities faster than resources do'), not a topic label. At most 12 " +
              "words, a single clause, no trailing list of consequences.",
          },
          summary: {
            type: "string",
            description:
              "One sentence on what these share — this is where what the shift leads to, " +
              "who it affects and what it puts at risk belong, not in the label.",
          },
          member_ids: {
            type: "array",
            description:
              "The ids of the implications in this theme, exactly as given. The same id may " +
              "also appear in another theme if it genuinely belongs to both.",
            items: { type: "string" },
          },
        },
        required: ["label", "summary", "member_ids"],
      },
    },
  },
  required: ["groups"],
} as const;

// How the one grouping call is framed. Every field is optional and every default
// reproduces the original single-group behaviour exactly, so the per-group route and the
// board's rail are unaffected by the cohort work.
export interface LlmClusterOpts {
  // "A group mapped out the implications" is wrong for a pooled cohort run.
  framing?: "group" | "cohort";
  // Replaces the system prompt outright — the admin playground's main lever.
  promptOverride?: string;
  // Per-item context appended to its digest line (the group it came from, say).
  // Omitted by default, which is the blind run: if the model cannot see which room an
  // implication came from, a theme spanning five rooms is a finding rather than something
  // it was steered towards.
  tagOf?: (item: ImplicationItem) => string | null;
  // Shared context before the list, e.g. the project and the scenarios in play.
  preamble?: string | null;
  // WHAT is being clustered. Defaults to implications, which reproduces the original
  // prompt to the byte; a cohort run over Session 3 risks or fears passes its own.
  material?: PoolMaterial;
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export async function clusterByLlm(
  items: ImplicationItem[],
  criteria: string | null,
  opts: LlmClusterOpts = {}
): Promise<ImplicationClusterResponse | null> {
  if (!process.env.OPENAI_API_KEY || items.length === 0) return null;
  const material = opts.material ?? IMPLICATION_MATERIAL;
  const { toShort, toReal } = shortKeys(items);

  // The key change each implication came from is included deliberately: it is real context
  // for grouping, and it is also the thing a facilitator most often wants to cut ACROSS
  // ("don't just regroup by key change"), which they can only ask for if the model can see it.
  const digest = items
    .map((it) => {
      const tag = opts.tagOf?.(it);
      return (
        `${toShort.get(it.id)}: ${it.text}` +
        (it.keyChange ? ` [from ${material.context}: ${it.keyChange}` + `${tag ? `; ${tag}` : ""}]` : tag ? ` [${tag}]` : "")
      );
    })
    .join("\n");

  try {
    const client = new OpenAI();
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content:
            opts.promptOverride?.trim() ||
            composeClusterPrompt(opts.framing === "cohort" ? "cohort" : "group", material),
        },
        {
          role: "user",
          content:
            (opts.preamble?.trim() ? `${opts.preamble.trim()}\n\n` : "") +
            (criteria?.trim()
              ? `The facilitator asks you to group them this way:\n${criteria.trim()}\n\n`
              : "") + `${capitalize(material.plural)}:\n${digest}`,
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
export async function embedImplications(items: ImplicationItem[]): Promise<LabeledVector[]> {
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
            "common across them, not any single one.\n\n" +
            NAME_SHAPE +
            "\n\n" +
            GROUPING_GUIDANCE +
            "\n\n" +
            PLAIN_WORDS +
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
    const label = (parsed.label ?? "").trim().slice(0, SUGGESTED_LABEL_MAX);
    if (!label) return null;
    return { label, summary: (parsed.summary ?? "").trim().slice(0, SUGGESTED_SUMMARY_MAX) };
  } catch (err) {
    console.error("[labelImplicationCluster]", err);
    return null;
  }
}

export async function clusterByEmbedding(
  items: ImplicationItem[],
  opts: {
    minSimilarity?: number;
    criteria?: string | null;
    // Whether to also file each implication under any OTHER theme it fits (see
    // secondaryMemberships). Default true — what a single group's board wants, where a
    // bridging implication is usually the interesting one in the room.
    //
    // Measured reason it is now optional: on a 269-implication cohort pool this added
    // between 268 and 1008 extra placements depending on threshold, which put cards from
    // every group into every theme and flattened "how many rooms raised this" to the
    // number of rooms in the run. That ratio is the whole point of a cohort grid, so the
    // cohort path turns bridging off by default and offers it as a control.
    bridging?: boolean;
    // Vectors for exactly these items, already embedded by the caller. Lets a caller that
    // needs the vectors for something else of its own — the cohort run computes
    // cross-group near-duplicate pairs from them — pay for one embedding request instead
    // of two over the identical list. Omitted, this embeds them itself as before.
    vectors?: LabeledVector[];
  } = {}
): Promise<ImplicationClusterResponse | null> {
  if (!process.env.OPENAI_API_KEY || items.length === 0) return null;
  const criteria = opts.criteria ?? null;
  const byId = new Map(items.map((i) => [i.id, i]));
  const notes: string[] = [];

  try {
    const vectors = opts.vectors ?? (await embedImplications(items));
    if (vectors.length < items.length) {
      notes.push(`${items.length - vectors.length} implications could not be embedded.`);
    }
    // Matches what the panel's "Balanced" preset sends, so an unset value behaves as the
    // default the facilitator would otherwise have picked.
    const minSim =
      opts.minSimilarity ??
      (GROUPING_PRESETS.find((p) => p.key === "balanced")?.minSimilarity ?? 0.1);
    const clusters = clusterVectors(vectors, { center: true, minSimilarity: minSim });

    // Singletons get no LLM call — naming a cluster of one is just restating it, and it
    // would be one request per loose card.
    const multi = clusters.filter((c) => c.size > 1);

    // Agglomerative clustering is partitional, so on its own it can never put an
    // implication in two themes. Centered, because that is the space the threshold was
    // tuned in and the space clusterVectors just worked in.
    const centered = centerVectors(vectors);
    const extras =
      opts.bridging === false
        ? multi.map(() => [] as string[])
        : secondaryMemberships(multi, centered, minSim);
    const bridged = extras.reduce((n, e) => n + e.length, 0);
    if (bridged > 0) {
      notes.push(`${bridged} implication placement${bridged === 1 ? "" : "s"} are cards that also fit a second theme.`);
    }
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
      // Core members first, then the ones that also fit — so a theme still reads as the
      // thing the clustering actually found.
      memberIds: [...c.ids, ...extras[i]],
      // Cohesion describes the core cluster, which is what it was computed from.
      cohesion: c.cohesion,
    }));

    // Outliers: everything no theme took, which is a legitimate answer rather than a
    // failure — a loose implication is worth seeing as loose.
    const placed = new Set(themes.flatMap((t) => t.memberIds));
    const ungrouped = items.filter((i) => !placed.has(i.id)).map((i) => i.id);

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

// --- "what else could join this theme?" ------------------------------------------

// Rank the rest of a board against one theme's members. Embeds the WHOLE board rather than
// only the ids asked about, so the centering happens in the same space the clustering
// presets were tuned in (see cluster.ts on anisotropy); a board is tens of short sentences,
// so that is still one request. Members and candidates the board does not have, or that
// did not come back embedded, are reported as skipped rather than silently dropped.
export async function rankSimilarImplications(
  items: ImplicationItem[],
  memberIds: string[],
  candidateIds: string[]
): Promise<SimilarResponse | null> {
  if (!process.env.OPENAI_API_KEY || items.length === 0) return null;
  try {
    const centered = centerVectors(await embedImplications(items));
    const byId = new Map(centered.map((v) => [v.id, v]));
    const pick = (ids: string[]) =>
      ids.map((id) => byId.get(id)).filter((v): v is LabeledVector => Boolean(v));
    const members = pick(memberIds);
    const candidates = pick(candidateIds);
    const skipped = [...memberIds, ...candidateIds].filter((id) => !byId.has(id));
    return { ranked: rankByCentroid(members, candidates), skipped, model: EMBED_MODEL };
  } catch (err) {
    console.error("[rankSimilarImplications]", err);
    return null;
  }
}
