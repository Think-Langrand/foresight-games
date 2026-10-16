import { describe, it, expect } from "vitest";
import {
  GROUPING_GUIDANCE,
  HOPES_FEARS_PITFALLS,
  NAME_SHAPE,
  PLAIN_WORDS,
  THEME_INSTRUCTIONS,
  composeClusterPrompt,
} from "./theme-guidance";

// The prompts are strings assembled from parts, so nothing in the type system notices when a
// part stops being included. These assertions are the only thing standing between a careless
// edit and a prompt that quietly drops a rule we rely on.
describe("composeClusterPrompt", () => {
  for (const framing of ["group", "cohort"] as const) {
    it(`carries every rule in the ${framing} framing`, () => {
      const prompt = composeClusterPrompt(framing);
      expect(prompt).toContain(GROUPING_GUIDANCE);
      expect(prompt).toContain(THEME_INSTRUCTIONS);
      expect(prompt).toContain(PLAIN_WORDS);
    });
  }

  it("frames a cohort run as several groups, and a group run as one", () => {
    expect(composeClusterPrompt("group")).toContain("A group mapped out the");
    expect(composeClusterPrompt("cohort")).toContain("SEVERAL groups");
  });

  it("keeps the hopes-and-fears pitfalls OUT of the clustering prompt", () => {
    // Telling a model that is grouping implications to seek uncomfortable fears steers it
    // toward material that is not in front of it. The page offers them as a paste-in instead.
    const prompt = composeClusterPrompt("group");
    for (const pitfall of HOPES_FEARS_PITFALLS) expect(prompt).not.toContain(pitfall);
  });
});

describe("PLAIN_WORDS", () => {
  it("names the tells rather than asking for a tone", () => {
    // "Sound natural" produces the same prose plus a sentence claiming it is plain. The words
    // have to be listed, and these are the ones this tool was actually caught producing.
    for (const tell of ["pivotal", "serves as", "leverage", "Not just X but Y", "Em dashes"]) {
      expect(PLAIN_WORDS).toContain(tell);
    }
  });

  it("does not ban the shape a theme name is supposed to take", () => {
    // NAME_SHAPE asks for "Responsibility moves to communities faster than resources do" — a
    // comparison with a from/to sense. A rule that forbade that would fight the exemplar.
    expect(NAME_SHAPE).toContain("Responsibility moves to communities");
    expect(PLAIN_WORDS).not.toContain("from X to Y");
  });
});
