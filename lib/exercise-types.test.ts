import { describe, it, expect } from "vitest";
import {
  EXERCISE_TYPES,
  DEFAULT_PROGRAM,
  getExerciseType,
  isBoardBacked,
  exerciseTypeLabel,
  exerciseStatus,
  exerciseEditable,
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

  it("worksheet types have sections with unique keys", () => {
    for (const t of Object.values(EXERCISE_TYPES)) {
      if (t.render !== "worksheet") continue;
      const keys = (t.sections ?? []).map((s) => s.key);
      expect(keys.length).toBeGreaterThan(0);
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
