import { describe, it, expect } from "vitest";
import { humanizeKey, slug, normalizeSections } from "./sections";

describe("humanizeKey", () => {
  it("turns snake/kebab keys into a sentence-cased title", () => {
    expect(humanizeKey("governing_settlement")).toBe("Governing settlement");
    expect(humanizeKey("blind-spot")).toBe("Blind spot");
    expect(humanizeKey("rules")).toBe("Rules");
  });
});

describe("slug", () => {
  it("lowercases and hyphenates, trimming edges", () => {
    expect(slug("Protocols travel more easily than products")).toBe(
      "protocols-travel-more-easily-than-products"
    );
    expect(slug("  Formulary dark  ")).toBe("formulary-dark");
  });
});

// Mirrors the real API payload shapes the user is seeing on the page.
const sections = {
  rules: [
    { title: "Protocols travel more easily than products", text: "An Open Formulary entry..." },
    { title: "Production is distributed, but certification is shared", text: "Public biofoundries..." },
  ],
  regimes: [
    { name: "The public biofoundry network", preferred: true, description: "Regional institutes..." },
    { name: "Formulary dark", preferred: false, description: "Uncertified facilities..." },
  ],
  glossary: [
    { term: "the Open Formulary", definition: "the shared body of reproducible protocols" },
    { term: "wet fork", definition: "a modified version of a biological protocol" },
  ],
  institutions: [
    { name: "Public biofoundries", description: "produce validated medicines" },
  ],
  upside: "Medicines that would never attract a profitable market can still be developed.",
};

describe("normalizeSections", () => {
  const norm = normalizeSections(sections);
  const byKey = Object.fromEntries(norm.map((s) => [s.key, s]));

  it("keeps all sections and preserves order", () => {
    expect(norm.map((s) => s.key)).toEqual([
      "rules",
      "regimes",
      "glossary",
      "institutions",
      "upside",
    ]);
  });

  it("classifies string values as prose", () => {
    const upside = byKey.upside;
    expect(upside.kind).toBe("prose");
    if (upside.kind === "prose") {
      expect(upside.title).toBe("Upside");
      expect(upside.body).toContain("profitable market");
    }
  });

  it("classifies arrays as lists and maps {title,text}", () => {
    const rules = byKey.rules;
    expect(rules.kind).toBe("list");
    if (rules.kind === "list") {
      expect(rules.items).toHaveLength(2);
      expect(rules.items[0].title).toBe("Protocols travel more easily than products");
      expect(rules.items[0].body).toBe("An Open Formulary entry...");
      expect(rules.items[0].id).toBe("rules::protocols-travel-more-easily-than-products");
      expect(rules.items[0].preferred).toBe(false);
    }
  });

  it("maps {name,description} + preferred flag (regimes)", () => {
    const regimes = byKey.regimes;
    if (regimes.kind === "list") {
      expect(regimes.items[0].title).toBe("The public biofoundry network");
      expect(regimes.items[0].body).toBe("Regional institutes...");
      expect(regimes.items[0].preferred).toBe(true);
      expect(regimes.items[1].preferred).toBe(false);
    }
  });

  it("maps {term,definition} (glossary)", () => {
    const glossary = byKey.glossary;
    if (glossary.kind === "list") {
      expect(glossary.items[0].title).toBe("the Open Formulary");
      expect(glossary.items[0].body).toBe("the shared body of reproducible protocols");
    }
  });

  it("gives every item a unique id even on duplicate/empty titles", () => {
    const dup = normalizeSections({
      x: [{ title: "same" }, { title: "same" }, { foo: 1 }, { foo: 2 }],
    })[0];
    if (dup.kind === "list") {
      const ids = dup.items.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      // no title-ish key -> "(untitled)" title, body falls back to the JSON of the rest
      expect(dup.items[2].title).toBe("(untitled)");
      expect(dup.items[2].body).toContain("\"foo\": 1");
    }
  });

  it("handles empty / missing bags without throwing", () => {
    expect(normalizeSections({})).toEqual([]);
    expect(normalizeSections(null)).toEqual([]);
    expect(normalizeSections(undefined)).toEqual([]);
  });

  it("falls back to pretty JSON for a bare-object section value", () => {
    const [only] = normalizeSections({ meta: { a: 1, b: 2 } });
    expect(only.kind).toBe("prose");
    if (only.kind === "prose") expect(only.body).toContain("\"a\": 1");
  });
});
