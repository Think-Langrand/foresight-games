// Agglomerative clustering over embedding vectors (Tier 2 of the Analysis view).
//
// Pure and deterministic: given labelled vectors, group the ones that sit close
// together in embedding space into "themes". No I/O, no LLM, no store — the
// vectors are produced upstream (lib/analysis/embeddings.ts) and cached, so all
// this file does is the linear-algebra + tree-cutting, which is cheap at the
// workshop's scale (tens to low hundreds of kernels).
//
// Method: UPGMA average-linkage agglomerative clustering. We merge the two
// closest clusters repeatedly, where "closest" means the highest *average*
// cosine similarity across every cross-cluster pair, and stop once even the best
// remaining merge falls below `minSimilarity`. Average linkage (rather than
// single) resists the chaining that would otherwise let one bridging kernel
// collapse two distinct themes into one blob — the same failure mode the
// near-duplicate detector guards against with its structural signal.

export interface LabeledVector {
  id: string;
  vector: number[];
}

export interface Cluster {
  ids: string[];
  size: number;
  // Mean intra-cluster cosine similarity — a rough cohesion score in [0,1].
  // 1 for singletons (nothing to compare against).
  cohesion: number;
}

export interface ClusterOptions {
  // Stop merging once the best average-linkage similarity drops below this.
  // The value lives in whatever space the vectors are in — see `center`.
  minSimilarity?: number;
  // Mean-center the vectors before measuring similarity. OpenAI embeddings are
  // strongly anisotropic: a topical corpus (every kernel is a "future of public
  // health" world) piles into a narrow high-cosine band — raw similarities sit
  // ~0.36–0.74 with no usable gap, so any single threshold either merges
  // everything or nothing. Subtracting the corpus centroid removes that shared
  // component and spreads similarities around zero, where real themes separate
  // cleanly. When centering, minSimilarity is a CENTERED cosine (~0.03 broad,
  // ~0.18 tight), not a raw one.
  center?: boolean;
}

// Centered-cosine default (see `center`): a mid "balanced" grouping.
const DEFAULT_MIN_SIMILARITY = 0.1;

// Subtract the corpus centroid from every vector.
export function centerVectors(points: LabeledVector[]): LabeledVector[] {
  if (points.length === 0) return [];
  const dim = points[0].vector.length;
  const mean = new Array(dim).fill(0);
  for (const p of points) {
    for (let i = 0; i < dim; i++) mean[i] += p.vector[i] / points.length;
  }
  return points.map((p) => ({ id: p.id, vector: p.vector.map((x, i) => x - mean[i]) }));
}

/** Cosine similarity of two equal-length vectors. Returns 0 if either is zero. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Mean pairwise cosine similarity within a set of member indices.
function meanIntraSimilarity(members: number[], sim: number[][]): number {
  if (members.length < 2) return 1;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      total += sim[members[i]][members[j]];
      pairs++;
    }
  }
  return pairs === 0 ? 1 : total / pairs;
}

/**
 * Cluster labelled vectors into themes. Deterministic: the input order fully
 * decides tie-breaks. Every input id lands in exactly one returned cluster
 * (singletons included), and clusters come back largest-first.
 */
export function clusterVectors(
  points: LabeledVector[],
  opts: ClusterOptions = {}
): Cluster[] {
  const minSimilarity = opts.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) {
    return [{ ids: [points[0].id], size: 1, cohesion: 1 }];
  }
  // Optionally de-anisotropize before measuring anything (see ClusterOptions).
  const pts = opts.center ? centerVectors(points) : points;

  // Pairwise similarity matrix over the (possibly centered) points; also the
  // basis for each cluster's cohesion score.
  const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    sim[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const s = cosineSimilarity(pts[i].vector, pts[j].vector);
      sim[i][j] = s;
      sim[j][i] = s;
    }
  }

  // Active clusters, each carrying its member indices. `link[a][b]` holds the
  // current average-linkage similarity between clusters a and b, updated in
  // place via the Lance–Williams recurrence for UPGMA as clusters merge.
  const members: number[][] = pts.map((_, i) => [i]);
  const link: number[][] = sim.map((row) => row.slice());
  const alive = new Array(n).fill(true);

  while (true) {
    // Find the closest surviving pair.
    let bestA = -1;
    let bestB = -1;
    let best = -Infinity;
    for (let a = 0; a < n; a++) {
      if (!alive[a]) continue;
      for (let b = a + 1; b < n; b++) {
        if (!alive[b]) continue;
        if (link[a][b] > best) {
          best = link[a][b];
          bestA = a;
          bestB = b;
        }
      }
    }
    if (bestA === -1 || best < minSimilarity) break;

    // Merge bestB into bestA (UPGMA: size-weighted average of the two rows).
    const sizeA = members[bestA].length;
    const sizeB = members[bestB].length;
    for (let m = 0; m < n; m++) {
      if (!alive[m] || m === bestA || m === bestB) continue;
      const merged = (sizeA * link[bestA][m] + sizeB * link[bestB][m]) / (sizeA + sizeB);
      link[bestA][m] = merged;
      link[m][bestA] = merged;
    }
    members[bestA] = members[bestA].concat(members[bestB]);
    alive[bestB] = false;
  }

  const clusters: Cluster[] = [];
  for (let a = 0; a < n; a++) {
    if (!alive[a]) continue;
    const ids = members[a].map((i) => points[i].id);
    clusters.push({
      ids,
      size: ids.length,
      cohesion: meanIntraSimilarity(members[a], sim),
    });
  }

  // Largest first; stable tie-break on the first member id keeps it deterministic.
  clusters.sort((x, y) => y.size - x.size || (x.ids[0] < y.ids[0] ? -1 : 1));
  return clusters;
}
