// Client-safe shape of the theme NAMES a facilitator has saved for a group to read during
// Week 3's clustering step. No runtime imports: lib/ripples-types imports coerceThemeIdeas,
// and anything imported here at runtime would close a cycle back into it.
//
// Stored on the board's session config (sessions.config.themeIdeas), which is in the realtime
// publication — so a facilitator saving a name is enough for every member to see it land.
// Same mechanism as sessions.config.summary (lib/synthesis-summary-shape.ts).
//
// WHY THERE ARE NO MEMBER IDS HERE. lib/ripples.ts puts resolveConfig(session.config) into
// the /ripples payload that EVERY member's board fetches, so anything in this shape is in
// every participant's JavaScript whatever the UI chooses to draw. "Participants see the names
// and not what is in them" is therefore enforced by this type, not by the render path — and
// the one-line summary the clustering also produces is left out for the same reason. Adding
// either "for later" would leak the facilitator's grouping into every member's devtools.

import type { ClusterMethod } from "@/lib/analysis/implication-cluster-shape";

export interface ThemeIdea {
  // Minted server-side. The ✕'s removal target and the list's React key; a name is not an
  // id because two runs can propose near-identical wording.
  id: string;
  name: string;
  // What decided the grouping. The provenance line shown to participants is derived from
  // this, which is why an entry carrying an unrecognised method is dropped rather than kept.
  method: ClusterMethod;
  savedAt: string; // ISO
}

// The name cap was the card's own when CARD_TEXT_MAX was 500. That constant was raised to
// 4000 for Session 4's prose answers and this did not follow: a saved theme name is a
// label, and 500 was never the binding limit on one. The count cap is a reading limit, not
// a storage one: twelve names is already more than a participant will read, and the panel must
// not become a wall of text as runs accumulate.
export const THEME_IDEA_LIMITS = { name: 500, count: 12 } as const;

// Two names are the same idea if they differ only in case or whitespace. It catches the
// double-click and the overlapping re-run; it does NOT catch "Trust moves to communities"
// against "Trust moves to local communities", and nothing cheap would — that is what the ✕ is
// for, and why per-entry removal is a requirement rather than a nicety.
export function normalizeIdeaName(s: string): string {
  return (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isMethod(v: unknown): v is ClusterMethod {
  // Checked inline rather than through isClusterMethod: importing that module at runtime
  // would close the cycle described at the top of this file.
  return v === "llm" || v === "embedding";
}

// Whatever is actually in the column, read as a list of ideas. Tolerant by necessity — the
// config blob is free-form JSON written by more than one route, and a malformed entry must
// cost that entry rather than the whole panel.
export function coerceThemeIdeas(raw: unknown): ThemeIdea[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ThemeIdea[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const name = typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim() : "";
    // No id means the ✕ would have nothing to remove; no name means nothing to show.
    if (!id || !name || !isMethod(r.method)) continue;
    const key = normalizeIdeaName(name);
    if (seen.has(key)) continue; // earliest wins
    seen.add(key);
    out.push({
      id,
      name: name.slice(0, THEME_IDEA_LIMITS.name),
      method: r.method,
      savedAt: typeof r.savedAt === "string" ? r.savedAt : "",
    });
    if (out.length >= THEME_IDEA_LIMITS.count) break;
  }
  return out;
}

// Add to what is saved. Append-only and computed over a FRESH read server-side, which is what
// makes the realistic race safe: "save from run A, then save from run B on a client that has
// not yet heard about A" loses A by construction under a put-the-whole-list API, every time,
// with no timing coincidence needed.
//
// `overflow` is reported rather than silently truncated — a facilitator who ticked fifteen
// names should be told twelve is the limit, not left to count what landed.
export function appendThemeIdeas(
  existing: ThemeIdea[],
  incoming: ThemeIdea[]
): { ideas: ThemeIdea[]; added: number; duplicates: number; overflow: number } {
  const ideas = [...existing];
  const seen = new Set(ideas.map((i) => normalizeIdeaName(i.name)));
  let added = 0;
  let duplicates = 0;
  let overflow = 0;

  for (const candidate of incoming) {
    const name = (candidate.name ?? "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = normalizeIdeaName(name);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    if (ideas.length >= THEME_IDEA_LIMITS.count) {
      overflow += 1;
      continue;
    }
    seen.add(key);
    ideas.push({ ...candidate, name: name.slice(0, THEME_IDEA_LIMITS.name) });
    added += 1;
  }
  return { ideas, added, duplicates, overflow };
}

// A miss is a no-op, not an error: a retry after a timeout must not surface a failure for work
// that already landed.
export function removeThemeIdea(existing: ThemeIdea[], id: string): ThemeIdea[] {
  return existing.filter((i) => i.id !== id);
}

// How the saved names were arrived at, as a clause that completes "compiled using …".
//
// NOT k-means, which is the guess everyone makes. lib/analysis/cluster.ts is UPGMA
// average-linkage agglomerative clustering over OpenAI embeddings — a hierarchical method.
// The difference is not pedantic: k-means needs the number of clusters up front, while this
// discovers it by merging the closest pair until the best remaining merge falls below a
// similarity threshold. That is why the presets are broad/balanced/tight and not "give me
// five themes", and it is the kind of thing a public-health audience with researchers in it
// will notice.
//
// The model path has no algorithm at all — it read every implication and decided — so the
// clause has to follow the method rather than being one fixed sentence. A mixed list says
// both and does not tag which name came from which: clutter at participant altitude, and it
// invites a question with no useful answer.
export function ideaProvenance(ideas: ThemeIdea[]): string {
  if (ideas.length === 0) return "";
  const methods = new Set(ideas.map((i) => i.method));
  if (methods.size > 1) {
    return "both hierarchical clustering and a model reading all of them";
  }
  return methods.has("llm")
    ? "a model that read every implication and grouped them"
    : "hierarchical clustering, which groups implications with similar wording";
}
