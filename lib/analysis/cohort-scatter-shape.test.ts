import { describe, it, expect } from "vitest";
import { axisSpan, axisTicks } from "./cohort-scatter-shape";

// Float arithmetic lands a hair under an exact 0.6; the assertion is about the minimum
// being enforced, not about it being representable.
const EPS = 1e-9;

describe("axisSpan", () => {
  // The bug: clamping to the 1-5 scale AFTER padding deleted the padding at either end, so
  // a theme whose mean impact is exactly 5.0 -- the observed case on real data, not a
  // corner -- got py(5.0) === the top of the plot. Its dot's whole upper half was drawn
  // outside the grid and its leader line started off-canvas.
  it("leaves room above the highest value even when it sits at the top of the scale", () => {
    const s = axisSpan([4.52, 5.0, 4.8]);
    expect(s.hi).toBeGreaterThan(5.0);
  });

  it("leaves room below the lowest value even when it sits at the bottom of the scale", () => {
    const s = axisSpan([1.0, 2.0]);
    expect(s.lo).toBeLessThan(1.0);
  });

  it("brackets every value it was given", () => {
    for (const vals of [[4.52, 5.0], [1, 5], [3.85, 4.9], [2.2]]) {
      const s = axisSpan(vals);
      for (const v of vals) {
        expect(v).toBeGreaterThan(s.lo);
        expect(v).toBeLessThan(s.hi);
      }
    }
  });

  // Without a floor, eight themes inside a 0.3-wide band get flung to opposite corners and
  // a 0.05 difference reads as a disagreement.
  it("widens a very tight cluster to a readable minimum span", () => {
    const s = axisSpan([4.40, 4.42, 4.45]);
    expect(s.hi - s.lo).toBeGreaterThanOrEqual(0.6 - EPS);
  });

  it("handles a single value without collapsing to a zero-width axis", () => {
    const s = axisSpan([4.2]);
    expect(s.hi - s.lo).toBeGreaterThanOrEqual(0.6 - EPS);
    expect(s.lo).toBeLessThan(4.2);
    expect(s.hi).toBeGreaterThan(4.2);
  });

  it("returns a usable span for no values at all rather than NaN", () => {
    const s = axisSpan([]);
    expect(Number.isFinite(s.lo)).toBe(true);
    expect(Number.isFinite(s.hi)).toBe(true);
    expect(s.hi).toBeGreaterThan(s.lo);
  });

  it("does not run away from the scale on a full-range spread", () => {
    const s = axisSpan([1, 5]);
    expect(s.lo).toBeGreaterThan(0);
    expect(s.hi).toBeLessThan(6);
  });
});

describe("axisTicks", () => {
  // Found by rendering, not by a test: with an impact span of 4.52-5.1 the half-point loop
  // yields only [5.0], the fallback returned [ceil(4.52), floor(5.1)] = [5, 5], and React
  // logged "two children with the same key, y5" while one gridline silently vanished.
  it("never repeats a tick", () => {
    for (const s of [
      { lo: 4.52, hi: 5.1 },
      { lo: 4.9, hi: 5.12 },
      { lo: 1.0, hi: 1.2 },
      { lo: 3.95, hi: 4.05 },
      { lo: 2.4, hi: 2.45 },
    ]) {
      const t = axisTicks(s);
      expect(new Set(t).size).toBe(t.length);
    }
  });

  it("always gives at least two ticks, so an axis is never a single bare line", () => {
    for (const s of [{ lo: 4.52, hi: 5.1 }, { lo: 4.9, hi: 5.12 }, { lo: 1, hi: 1.1 }]) {
      expect(axisTicks(s).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps every tick inside the real 1-5 scale even when the axis runs past it", () => {
    for (const t of axisTicks({ lo: 0.8, hi: 5.2 })) {
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(5);
    }
  });

  it("returns them in ascending order", () => {
    const t = axisTicks({ lo: 3.8, hi: 5.05 });
    expect([...t].sort((a, b) => a - b)).toEqual(t);
  });

  it("covers the ordinary wide case with half-points", () => {
    expect(axisTicks({ lo: 3.9, hi: 4.8 })).toEqual([4, 4.5]);
  });
});
