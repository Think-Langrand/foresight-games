import { describe, it, expect } from "vitest";
import { extractScenarioDeepSections } from "./deep-sections";

describe("extractScenarioDeepSections", () => {
  it("returns nothing for empty/absent body", () => {
    expect(extractScenarioDeepSections("")).toEqual([]);
    expect(extractScenarioDeepSections(null)).toEqual([]);
    expect(extractScenarioDeepSections("Just prose, no headings.")).toEqual([]);
  });

  it("extracts only the named sections, in fixed order, ignoring leading prose", () => {
    const body = [
      "A long unlabeled narrative that opens the scenario.",
      "",
      "## Why This Future Arrives",
      "Three forces converge.",
      "",
      "## What This World Makes Possible",
      "New coalitions form.",
    ].join("\n");
    const out = extractScenarioDeepSections(body);
    // Fixed order: makes-possible, blind-spot, why-arrives — regardless of body order.
    expect(out.map((s) => s.key)).toEqual(["makes-possible", "why-arrives"]);
    expect(out[0].label).toBe("What this world makes possible");
    expect(out[0].content).toBe("New coalitions form.");
    expect(out[1].content).toBe("Three forces converge.");
  });

  it("matches all three when present and drops empty ones", () => {
    const body = [
      "## What This World Makes Possible",
      "possible",
      "## Structural Blind Spot",
      "blind",
      "## Why This Future Arrives",
      "why",
    ].join("\n");
    expect(extractScenarioDeepSections(body).map((s) => s.key)).toEqual([
      "makes-possible",
      "blind-spot",
      "why-arrives",
    ]);
  });
});
