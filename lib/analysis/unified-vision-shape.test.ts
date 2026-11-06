import { describe, expect, it } from "vitest";
import {
  VISION_PROMPT,
  composeVisionPrompt,
  MAX_CANDIDATES,
  MAX_SHARED,
  MAX_TENSIONS,
  coerceUnifiedVision,
  visionKeys,
  visionSources,
  type VisionSource,
} from "./unified-vision-shape";
import type { CohortGroupInfo, CohortItem } from "./cohort-cluster-shape";

const group = (
  id: string,
  over: Partial<CohortGroupInfo> = {}
): CohortGroupInfo => ({
  id,
  name: over.name ?? `Group ${id} | A Scenario`,
  color: over.color ?? null,
  scenarioTitle: over.scenarioTitle ?? `Scenario ${id}`,
  itemCount: over.itemCount ?? 1,
  state: over.state ?? "ok",
});

const item = (id: string, groupId: string, text: string): CohortItem => ({
  id,
  text,
  keyChange: "",
  groupId,
});

const sources = (n: number): VisionSource[] =>
  Array.from({ length: n }, (_, i) => ({
    groupId: `g${i + 1}`,
    groupName: `Group ${i + 1}`,
    scenarioTitle: null,
    text: `vision ${i + 1}`,
  }));

describe("visionKeys", () => {
  it("maps each group to a short key and back", () => {
    const { toShort, toReal } = visionKeys(sources(3));
    expect(toShort.get("g1")).toBe("G1");
    expect(toShort.get("g3")).toBe("G3");
    expect(toReal.get("G2")).toBe("g2");
  });
});

describe("visionSources", () => {
  it("pairs each group with its vision, in the cohort's group order", () => {
    const got = visionSources(
      [item("v2", "g2", "second room"), item("v1", "g1", "first room")],
      [group("g1"), group("g2")]
    );
    expect(got.sources.map((s) => s.groupId)).toEqual(["g1", "g2"]);
    expect(got.sources[0].text).toBe("first room");
    expect(got.missing).toEqual([]);
  });

  // "No board" and "a board with nothing on it" are different findings, and the panel says
  // which — the same distinction the rest of the cohort feature is built around.
  it("tells a group with no board apart from one that wrote nothing", () => {
    const got = visionSources(
      [item("v1", "g1", "only room")],
      [group("g1"), group("g2", { state: "empty" }), group("g3", { state: "missing" })]
    );
    expect(got.sources).toHaveLength(1);
    expect(got.missing).toEqual([
      { groupId: "g2", groupName: "Group g2 | A Scenario", reason: "empty" },
      { groupId: "g3", groupName: "Group g3 | A Scenario", reason: "missing" },
    ]);
  });

  it("joins a group's several answers rather than silently keeping the first", () => {
    const got = visionSources(
      [item("a", "g1", "first sentence"), item("b", "g1", "an extra an admin added")],
      [group("g1")]
    );
    expect(got.sources[0].text).toBe("first sentence\n\nan extra an admin added");
  });

  it("treats a blank answer as no vision at all", () => {
    const got = visionSources([item("a", "g1", "   ")], [group("g1")]);
    expect(got.sources).toEqual([]);
    expect(got.missing[0].reason).toBe("empty");
  });
});

describe("coerceUnifiedVision", () => {
  const args = { sources: sources(3), missing: [], model: "gpt-5" };

  const full = {
    shared: [{ text: "public health holds the relationships", group_keys: ["G1", "G2", "G3"] }],
    tensions: [{ text: "who holds the money differs", group_keys: ["G1", "G3"] }],
    candidates: [{ text: "A unified vision.", keeps: "keeps the funding difference" }],
  };

  it("maps the model's group keys back to real ids", () => {
    const got = coerceUnifiedVision(full, args);
    expect(got?.shared[0].groupIds).toEqual(["g1", "g2", "g3"]);
    expect(got?.tensions[0].groupIds).toEqual(["g1", "g3"]);
  });

  // A hallucinated key must not be attributed to a real room. Dropping it is the only safe
  // move: there is no way to know which room was meant.
  it("drops a group key it was never given", () => {
    const got = coerceUnifiedVision(
      { ...full, shared: [{ text: "something", group_keys: ["G1", "G9", "nonsense"] }] },
      args
    );
    expect(got?.shared[0].groupIds).toEqual(["g1"]);
  });

  it("tolerates lowercase and padded keys, which a model will produce", () => {
    const got = coerceUnifiedVision(
      { ...full, shared: [{ text: "something", group_keys: [" g2 ", "g1"] }] },
      args
    );
    expect(got?.shared[0].groupIds).toEqual(["g2", "g1"]);
  });

  it("never repeats a group in one attribution", () => {
    const got = coerceUnifiedVision(
      { ...full, shared: [{ text: "something", group_keys: ["G1", "G1"] }] },
      args
    );
    expect(got?.shared[0].groupIds).toEqual(["g1"]);
  });

  it("clamps the counts, because a model asked for a few will sometimes return eleven", () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ text: `point ${i}`, group_keys: ["G1"] }));
    const got = coerceUnifiedVision(
      {
        shared: many(20),
        tensions: many(20),
        candidates: Array.from({ length: 9 }, (_, i) => ({ text: `draft ${i}`, keeps: "x" })),
      },
      args
    );
    expect(got?.shared).toHaveLength(MAX_SHARED);
    expect(got?.tensions).toHaveLength(MAX_TENSIONS);
    expect(got?.candidates).toHaveLength(MAX_CANDIDATES);
  });

  it("drops blank points rather than rendering an empty bullet", () => {
    const got = coerceUnifiedVision(
      {
        ...full,
        shared: [{ text: "   ", group_keys: ["G1"] }, { text: "real", group_keys: ["G1"] }],
      },
      args
    );
    expect(got?.shared.map((s) => s.text)).toEqual(["real"]);
  });

  it("keeps a candidate whose `keeps` is missing — the draft is the point", () => {
    const got = coerceUnifiedVision({ ...full, candidates: [{ text: "a draft" }] }, args);
    expect(got?.candidates).toEqual([{ text: "a draft", keeps: "" }]);
  });

  // Null, not an empty shape: "the model returned nothing readable" is a failure a
  // facilitator can retry, and "these visions share nothing" is a finding. The caller
  // reports them differently.
  it("returns null when there is no shared ground AND no candidate", () => {
    expect(coerceUnifiedVision({ shared: [], tensions: [], candidates: [] }, args)).toBeNull();
    expect(coerceUnifiedVision({}, args)).toBeNull();
    expect(coerceUnifiedVision(null, args)).toBeNull();
    expect(coerceUnifiedVision("nope", args)).toBeNull();
  });

  it("survives a response whose arrays are the wrong type", () => {
    const got = coerceUnifiedVision(
      { shared: "not an array", tensions: 7, candidates: [{ text: "a draft", keeps: "x" }] },
      args
    );
    expect(got?.shared).toEqual([]);
    expect(got?.tensions).toEqual([]);
    expect(got?.candidates).toHaveLength(1);
  });

  it("carries the sources and the missing rooms with the answer", () => {
    const missing = [{ groupId: "g4", groupName: "Group 4", reason: "empty" as const }];
    const got = coerceUnifiedVision(full, { ...args, missing });
    expect(got?.sources).toHaveLength(3);
    expect(got?.missing).toEqual(missing);
    expect(got?.model).toBe("gpt-5");
  });

  it("collapses whitespace so a multi-line model answer renders as one line", () => {
    const got = coerceUnifiedVision(
      { ...full, shared: [{ text: "a\n\n  b   c", group_keys: [] }] },
      args
    );
    expect(got?.shared[0].text).toBe("a b c");
  });
});


describe("composeVisionPrompt", () => {
  it("uses the default when no override is given", () => {
    expect(composeVisionPrompt()).toBe(VISION_PROMPT);
    expect(composeVisionPrompt(null)).toBe(VISION_PROMPT);
    expect(composeVisionPrompt("")).toBe(VISION_PROMPT);
    // Whitespace is not an edit. Without this, clearing the box to spaces would send a
    // blank system prompt and the model would answer with no instructions at all.
    expect(composeVisionPrompt("   \n  ")).toBe(VISION_PROMPT);
  });

  it("substitutes the facilitator's prompt whole, trimmed", () => {
    expect(composeVisionPrompt("  group these by who acts  ")).toBe("group these by who acts");
  });

  // The editor's "Load the default" button puts this exact string in the textarea, so it
  // has to be the string that is actually sent — a prompt written for display would drift.
  it("exposes a default that carries the instructions the output depends on", () => {
    expect(VISION_PROMPT).toContain("G1");
    expect(VISION_PROMPT).toMatch(/DIFFERENT/);
    expect(VISION_PROMPT.length).toBeGreaterThan(200);
  });
});

describe("the override is recorded on the reading", () => {
  const base = {
    shared: [{ text: "something shared", group_keys: ["G1"] }],
    tensions: [],
    candidates: [{ text: "a draft", keeps: "x" }],
  };

  it("records null for a default run and the text for a custom one", () => {
    const args = { sources: sources(2), missing: [], model: "gpt-5" };
    expect(coerceUnifiedVision(base, args)?.promptOverride).toBeNull();
    expect(
      coerceUnifiedVision(base, { ...args, promptOverride: "my prompt" })?.promptOverride
    ).toBe("my prompt");
  });
});
