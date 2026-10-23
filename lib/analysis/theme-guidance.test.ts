import { describe, it, expect } from "vitest";
import {
  GROUPING_GUIDANCE,
  HOPES_FEARS_PITFALLS,
  NAME_SHAPE,
  PLAIN_WORDS,
  PLAIN_WORDS_PROSE,
  THEME_INSTRUCTIONS,
  composeClusterPrompt,
  IMPLICATION_MATERIAL,
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

describe("PLAIN_WORDS_PROSE", () => {
  // The two variants exist because two of the tells are about LENGTH, and a rule that is
  // right for twelve words on a card is wrong for a paragraph with a list in it.
  it("carries the vocabulary tells, same as the names variant", () => {
    for (const tell of ["pivotal", "serves as", "leverage", "Not just X but Y", "Em dashes"]) {
      expect(PLAIN_WORDS_PROSE).toContain(tell);
    }
  });

  it("does not tell a prompt that asked for a list to return one item", () => {
    // synthesis-summary.ts asks for `risks` and `opportunities` ARRAYS and instructs the
    // model to keep what the group wrote. "Name the one that carries the weight" contradicts
    // both, and the strongest reading wins: four real risks came back as one.
    expect(PLAIN_WORDS).toContain("Name the one that carries the weight");
    expect(PLAIN_WORDS_PROSE).not.toContain("Name the one that carries the weight");
  });

  it("does not cap a paragraph at one clause", () => {
    expect(PLAIN_WORDS).toContain("One clause is enough");
    expect(PLAIN_WORDS_PROSE).not.toContain("One clause is enough");
  });

  it("still catches the real rule-of-three tell: padding to three", () => {
    // Dropping the bullet outright would lose the tell. The prose wording keeps it and names
    // the actual fault — inventing a third item for rhythm.
    expect(PLAIN_WORDS_PROSE).toContain("Padding a list to three");
    expect(PLAIN_WORDS_PROSE).toContain("if it holds four, give four");
  });
});

// --- source-aware framing -------------------------------------------------------------
//
// The cohort prompt was written for one kind of material and says so twice ("mapped out
// the implications", "all of their implications are pooled below"). Pooling risks or fears
// through the same clustering would hand the model a list of risks under a sentence telling
// it they are implications. These lock in that the material can be named, and -- more
// important -- that saying nothing reproduces the original prompt exactly.

describe("composeClusterPrompt with material", () => {
  it("is byte-identical to the unparameterized prompt when no material is given", () => {
    for (const framing of ["group", "cohort"] as const) {
      expect(composeClusterPrompt(framing, IMPLICATION_MATERIAL)).toBe(
        composeClusterPrompt(framing)
      );
    }
  });

  it("names the material in the cohort framing instead of saying implications", () => {
    const p = composeClusterPrompt("cohort", {
      plural: "risks",
      singular: "risk",
      produced: "wrote the risks they saw in the themes they had built",
      context: "theme",
    });
    expect(p).toContain("risks");
    expect(p).toContain("wrote the risks they saw");
    expect(p).not.toContain("all of their implications are");
  });

  it("names the material in the per-item rules too, not only the opening line", () => {
    const p = composeClusterPrompt("cohort", {
      plural: "fears",
      singular: "fear",
      produced: "wrote what they feared",
      context: "theme",
    });
    expect(p).toContain("A fear MAY belong to more than one theme");
    expect(p).not.toContain("An implication MAY belong");
  });

  it("still carries every mechanical rule the response schema depends on", () => {
    const p = composeClusterPrompt("cohort", {
      plural: "hopes",
      singular: "hope",
      produced: "wrote what they hoped for",
      context: "fear it answers",
    });
    expect(p).toContain("Use the ids exactly as given");
    expect(p).toContain("STATEMENT ABOUT CHANGE");
  });
});
