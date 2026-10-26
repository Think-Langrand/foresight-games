import { describe, it, expect } from "vitest";
import {
  EXERCISE_TYPES,
  DEFAULT_PROGRAM,
  getExerciseType,
  isBoardBacked,
  supportsSections,
  exerciseTypeLabel,
  exerciseStatus,
  exerciseEditable,
  worksheetSteps,
  resolveSections,
  newSectionKey,
  defaultProgramWeeks,
  commitmentsStepOf,
  commitmentsSectionsFor,
  COMMITMENTS_STEP_CHANGES,
  COMMITMENTS_STEP_MOVES,
  COMMITMENTS_STEP_RECONNECT,
  COMMITMENTS_STEP_OUTCOMES,
  COMMITMENTS_STEP_VISION,
  COMMITMENTS_KEY_VISION,
  COMMITMENTS_KEY_ROLE,
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
    expect(isBoardBacked("synthesis")).toBe(true);
    expect(isBoardBacked("scenario-assessment")).toBe(true);
    expect(isBoardBacked("commitments")).toBe(true);
    expect(isBoardBacked("placeholder")).toBe(false);
    expect(isBoardBacked("nope")).toBe(false);
  });

  it("types that carry sections have unique section keys (blank templates allowed)", () => {
    for (const t of Object.values(EXERCISE_TYPES)) {
      if (!supportsSections(t.id)) continue;
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
    const base = { type: "implications", sessionCode: "PS2A", locked: false, closed: false, opensAt: null };

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

    it("closed beats schedule and lock, but placeholder beats closed", () => {
      expect(exerciseStatus({ ...base, closed: true }, NOW)).toBe("closed");
      // closed is a hard manual gate — wins over a future schedule and over the lock
      expect(exerciseStatus({ ...base, closed: true, opensAt: "2026-09-05T00:00:00Z" }, NOW)).toBe("closed");
      expect(exerciseStatus({ ...base, closed: true, locked: true }, NOW)).toBe("closed");
      // but with no board/session it's still just a placeholder
      expect(exerciseStatus({ ...base, closed: true, sessionCode: null }, NOW)).toBe("placeholder");
    });

    it("editable only when fully open", () => {
      expect(exerciseEditable(base, NOW)).toBe(true);
      expect(exerciseEditable({ ...base, locked: true }, NOW)).toBe(false);
      expect(exerciseEditable({ ...base, closed: true }, NOW)).toBe(false);
      expect(exerciseEditable({ ...base, opensAt: "2026-09-05T00:00:00Z" }, NOW)).toBe(false);
      expect(exerciseEditable({ ...base, type: "placeholder", sessionCode: null }, NOW)).toBe(false);
    });
  });

  it("default program is assessment, implications, synthesis, commitments", () => {
    expect(DEFAULT_PROGRAM.map((w) => w.type)).toEqual([
      "scenario-assessment",
      "implications",
      "synthesis",
      "commitments",
    ]);
    expect(DEFAULT_PROGRAM.map((w) => w.sort)).toEqual([0, 1, 2, 3]);
    // Every week of the default program is now board-backed, so a new project provisions
    // four boards per group rather than three plus a gap.
    for (const w of DEFAULT_PROGRAM) expect(isBoardBacked(w.type)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Synthesis (Week 3)
// ---------------------------------------------------------------------------
describe("synthesis exercise type", () => {
  it("is registered, board-backed, and carries editable sections", () => {
    expect(getExerciseType("synthesis")?.render).toBe("synthesis");
    expect(isBoardBacked("synthesis")).toBe(true);
    expect(supportsSections("synthesis")).toBe(true);
  });

  it("carries no sections at all — every step of the week is code", () => {
    const sections = EXERCISE_TYPES.synthesis.sections!;
    expect(sections).toEqual([]);
    expect(worksheetSteps(sections)).toHaveLength(0);
  });

  it("never reuses a retired synthesis key", () => {
    // A key is the permanent link to every answer card written under it. Risks and
    // opportunities are cards on a theme now (step 2), not loose stickies, and the
    // Sandbox moved onto the theme sheet — so all three keys stay retired.
    const keys = EXERCISE_TYPES.synthesis.sections!.map((s) => s.key);
    for (const retired of ["synthesis-risks", "synthesis-opportunities", "synthesis-sandbox"]) {
      expect(keys).not.toContain(retired);
    }
  });

  it("is session 3 of the default program", () => {
    expect(DEFAULT_PROGRAM[2].type).toBe("synthesis");
    expect(defaultProgramWeeks()[2].sections).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Commitments (Week 4)
// ---------------------------------------------------------------------------
describe("commitments exercise type", () => {
  it("is registered, board-backed, and carries editable sections", () => {
    expect(getExerciseType("commitments")?.render).toBe("commitments");
    expect(isBoardBacked("commitments")).toBe(true);
    // The week's FIRST STEP is sections, so this is load-bearing rather than incidental:
    // without it the admin block editor never appears and the aspiration prompts could
    // not be reworded without a deploy.
    expect(supportsSections("commitments")).toBe(true);
  });

  it("splits its written fields across the three activities that ask for writing", () => {
    const sections = EXERCISE_TYPES.commitments.sections!;
    expect(sections.map((s) => s.key)).toEqual([
      "w4-attention",
      "w4-keep-in-mind",
      "w4-outcomes",
      "w4-role",
    ]);
    // `question`, not `brainstorm`: three people in a breakout have three readings and each
    // answer is its own card. Migration 0027 is the record of what forcing one cost.
    for (const s of sections) expect(s.kind).toBe("question");
    for (const s of sections) expect(s.label.length).toBeGreaterThan(0);
    // THREE steps, in board order. Acts 2, 4 and 6 are boards: their prompts are guidance
    // in a Directions fold, so they own no sections and must not appear here.
    expect(worksheetSteps(sections)).toEqual([
      COMMITMENTS_STEP_RECONNECT,
      COMMITMENTS_STEP_OUTCOMES,
      COMMITMENTS_STEP_VISION,
    ]);
    expect(commitmentsSectionsFor(sections, "reconnect").map((s) => s.key)).toEqual([
      "w4-attention",
      "w4-keep-in-mind",
    ]);
    expect(commitmentsSectionsFor(sections, "outcomes").map((s) => s.key)).toEqual([
      "w4-outcomes",
    ]);
    expect(commitmentsSectionsFor(sections, "vision").map((s) => s.key)).toEqual(["w4-role"]);
  });

  it("routes pre-rebuild step strings onto a tab rather than dropping them", () => {
    // A board stamped before the six-activity rebuild carries "Key changes" and "Bold
    // moves" on its sections, and a deploy does not rewrite those rows. They have to land
    // somewhere a reader can see them: act 1's prompts were the key-changes pair, and the
    // role lived with the bold moves.
    expect(commitmentsStepOf({ step: COMMITMENTS_STEP_CHANGES })).toBe("reconnect");
    expect(commitmentsStepOf({ step: COMMITMENTS_STEP_MOVES })).toBe("vision");
    // An admin typing a tab name of their own, or leaving it blank, gets act 1 — a question
    // on the first tab beats a question that renders nowhere.
    expect(commitmentsStepOf({ step: "Something a facilitator typed" })).toBe("reconnect");
    expect(commitmentsStepOf({ step: "  " })).toBe("reconnect");
    expect(commitmentsStepOf({})).toBe("reconnect");
  });

  it("never reuses a key retired by a restructure", () => {
    // A key is the permanent link to every answer card ever written under it. The week
    // moved away from a three-part aspiration and a handoff step, and then away from
    // restating Week 2's key changes and from prose bold moves; those keys stay retired so
    // their cards surface under a "removed block" heading rather than being silently
    // re-pointed at a different question.
    const keys = EXERCISE_TYPES.commitments.sections!.map((s) => s.key);
    for (const retired of [
      "aspiration-statement",
      "aspiration-serves",
      "aspiration-holds",
      "handoff-committee-line",
      "w4-summary",
      "w4-assumptions",
      "w4-bold-moves",
    ]) {
      expect(keys).not.toContain(retired);
    }
  });

  it("keeps the vision on the key its answers were written under", () => {
    // The activity was renamed from "the aspirational role" to "Set the vision", but the
    // answers are the same kind of thing and the key is permanent. Renaming it would orphan
    // every aspiration ever written to buy a tidier string.
    expect(COMMITMENTS_KEY_VISION).toBe("w4-role");
    expect(COMMITMENTS_KEY_ROLE).toBe(COMMITMENTS_KEY_VISION);
  });

  it("is session 4 of the default program, replacing the placeholder", () => {
    expect(DEFAULT_PROGRAM[3].type).toBe("commitments");
    expect(DEFAULT_PROGRAM[3].title).toContain("Session 4");
    // The canonical week carries the EFFECTIVE keyset, so a group that never customizes
    // still gets step 1.
    expect(defaultProgramWeeks()[3].sections.map((s) => s.key)).toEqual([
      "w4-attention",
      "w4-keep-in-mind",
      "w4-outcomes",
      "w4-role",
    ]);
  });
});
