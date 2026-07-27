import { describe, it, expect } from "vitest";
import { cleanEntries } from "./clean";
import type { KernelEntry } from "./types";
import fixture from "./__fixtures__/july-2026.json";

const entries = fixture as unknown as KernelEntry[];

describe("cleanEntries — July 2026 export (§9)", () => {
  const result = cleanEntries(entries);

  it("keeps 19 analysable kernels", () => {
    expect(result.kept).toHaveLength(19);
  });

  it("drops the K2VE gibberish entry", () => {
    const gibberish = result.excluded.filter((e) => e.reason === "gibberish");
    expect(gibberish).toHaveLength(1);
    expect(gibberish[0].entry.code).toBe("K2VE");
  });

  it("drops the 7 empty-text DPJB entries", () => {
    const empty = result.excluded.filter((e) => e.reason === "empty-text");
    expect(empty).toHaveLength(7);
    expect(empty.every((e) => e.entry.code === "DPJB")).toBe(true);
  });

  it("only ever considers Submitted entries", () => {
    // 27 submitted = 19 kept + 1 gibberish + 7 empty-text.
    expect(result.kept.length + result.excluded.length).toBe(27);
  });

  it("flags {X4VR, P946, RH75} as a near-duplicate group (not excluded)", () => {
    const codeSets = result.nearDuplicateGroups.map((g) =>
      new Set(g.map((e) => e.code))
    );
    const target = codeSets.find((s) => s.has("X4VR") && s.has("P946") && s.has("RH75"));
    expect(target).toBeDefined();
    // Flagged, never removed: all three remain in `kept`.
    const keptCodes = new Set(result.kept.map((e) => e.code));
    for (const code of ["X4VR", "P946", "RH75"]) expect(keptCodes.has(code)).toBe(true);
  });
});

describe("cleanEntries — manual excludes", () => {
  it("drops codes listed in opts.excludeCodes (case-insensitive)", () => {
    const result = cleanEntries(entries, { excludeCodes: ["6sjb"] });
    const manual = result.excluded.filter((e) => e.reason === "manual");
    expect(manual.length).toBeGreaterThan(0);
    expect(manual.every((e) => e.entry.code === "6SJB")).toBe(true);
    expect(result.kept.some((e) => e.code === "6SJB")).toBe(false);
  });
});

describe("cleanEntries — edge cases", () => {
  it("returns empty result for no submitted entries", () => {
    const result = cleanEntries([
      { code: "AAA", status: "Drafting" } as KernelEntry,
    ]);
    expect(result.kept).toHaveLength(0);
    expect(result.excluded).toHaveLength(0);
    expect(result.nearDuplicateGroups).toHaveLength(0);
  });

  it("does not treat an all-empty submitted entry as gibberish", () => {
    const result = cleanEntries([
      {
        code: "AAA",
        status: "Submitted",
        worldTitle: "",
        convergence: "",
        definingCharacteristics: "",
        centralTension: "",
        newNormal: "",
        brokenAssumption: "",
        primaryCondition: "",
        worldDescription: "",
        createdTime: "",
        name: "",
        cards: [],
      },
    ]);
    expect(result.excluded[0]?.reason).toBe("empty-text");
  });
});
