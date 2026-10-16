// "Two rooms said nearly the same sentence." The cross-group near-duplicate view.
//
// Pure: it takes vectors and returns pairs, so it is testable and client-safe. The caller
// embeds and centers — the same division as secondaryMemberships in
// lib/analysis/implication-cluster.ts, and for the same reason: the threshold only means
// anything in the centered space (see the anisotropy note in lib/analysis/cluster.ts).
//
// Deliberately NOT folded into clusterByEmbedding. Keeping it standalone costs one extra
// embedding request — about two seconds and a fraction of a cent — and buys the pair view
// under the LLM method too, where no embedding otherwise happens. A facilitator comparing
// the two methods should not lose a whole panel by switching.

import { cosineSimilarity, type LabeledVector } from "./cluster";

export interface CrossGroupPair {
  aId: string;
  bId: string;
  similarity: number;
}

// Starting values, to be tuned once there is real output to judge. The floor sits above
// the "tight" clustering preset (0.18) on purpose: calling two implications near-
// duplicates is a stronger claim than putting them in one theme, so it should take more
// than co-clustering would.
export const PAIR_FLOOR = 0.25;
export const MAX_PAIRS = 50;

// Every cross-group pair above the floor, closest first, capped.
//
// `vectors` must already be CENTERED. Pairs within one group are never returned: a room
// repeating itself is ordinary, two rooms arriving at the same sentence independently is
// the finding.
export function topCrossGroupPairs(
  vectors: LabeledVector[],
  groupOf: Map<string, string>,
  opts: { floor?: number; max?: number } = {}
): CrossGroupPair[] {
  const floor = opts.floor ?? PAIR_FLOOR;
  const max = opts.max ?? MAX_PAIRS;

  // A vector we cannot attribute cannot be told apart from its own group, so it is left
  // out rather than guessed at.
  const known = vectors.filter((v) => groupOf.has(v.id));
  if (known.length < 2) return [];

  const out: CrossGroupPair[] = [];
  for (let i = 0; i < known.length; i++) {
    for (let j = i + 1; j < known.length; j++) {
      if (groupOf.get(known[i].id) === groupOf.get(known[j].id)) continue;
      const similarity = cosineSimilarity(known[i].vector, known[j].vector);
      if (similarity < floor) continue;
      out.push({ aId: known[i].id, bId: known[j].id, similarity });
    }
  }

  // Closest first; ties by id so two runs over the same board read the same way.
  out.sort(
    (a, b) =>
      b.similarity - a.similarity || a.aId.localeCompare(b.aId) || a.bId.localeCompare(b.bId)
  );
  return out.slice(0, max);
}
