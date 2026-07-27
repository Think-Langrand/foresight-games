import { describe, it, expect } from "vitest";
import { cleanEntries } from "./clean";
import {
  cardFrequency,
  dimensionFrequency,
  roleSplit,
  cardCoOccurrence,
  dimensionCoOccurrence,
  duplicateTriads,
  fieldFillRates,
  edgeCountPerEntry,
} from "./aggregate";
import type { KernelEntry } from "./types";
import fixture from "./__fixtures__/july-2026.json";

const kept = cleanEntries(fixture as unknown as KernelEntry[]).kept;

// Convenience: pick a pair's count regardless of a/b ordering.
function pairCount(pairs: { a: string; b: string; count: number }[], x: string, y: string) {
  const p = pairs.find(
    (p) => (p.a === x && p.b === y) || (p.a === y && p.b === x)
  );
  return p?.count ?? 0;
}

describe("aggregate — top card frequencies (§9)", () => {
  const freq = cardFrequency(kept);
  const byTitle = (t: string) => freq.find((c) => c.title === t)?.picks ?? 0;

  it("matches the expected top cards", () => {
    expect(byTitle("Rebuilt public workforce")).toBe(5);
    expect(byTitle("Trust goes local")).toBe(5);
    expect(byTitle("Layered publics")).toBe(5);
    expect(byTitle("Constant political resistance")).toBe(4);
  });

  it("is sorted descending by picks", () => {
    for (let i = 1; i < freq.length; i++) {
      expect(freq[i - 1].picks).toBeGreaterThanOrEqual(freq[i].picks);
    }
  });
});

describe("aggregate — top dimension frequencies (§9)", () => {
  const freq = dimensionFrequency(kept);
  const byDim = (d: string) => freq.find((x) => x.dimension === d)?.picks ?? 0;

  it("matches the expected top dimensions", () => {
    expect(byDim("Where trust lives")).toBe(8);
    expect(byDim("The shape of the public")).toBe(8);
    expect(byDim("The workforce model")).toBe(7);
    expect(byDim("The model of prevention")).toBe(7);
  });

  it("includes zero-attention dimensions when the full deck order is supplied", () => {
    const withZeros = dimensionFrequency(kept, ["Where trust lives", "A dimension nobody picked"]);
    expect(withZeros.find((x) => x.dimension === "A dimension nobody picked")?.picks).toBe(0);
  });
});

describe("aggregate — role split (§9)", () => {
  it("is 44 Core / 13 Edge", () => {
    expect(roleSplit(kept)).toEqual({ core: 44, edge: 13 });
  });

  it("edge counts per entry sum to the edge total", () => {
    const total = edgeCountPerEntry(kept).reduce((s, e) => s + e.edges, 0);
    expect(total).toBe(13);
  });
});

describe("aggregate — co-occurrence (§9)", () => {
  const cardPairs = cardCoOccurrence(kept, 2);

  it("has the three core-trio pairs at 3 each", () => {
    expect(pairCount(cardPairs, "Rebuilt public workforce", "Trust goes local")).toBe(3);
    expect(pairCount(cardPairs, "Rebuilt public workforce", "Layered publics")).toBe(3);
    expect(pairCount(cardPairs, "Trust goes local", "Layered publics")).toBe(3);
  });

  it("has the two secondary pairs at 2 each", () => {
    expect(pairCount(cardPairs, "Compounding known threats", "High-leverage disruption")).toBe(2);
    expect(pairCount(cardPairs, "Healthier conditions first", "Trust goes local")).toBe(2);
  });

  it("only surfaces pairs with count >= min", () => {
    expect(cardPairs.every((p) => p.count >= 2)).toBe(true);
  });

  it("dimension co-occurrence honours the min threshold", () => {
    const dimPairs = dimensionCoOccurrence(kept, 2);
    expect(dimPairs.every((p) => p.count >= 2)).toBe(true);
  });
});

describe("aggregate — duplicate triads (§9)", () => {
  it("P946 and RH75 share an identical triad", () => {
    const dupes = duplicateTriads(kept);
    const shared = dupes.find((g) => {
      const codes = new Set(g.entries.map((e) => e.code));
      return codes.has("P946") && codes.has("RH75");
    });
    expect(shared).toBeDefined();
    expect(shared!.triad).toHaveLength(3);
  });
});

describe("aggregate — fill rates (§9)", () => {
  it("matches expected fill counts across 19 kept", () => {
    const rates = fieldFillRates(kept);
    expect(rates.definingCharacteristics).toBe(19);
    expect(rates.centralTension).toBe(18);
    expect(rates.newNormal).toBe(18);
    expect(rates.brokenAssumption).toBe(15);
    expect(rates.convergence).toBe(10);
  });
});

describe("aggregate — malformed cards are tolerated", () => {
  it("skips entries with empty/missing cards in card aggregates without throwing", () => {
    const entries: KernelEntry[] = [
      { ...kept[0], cards: [] },
      { ...kept[1], cards: undefined as unknown as KernelEntry["cards"] },
    ];
    expect(() => cardFrequency(entries)).not.toThrow();
    expect(cardFrequency(entries)).toHaveLength(0);
    expect(roleSplit(entries)).toEqual({ core: 0, edge: 0 });
  });
});
