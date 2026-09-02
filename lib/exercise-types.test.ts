import { describe, it, expect } from "vitest";
import {
  EXERCISE_TYPES,
  DEFAULT_PROGRAM,
  getExerciseType,
  isBoardBacked,
  exerciseTypeLabel,
  exerciseStatus,
  exerciseEditable,
  worksheetSteps,
  resolveSections,
  newSectionKey,
} from "./exercise-types";

describe("exercise-types registry", () => {
  it("looks up known types and falls back safely on unknown", () => {
    expect(getExerciseType("implications")?.render).toBe("implications");
    expect(getExerciseType("scenario-assessment")?.render).toBe("worksheet");
    expect(getExerciseType("nope")).toBeUndefined();
    expect(exerciseTypeLabel("nope")).toBe("nope"); // graceful fallback
  });

  it("marks board-backed types correctly; unknown = not board-backed", () => {
    expect(isBoardBacked("implications")).toBe(true);
    expect(isBoardBacked("scenario-assessment")).toBe(true);
    expect(isBoardBacked("placeholder")).toBe(false);
    expect(isBoardBacked("nope")).toBe(false);
  });

  it("worksheet types have unique section keys (blank templates allowed)", () => {
    for (const t of Object.values(EXERCISE_TYPES)) {
      if (t.render !== "worksheet") continue;
      const keys = (t.sections ?? []).map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length); // no dupes — section is the card bucket
    }
  });

  it("scenario-assessment opens with a brainstorm and includes the key-changes areas", () => {
    const sections = EXERCISE_TYPES["scenario-assessment"].sections!;
    expect(sections[0].kind).toBe("brainstorm"); // brainstorm cards at the top
    const keys = sections.map((s) => s.key);
    expect(keys).toContain("key-changes");
    expect(keys).toContain("six-changes");
    expect(keys).toContain("parking-lot");
  });

  describe("worksheetSteps", () => {
    it("returns scenario-assessment's four steps in first-appearance order", () => {
      const sections = EXERCISE_TYPES["scenario-assessment"].sections!;
      expect(worksheetSteps(sections)).toEqual([
        "First reactions",
        "Assess the scenario",
        "Stepping into the future",
        "Sandbox",
      ]);
    });

    it("assigns every scenario-assessment section to a step", () => {
      const sections = EXERCISE_TYPES["scenario-assessment"].sections!;
      expect(sections.every((s) => typeof s.step === "string" && s.step.length > 0)).toBe(true);
    });

    it("groups the right sections under each step", () => {
      const sections = EXERCISE_TYPES["scenario-assessment"].sections!;
      const keysFor = (step: string) => sections.filter((s) => s.step === step).map((s) => s.key);
      expect(keysFor("First reactions")).toEqual(["reactions"]);
      expect(keysFor("Assess the scenario")).toEqual([
        "assess-important",
        "assess-unclear",
        "assess-assumptions",
        "assess-missing",
      ]);
      expect(keysFor("Stepping into the future")).toEqual(["stepping-in", "key-changes", "six-changes"]);
      expect(keysFor("Sandbox")).toEqual(["parking-lot"]);
    });

    it("flags only the Sandbox as a board-like canvas", () => {
      const sections = EXERCISE_TYPES["scenario-assessment"].sections!;
      const boards = sections.filter((s) => s.board).map((s) => s.key);
      expect(boards).toEqual(["parking-lot"]);
    });

    it("returns no steps when sections don't declare any (flat fallback)", () => {
      expect(worksheetSteps([{ key: "a", kind: "brainstorm", label: "A" }])).toEqual([]);
    });

    it("trims steps and dedupes whitespace variants into one tab", () => {
      const steps = worksheetSteps([
        { key: "a", kind: "question", label: "A", step: "Assess" },
        { key: "b", kind: "question", label: "B", step: " Assess " }, // same tab, stray spaces
        { key: "c", kind: "question", label: "C", step: "   " }, // whitespace-only → no tab
      ]);
      expect(steps).toEqual(["Assess"]);
    });
  });

  describe("resolveSections (jsonb coercion)", () => {
    it("returns [] for null / non-array / empty (caller falls back to registry)", () => {
      expect(resolveSections(null)).toEqual([]);
      expect(resolveSections(undefined)).toEqual([]);
      expect(resolveSections({})).toEqual([]);
      expect(resolveSections("nope")).toEqual([]);
      expect(resolveSections([])).toEqual([]);
    });

    it("coerces a well-formed array, preserving order and optional fields", () => {
      const raw = [
        { key: "reactions", kind: "brainstorm", label: "First reactions", step: "First reactions", help: "hi", board: true },
        { key: "q1", kind: "question", label: "Why?", step: "Assess", group: "Assess" },
      ];
      expect(resolveSections(raw)).toEqual([
        { key: "reactions", kind: "brainstorm", label: "First reactions", step: "First reactions", help: "hi", board: true },
        { key: "q1", kind: "question", label: "Why?", step: "Assess", group: "Assess" },
      ]);
    });

    it("drops entries missing a usable key, and defaults a bad kind to 'question'", () => {
      const raw = [
        { kind: "question", label: "no key — dropped" },
        { key: "  ", label: "blank key — dropped" },
        { key: "ok", kind: "weird", label: "bad kind → question" },
      ];
      expect(resolveSections(raw)).toEqual([{ key: "ok", kind: "question", label: "bad kind → question" }]);
    });

    it("dedupes repeated keys (first wins) and skips non-object entries", () => {
      const raw = [
        { key: "dup", kind: "brainstorm", label: "first" },
        null,
        42,
        { key: "dup", kind: "question", label: "second — dropped" },
      ];
      expect(resolveSections(raw)).toEqual([{ key: "dup", kind: "brainstorm", label: "first" }]);
    });

    it("omits absent optional fields rather than emitting undefined/empties", () => {
      const [s] = resolveSections([{ key: "k", kind: "question", label: "L" }]);
      expect(s).toEqual({ key: "k", kind: "question", label: "L" });
      expect("step" in s).toBe(false);
      expect("board" in s).toBe(false);
    });

    it("trims step/group and drops whitespace-only ones", () => {
      const [s] = resolveSections([
        { key: "k", kind: "question", label: "L", step: "  Assess  ", group: "  ", help: "h" },
      ]);
      expect(s.step).toBe("Assess");
      expect("group" in s).toBe(false); // whitespace-only group dropped
      expect(s.help).toBe("h");
    });
  });

  describe("newSectionKey", () => {
    it("returns a unique, sec_-prefixed key each call", () => {
      const a = newSectionKey();
      const b = newSectionKey();
      expect(a).toMatch(/^sec_[a-z0-9]{8}$/);
      expect(a).not.toBe(b);
    });
  });

  describe("exerciseStatus / exerciseEditable", () => {
    const NOW = Date.parse("2026-08-22T00:00:00Z");
    const base = { type: "implications", sessionCode: "PS2A", locked: false, opensAt: null };

    it("placeholder when the type has no board or no session", () => {
      expect(exerciseStatus({ ...base, type: "placeholder", sessionCode: null }, NOW)).toBe("placeholder");
      expect(exerciseStatus({ ...base, sessionCode: null }, NOW)).toBe("placeholder"); // board type, not provisioned
    });

    it("scheduled when opens_at is in the future, open once it passes", () => {
      const future = "2026-09-05T00:00:00Z";
      const past = "2026-08-01T00:00:00Z";
      expect(exerciseStatus({ ...base, opensAt: future }, NOW)).toBe("scheduled");
      expect(exerciseStatus({ ...base, opensAt: past }, NOW)).toBe("open");
      expect(exerciseStatus({ ...base, opensAt: null }, NOW)).toBe("open");
    });

    it("locked overrides open (but schedule shows first)", () => {
      expect(exerciseStatus({ ...base, locked: true }, NOW)).toBe("locked");
      expect(exerciseStatus({ ...base, locked: true, opensAt: "2026-09-05T00:00:00Z" }, NOW)).toBe("scheduled");
    });

    it("editable only when fully open", () => {
      expect(exerciseEditable(base, NOW)).toBe(true);
      expect(exerciseEditable({ ...base, locked: true }, NOW)).toBe(false);
      expect(exerciseEditable({ ...base, opensAt: "2026-09-05T00:00:00Z" }, NOW)).toBe(false);
      expect(exerciseEditable({ ...base, type: "placeholder", sessionCode: null }, NOW)).toBe(false);
    });
  });

  it("default program is Week 1 assessment, Week 2 implications, then placeholders", () => {
    expect(DEFAULT_PROGRAM.map((w) => w.type)).toEqual([
      "scenario-assessment",
      "implications",
      "placeholder",
      "placeholder",
    ]);
    expect(DEFAULT_PROGRAM.map((w) => w.sort)).toEqual([0, 1, 2, 3]);
  });
});
