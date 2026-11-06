// Reading the groups' VISION STATEMENTS against each other, and drafting one the whole
// cohort could stand behind.
//
// WHY THIS IS NOT A CLUSTERING RUN. Every other cohort reading pools tens or hundreds of
// short cards and asks which themes recur; `groupCount` then means something — one room is
// an outlier, all of them is convergence. A vision is ONE statement per group, two or three
// sentences long, so a four-group cohort pools four paragraphs. Clustering four paragraphs
// answers almost nothing: either they all land in one theme (true but empty) or they split
// four ways (an artefact of wording). The useful questions are different in kind — what do
// these four already agree on, where do they genuinely pull apart, and what single statement
// could hold both — so this is its own pass rather than a view on a clustering run.
//
// Client-safe and pure. The model call lives in unified-vision.ts.
//
// THE MODEL NEVER SEES OR RETURNS A GROUP ID. Each vision is presented under a short key
// (G1, G2, …) and attribution comes back as those keys, mapped here. Same device as
// `shortKeys` in implication-cluster.ts, and for the same two reasons: a uuid in a prompt is
// tokens spent on nothing, and a hallucinated key is caught by a lookup instead of being
// silently attributed to a real room.

import { PLAIN_WORDS_PROSE } from "./theme-guidance";
import type { CohortGroupInfo, CohortItem } from "./cohort-cluster-shape";

/** One group's vision statement, as the pass reads it. */
export interface VisionSource {
  groupId: string;
  groupName: string;
  scenarioTitle: string | null;
  text: string;
}

/** Something the visions already agree on, and which of them it was read from. */
export interface SharedCommitment {
  text: string;
  groupIds: string[];
}

/** Where the visions genuinely pull apart — not a wording difference. */
export interface VisionTension {
  text: string;
  groupIds: string[];
}

/** A unified vision the cohort could stand behind, and what it preserves. */
export interface VisionCandidate {
  text: string;
  // What this draft keeps from the places the rooms differed. A unified statement that
  // simply drops every difference is easy to write and worthless, so each candidate has to
  // say what it did with them.
  keeps: string;
}

export interface UnifiedVision {
  shared: SharedCommitment[];
  tensions: VisionTension[];
  candidates: VisionCandidate[];
  // WHAT IT READ, carried with the answer. A draft vision is the kind of output that gets
  // pasted into a deck and loses its provenance in one hop, so the statements behind it
  // travel with it and the panel shows them underneath.
  sources: VisionSource[];
  // Rooms that wrote no vision. A cohort of four where one board is blank produces a
  // "unified" vision for three, and nothing else on screen would say so.
  missing: { groupId: string; groupName: string; reason: "empty" | "missing" }[];
  model: string;
  // The prompt the facilitator substituted, or null for the default. Recorded as it was
  // ASKED, exactly as a cohort run records its own override: a reading that gets exported
  // or pasted elsewhere must never misreport what produced it.
  promptOverride: string | null;
  generatedAt: string;
}

// Clamped in code, not trusted from the model. The caps are what a facilitator can actually
// read on one screen and compare; a model asked for "a few" will sometimes return eleven.
export const MAX_SHARED = 6;
export const MAX_TENSIONS = 6;
export const MAX_CANDIDATES = 3;
const POINT_CHARS = 400;
const CANDIDATE_CHARS = 900;

/** The short key each group's vision is presented under. */
export function visionKeys(sources: VisionSource[]): {
  toShort: Map<string, string>;
  toReal: Map<string, string>;
} {
  const toShort = new Map<string, string>();
  const toReal = new Map<string, string>();
  sources.forEach((s, i) => {
    const key = `G${i + 1}`;
    toShort.set(s.groupId, key);
    toReal.set(key, s.groupId);
  });
  return { toShort, toReal };
}

/**
 * The visions a cohort actually has, plus who had none.
 *
 * Takes the pooled `aspirations` items, so the pooling rule stays in one place
 * (cohort-pool-shape) and this cannot disagree with what the picker previewed.
 *
 * A group with several answers under the vision section is JOINED rather than reduced to
 * the first: the board renders one box and an admin-added extra below it, so a second
 * answer is real content, and dropping it would quietly edit a room's vision.
 */
export function visionSources(
  items: CohortItem[],
  groups: CohortGroupInfo[]
): { sources: VisionSource[]; missing: UnifiedVision["missing"] } {
  const byGroup = new Map<string, string[]>();
  for (const item of items) {
    const text = item.text.trim();
    if (!text) continue;
    const list = byGroup.get(item.groupId);
    if (list) list.push(text);
    else byGroup.set(item.groupId, [text]);
  }

  const sources: VisionSource[] = [];
  const missing: UnifiedVision["missing"] = [];
  // In the cohort's own group order, so this lists rooms the way every other view does.
  for (const g of groups) {
    const texts = byGroup.get(g.id);
    if (!texts || texts.length === 0) {
      missing.push({
        groupId: g.id,
        groupName: g.name,
        reason: g.state === "missing" ? "missing" : "empty",
      });
      continue;
    }
    sources.push({
      groupId: g.id,
      groupName: g.name,
      scenarioTitle: g.scenarioTitle,
      text: texts.join("\n\n"),
    });
  }
  return { sources, missing };
}

const clamp = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";

/** Model-returned group keys back to real ids. Unknown keys are dropped, not guessed. */
function groupIdsFrom(raw: unknown, toReal: Map<string, string>): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const k of raw) {
    if (typeof k !== "string") continue;
    const id = toReal.get(k.trim().toUpperCase());
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * A raw model response to a checked `UnifiedVision`, or null if there is nothing usable.
 *
 * Null rather than an empty shape: "the model returned nothing we could read" and "the
 * visions have nothing in common" are different findings, and the caller reports the first
 * as a failure the facilitator can retry.
 */
export function coerceUnifiedVision(
  raw: unknown,
  args: {
    sources: VisionSource[];
    missing: UnifiedVision["missing"];
    model: string;
    promptOverride?: string | null;
  }
): UnifiedVision | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const { toReal } = visionKeys(args.sources);

  const points = (v: unknown, cap: number) =>
    (Array.isArray(v) ? v : [])
      .map((row) => {
        const o = (row ?? {}) as Record<string, unknown>;
        return { text: clamp(o.text, POINT_CHARS), groupIds: groupIdsFrom(o.group_keys, toReal) };
      })
      .filter((p) => p.text.length > 0)
      .slice(0, cap);

  const candidates = (Array.isArray(r.candidates) ? r.candidates : [])
    .map((row) => {
      const o = (row ?? {}) as Record<string, unknown>;
      return { text: clamp(o.text, CANDIDATE_CHARS), keeps: clamp(o.keeps, POINT_CHARS) };
    })
    .filter((c) => c.text.length > 0)
    .slice(0, MAX_CANDIDATES);

  const shared = points(r.shared, MAX_SHARED);
  const tensions = points(r.tensions, MAX_TENSIONS);

  // A response with no shared ground AND no candidate is not a reading of anything.
  if (shared.length === 0 && candidates.length === 0) return null;

  return {
    shared,
    tensions,
    candidates,
    sources: args.sources,
    missing: args.missing,
    model: args.model,
    promptOverride: args.promptOverride ?? null,
    generatedAt: new Date().toISOString(),
  };
}


// ---------------------------------------------------------------------------
// The system prompt
// ---------------------------------------------------------------------------
// HERE, NOT IN unified-vision.ts, because the admin can edit it and therefore has to be
// able to READ it: the editor's "Load the default" button needs the real string, and a
// second copy written for the UI would drift from the one actually sent. Same arrangement
// as composeClusterPrompt in theme-guidance.ts, which the clustering playground loads the
// same way.
//
// WHAT THE PROMPT IS ACTUALLY FOR. Asked plainly to unify four vision statements, a model
// returns their intersection — "trusted, equitable, community-centred public health" —
// which is true of all four, commits to nothing, and is exactly the "generic aspirations"
// failure the facilitator's own guidance warns about. The rooms worked DIFFERENT scenarios,
// so where they differ is usually the finding rather than noise to average away. Every
// paragraph below is holding that line, which is worth knowing before rewriting one.
export const VISION_PROMPT_PARTS = [
  "You are a foresight facilitator. Several design groups each explored a DIFFERENT " +
    "scenario of the future and each wrote one vision statement for public health in the " +
    "future they worked. You are helping the facilitator see what those visions share, " +
    "where they genuinely differ, and what single vision the whole cohort could stand " +
    "behind.",
  "THE GROUPS WORKED DIFFERENT FUTURES. A difference between two visions is therefore " +
    "evidence about which future each room was in, not a mistake to be averaged away. A " +
    "commitment that survives all of them is robust to which future actually arrives, and " +
    "that is the most valuable thing you can identify.",
  "DO NOT RETREAT TO THE INTERSECTION. 'Healthy, equitable, trusted communities' is true " +
    "of every vision ever written, commits to nothing, and is useless. Say what public " +
    "health actually BECOMES and what that makes POSSIBLE. If a commitment is only in some " +
    "of the visions, put it in the tensions rather than quietly dropping it or promoting " +
    "it to shared.",
  "A tension is a real difference in what public health becomes, who holds responsibility, " +
    "or what it is for. Two rooms using different words for the same commitment is NOT a " +
    "tension.",
  "Attribute every point with the group keys (G1, G2, …) you read it from. Use only the " +
    "keys you are given.",
  PLAIN_WORDS_PROSE,
] as const;

export const VISION_PROMPT = VISION_PROMPT_PARTS.join("\n\n");

/** The prompt to send: the facilitator's, or the default. Blank means the default. */
export function composeVisionPrompt(override?: string | null): string {
  return override?.trim() ? override.trim() : VISION_PROMPT;
}
