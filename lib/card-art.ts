// Per-dimension visual identity for the deck. Procedural SVG art now; when real
// artwork exists, set `image` on a dimension and the renderer uses it instead —
// no other changes needed. Client-safe (data + pure helpers only).

export type Motif =
  | "rings"
  | "waves"
  | "grid"
  | "network"
  | "strata"
  | "orbits"
  | "rays";

export interface CardArtSpec {
  hue: string; // base colour (hex)
  motif: Motif;
  image?: string; // swap-later hook: a real asset path (public/ or remote)
}

// One identity per dimension (hue + motif). Motif + hue combinations are chosen
// to read as a themed but cohesive deck.
export const CARD_ART: Record<string, CardArtSpec> = {
  "The shape of the public": { hue: "#4b45c6", motif: "network" },
  "Where trust lives": { hue: "#275de2", motif: "rings" },
  "How health truth is established": { hue: "#12a594", motif: "waves" },
  "Public health's permission to act": { hue: "#d1382a", motif: "rays" },
  "The institutional base": { hue: "#b9860b", motif: "strata" },
  "The workforce model": { hue: "#2f8f2a", motif: "grid" },
  "AI infrastructure and access": { hue: "#7c5cff", motif: "network" },
  "What public health can see": { hue: "#0891b2", motif: "orbits" },
  "Control of body data": { hue: "#8e4ec6", motif: "orbits" },
  "The threat environment": { hue: "#e07a26", motif: "rays" },
  "The model of prevention": { hue: "#059669", motif: "waves" },
  "The structure of care": { hue: "#0284c7", motif: "network" },
  "Individual and movement power": { hue: "#ff644e", motif: "rays" },
};

const FALLBACK: CardArtSpec = { hue: "#6b6b5e", motif: "grid" };

export function artFor(dimension: string): CardArtSpec {
  return CARD_ART[dimension] ?? FALLBACK;
}

// --- deterministic RNG so a dimension's art is stable across renders ---
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
