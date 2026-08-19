import { describe, it, expect } from "vitest";
import { extractScenarioDeepSections } from "./deep-sections";

describe("extractScenarioDeepSections", () => {
  it("returns nothing for an empty scenario", () => {
    expect(extractScenarioDeepSections({})).toEqual([]);
    expect(extractScenarioDeepSections({ body: "", sections: {} })).toEqual([]);
    expect(extractScenarioDeepSections({ body: "Just prose, no headings." })).toEqual([]);
  });

  it("reads the structured section keys (upside / blind_spot / arrival) in fixed order", () => {
    const out = extractScenarioDeepSections({
      sections: {
        arrival: "The transition begins…",
        blind_spot: "It can mistake capability for power.",
        upside: "Medicines that would never attract a market can still be made.",
        other: "ignored",
      },
    });
    expect(out.map((s) => s.key)).toEqual(["makes-possible", "blind-spot", "why-arrives"]);
    expect(out[0].label).toBe("What this world makes possible");
    expect(out[0].content).toBe("Medicines that would never attract a market can still be made.");
    expect(out[2].content).toBe("The transition begins…");
  });

  it("falls back to body `##` headings when a section key is absent", () => {
    const out = extractScenarioDeepSections({
      sections: {},
      body: ["A long lead narrative.", "", "## Why This Future Arrives", "Three forces converge."].join("\n"),
    });
    expect(out.map((s) => s.key)).toEqual(["why-arrives"]);
    expect(out[0].content).toBe("Three forces converge.");
  });

  it("prefers the structured section over a body heading", () => {
    const out = extractScenarioDeepSections({
      sections: { arrival: "from section" },
      body: "## Why This Future Arrives\nfrom body",
    });
    expect(out[0].content).toBe("from section");
  });
});
