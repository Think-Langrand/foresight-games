// The colour parameters for the cohort analysis views. One place, because four views that
// each picked their own colours would make the same group look like two different groups
// depending on which tab you were on.
//
// EVERY HEX HERE WAS VALIDATED, NOT CHOSEN BY EYE. The categorical four passed
// scripts/validate_palette.js in strict --pairs all mode against this app's #f5f4ec paper:
// lightness band, chroma floor, CVD separation (worst pair 13.2 ΔE deutan), normal-vision
// floor (21.8) and 3:1 contrast. Re-run the validator before changing any of them; the
// obvious-looking swaps fail. Purple #7e22ce, the first choice for slot 4, collapses to
// 3.6 ΔE against the blue under deuteranopia -- indistinguishable, and nothing on screen
// would have looked wrong.
//
// Why the app's own palette is not used directly: --lime and --coral are decorative
// accents that fail the contrast and lightness checks as data marks, and the group colours
// stored on design_groups are facilitator-assigned and NOT unique -- Groups 2 and 3 are
// both #12a594 on the live data, so using them as identity would merge two rooms into one.
// The stored colour stays what it is for the board UI; identity in a chart comes from here.

// Three colour jobs, kept apart on purpose:
//   categorical — which GROUP (identity)
//   sequential  — HOW MANY groups converged (magnitude)
//   polarity    — risk vs opportunity (a warm/cool pair, the CVD-safe axis)

export const COHORT_CATEGORICAL = ["#275de2", "#c2410c", "#0d9488", "#86198f"] as const;

// A fifth group is not a generated hue. The palette was validated for four, so anything
// past that folds to a neutral: two rooms sharing one blue is worse than one room grey.
export const OTHER_GROUP_COLOR = "#6b6b5e";

export function groupColors(
  groups: { id: string }[],
  // An earlier assignment to preserve. Colour follows the ENTITY, never its rank in the
  // current view: filtering a group out must not slide the next one into its colour.
  previous?: Map<string, string>
): Map<string, string> {
  const out = new Map<string, string>();
  let next = 0;
  const taken = new Set(previous ? [...previous.values()] : []);
  for (const g of groups) {
    const kept = previous?.get(g.id);
    if (kept) {
      out.set(g.id, kept);
      continue;
    }
    while (next < COHORT_CATEGORICAL.length && taken.has(COHORT_CATEGORICAL[next])) next += 1;
    out.set(g.id, next < COHORT_CATEGORICAL.length ? COHORT_CATEGORICAL[next] : OTHER_GROUP_COLOR);
    next += 1;
  }
  return out;
}

// Risk and opportunity as warm against cool rather than red against green, which is the
// pair deuteranopia merges. This exact pair validated at 13.7 ΔE deutan. It never appears
// as a fill in the same plot as the group hues, and always carries a visible count beside
// it, so identity is never colour alone.
export const POLARITY_COLOR: Record<"risk" | "opportunity" | "hope" | "fear", string> = {
  risk: "#c2410c",
  opportunity: "#0d9488",
  fear: "#c2410c",
  hope: "#0d9488",
};

// One hue, light to dark, for "how many groups raised this". Index 0 is TRANSPARENT and not
// the palest blue: zero groups means nothing is there, and a sequential ramp that renders
// absence as its lightest step makes an empty cell read as a small value.
export const CONVERGENCE_STEPS = [
  "transparent",
  "#c7d7f7",
  "#8fb0ef",
  "#5888e7",
  "#275de2",
] as const;

export function convergenceStep(groupCount: number, totalGroups: number): string {
  if (groupCount <= 0) return CONVERGENCE_STEPS[0];
  const last = CONVERGENCE_STEPS.length - 1;
  if (totalGroups <= 1) return CONVERGENCE_STEPS[last];
  // Scaled to the cohort's size, so "all of them" is always the darkest step whether a
  // project has four groups or nine, and clamped so a bigger cohort cannot index past it.
  const step = Math.round(1 + ((groupCount - 1) / (totalGroups - 1)) * (last - 1));
  return CONVERGENCE_STEPS[Math.min(last, Math.max(1, step))];
}

// Ink tokens. Text wears text colours, never a series colour — a coloured mark beside a
// label carries the identity, the label itself stays readable.
export const INK = {
  primary: "var(--ink)",
  muted: "var(--muted)",
  rule: "var(--rule)",
  surface: "var(--paper)",
  card: "var(--card)",
} as const;
