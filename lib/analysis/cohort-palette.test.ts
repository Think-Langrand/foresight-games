import { describe, it, expect } from "vitest";
import {
  COHORT_CATEGORICAL,
  CONVERGENCE_STEPS,
  OTHER_GROUP_COLOR,
  POLARITY_COLOR,
  convergenceStep,
  groupColors,
} from "./cohort-palette";

describe("COHORT_CATEGORICAL", () => {
  // These exact hexes passed scripts/validate_palette.js in strict --pairs all mode against
  // the app's #f5f4ec paper surface: lightness band, chroma floor, CVD separation (worst
  // pair 13.2 deutan), normal-vision floor and 3:1 contrast. Changing one without re-running
  // the validator is how a palette silently stops being colorblind-safe.
  it("is the four validated hues in their validated order", () => {
    expect(COHORT_CATEGORICAL).toEqual(["#275de2", "#c2410c", "#0d9488", "#86198f"]);
  });
});

describe("groupColors", () => {
  it("assigns hues in fixed order by position, so a group keeps its colour", () => {
    const m = groupColors([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]);
    expect(m.get("a")).toBe("#275de2");
    expect(m.get("d")).toBe("#86198f");
  });

  // The rule that stops a filter from repainting the survivors: colour follows the entity,
  // never its rank in the current view. Dropping group B must not slide C into B's blue.
  it("keeps every other group's colour when one is filtered out", () => {
    const all = groupColors([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]);
    const fewer = groupColors([{ id: "a" }, { id: "c" }, { id: "d" }], all);
    expect(fewer.get("a")).toBe(all.get("a"));
    expect(fewer.get("c")).toBe(all.get("c"));
    expect(fewer.get("d")).toBe(all.get("d"));
  });

  // A ninth series is never a generated hue. Four is what the palette was validated for, so
  // a fifth group folds to a neutral rather than silently reusing group 1's blue -- which
  // would make two rooms look like one.
  it("folds a fifth group into a neutral instead of cycling back to the first hue", () => {
    const m = groupColors([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }]);
    expect(m.get("e")).toBe(OTHER_GROUP_COLOR);
    expect(m.get("e")).not.toBe(m.get("a"));
  });

  it("handles an empty cohort without throwing", () => {
    expect(groupColors([]).size).toBe(0);
  });
});

describe("POLARITY_COLOR", () => {
  // Warm vs cool, which is the axis that survives red-green colour blindness. This exact
  // pair validated at 13.7 deutan separation. It never appears as a fill in the same chart
  // as the group hues, and always ships with a visible count beside it.
  it("is a warm/cool pair, not a red/green one", () => {
    expect(POLARITY_COLOR.risk).toBe("#c2410c");
    expect(POLARITY_COLOR.opportunity).toBe("#0d9488");
  });

  it("covers every polarity a pooled item can carry", () => {
    for (const k of ["risk", "opportunity", "hope", "fear"] as const) {
      expect(POLARITY_COLOR[k]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("convergenceStep", () => {
  it("is a single hue getting darker as more groups converge", () => {
    expect(CONVERGENCE_STEPS).toHaveLength(5);
    expect(convergenceStep(1, 4)).toBe(CONVERGENCE_STEPS[1]);
    expect(convergenceStep(4, 4)).toBe(CONVERGENCE_STEPS[4]);
  });

  // Zero groups is not "the palest blue", it is nothing there. A sequential ramp that
  // renders absence as its lightest step makes an empty cell look like a small value.
  it("renders nothing at all for zero", () => {
    expect(convergenceStep(0, 4)).toBe(CONVERGENCE_STEPS[0]);
    expect(CONVERGENCE_STEPS[0]).toBe("transparent");
  });

  it("is monotonic in lightness, never a rainbow", () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    const steps = CONVERGENCE_STEPS.slice(1).map(lum);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
  });

  it("does not run off the end of the ramp when a cohort has more groups than steps", () => {
    expect(convergenceStep(9, 9)).toBe(CONVERGENCE_STEPS[4]);
    expect(convergenceStep(5, 9)).toBeTruthy();
  });
});
