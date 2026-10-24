import { describe, expect, it } from "vitest";
import {
  EXEC_SUMMARY_LIMITS,
  type ExecSummaryOverride,
  coerceExecSummary,
  execSummaryDefaultText,
  execSummaryReadiness,
  shouldAdoptExecSummary,
} from "./exec-summary-shape";

const block = (key: string, label: string, answers: string[]) => ({ key, label, answers });

describe("coerceExecSummary", () => {
  it("reads a well-formed override", () => {
    expect(
      coerceExecSummary({
        text: "We lead with this.",
        editedAt: "2026-10-23T00:00:00Z",
        editedBy: "Mara",
        source: "edited",
      })
    ).toEqual({
      text: "We lead with this.",
      editedAt: "2026-10-23T00:00:00Z",
      editedBy: "Mara",
      source: "edited",
    });
  });

  it("calls an unrecognised source generated, because that is the cautious answer", () => {
    // The slide labels these differently and tells a committee whether a human wrote the
    // words. An unreadable source must not be allowed to claim authorship.
    expect(coerceExecSummary({ text: "x", source: "nonsense" })?.source).toBe("generated");
    expect(coerceExecSummary({ text: "x" })?.source).toBe("generated");
  });

  it("treats anything that is not an object as no override", () => {
    for (const raw of [null, undefined, 7, "text", [], true]) {
      expect(coerceExecSummary(raw)).toBeNull();
    }
  });

  it("treats empty or whitespace-only text as a revert, not an empty slide", () => {
    // Clearing the box and saving must be indistinguishable from pressing Restore, or a
    // group would be able to publish a blank lead slide by accident.
    expect(coerceExecSummary({ text: "" })).toBeNull();
    expect(coerceExecSummary({ text: "   \n\n  " })).toBeNull();
    expect(coerceExecSummary({ editedBy: "Mara" })).toBeNull();
  });

  it("keeps paragraph breaks but collapses runs of blank lines and trailing spaces", () => {
    const o = coerceExecSummary({ text: "  One.  \n\n\n\n  Two.  \n" });
    expect(o?.text).toBe("One.\n\nTwo.");
  });

  it("clamps the text, the author name and nothing else", () => {
    const o = coerceExecSummary({
      text: "x".repeat(EXEC_SUMMARY_LIMITS.text + 500),
      editedBy: "y".repeat(EXEC_SUMMARY_LIMITS.editedBy + 50),
    });
    expect(o?.text.length).toBe(EXEC_SUMMARY_LIMITS.text);
    expect(o?.editedBy.length).toBe(EXEC_SUMMARY_LIMITS.editedBy);
  });

  it("defaults the stamps rather than dropping an otherwise good override", () => {
    const o = coerceExecSummary({ text: "Kept.", editedAt: 123, editedBy: { name: "no" } });
    expect(o).toEqual({ text: "Kept.", source: "generated", editedAt: "", editedBy: "" });
  });

  it("ignores keys it does not know", () => {
    const o = coerceExecSummary({ text: "Kept.", blocks: [1, 2], reopenedAt: "x" });
    expect(o).toEqual({ text: "Kept.", source: "generated", editedAt: "", editedBy: "" });
  });

  it("is idempotent", () => {
    const once = coerceExecSummary({ text: "  One.\n\n\nTwo.  ", editedBy: "Mara" });
    expect(coerceExecSummary(once)).toEqual(once);
  });
});

describe("execSummaryDefaultText", () => {
  const changes = [
    block("w4-changes", "What is different?", ["Funding is stable.", "Trust is local.", "A third."]),
    block("w4-assumptions", "What stops holding?", ["Grants drive the work."]),
  ];
  const role = [block("w4-role", "The role", ["To hold the floor."])];

  it("seeds from the answers the slide already shows, in reading order", () => {
    // Two per change block, matching the slide's own slice, then the whole aspiration.
    expect(execSummaryDefaultText(changes, role)).toBe(
      "Funding is stable.\n\nTrust is local.\n\nGrants drive the work.\n\nTo hold the floor."
    );
  });

  it("skips blocks with no answers", () => {
    expect(execSummaryDefaultText([block("a", "Empty", [])], role)).toBe("To hold the floor.");
  });

  it("is empty when Session 4 is empty, so the editor opens blank rather than seeded with nothing", () => {
    expect(execSummaryDefaultText([], [])).toBe("");
  });
});

// Generating the lead costs a model call and only makes sense once Session 4 has something
// to summarise, so step 5 asks this before it offers the button. It is a gate on the MODEL,
// not on the group: every step stays editable whatever this returns.
describe("execSummaryReadiness", () => {
  const full = { changes: 2, changesTotal: 2, placements: 6, responses: 4, moves: 2, movesTotal: 2 };

  it("is ready when all four steps have been worked", () => {
    const r = execSummaryReadiness(full);
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("reports every step with its state, so the locked panel can tick off what is done", () => {
    // The panel shows the whole list, not just the gaps: a group wants to see how close it
    // is, and four names with three ticks says that where a list of one gap does not.
    expect(execSummaryReadiness({ ...full, responses: 0 }).steps).toEqual([
      { label: "Key changes", done: true },
      { label: "Risks & opportunities", done: true },
      { label: "Strategic responses", done: false },
      { label: "Role & bold moves", done: true },
    ]);
  });

  it("marks a step with no prompts done rather than leaving it unticked forever", () => {
    const r = execSummaryReadiness({ ...full, changes: 0, changesTotal: 0 });
    expect(r.steps[0]).toEqual({ label: "Key changes", done: true });
  });

  it("names every step still empty, in step order, so the list reads as the tabs do", () => {
    expect(
      execSummaryReadiness({ ...full, changes: 1, placements: 0, responses: 0, moves: 0 }).missing
    ).toEqual([
      "Key changes",
      "Risks & opportunities",
      "Strategic responses",
      "Role & bold moves",
    ]);
  });

  it("counts a partly answered written step as missing, not as done", () => {
    expect(execSummaryReadiness({ ...full, moves: 1 }).missing).toEqual(["Role & bold moves"]);
  });

  it("treats a step with no prompts at all as satisfied rather than permanently blocking", () => {
    // A facilitator can edit the program and remove a step's prompts. Nobody could ever
    // answer them, so holding the button hostage to them would be a dead end.
    expect(execSummaryReadiness({ ...full, changes: 0, changesTotal: 0 }).ready).toBe(true);
  });
});

describe("shouldAdoptExecSummary", () => {
  const drafted = (text: string, editedAt = "2026-10-24T00:00:00Z"): ExecSummaryOverride => ({
    text,
    editedAt,
    editedBy: "",
    source: "generated",
  });

  it("adopts a draft that arrives after the composer has already mounted", () => {
    // THE BUG THIS EXISTS FOR. Step 5 mounts the composer against a session config that
    // does not have the draft in it yet, because the board's refresh is still in flight.
    // Without this the composer sits on "Draft our summary" next to a draft that is
    // already saved, and only a click reveals it.
    expect(shouldAdoptExecSummary(null, drafted("Our lead."), false)).toBe(true);
  });

  it("adopts a newer draft over the one it is already showing", () => {
    expect(
      shouldAdoptExecSummary(
        drafted("First pass.", "2026-10-24T00:00:00Z"),
        drafted("Second pass.", "2026-10-24T00:05:00Z"),
        false
      )
    ).toBe(true);
  });

  it("adopts a deletion, so one member's Delete clears every other board", () => {
    expect(shouldAdoptExecSummary(drafted("Our lead."), null, false)).toBe(true);
  });

  it("never adopts over unsaved edits, whatever arrives", () => {
    // The group's own words are the one thing this must not lose. A member mid-sentence
    // when somebody else drafts again keeps what they are typing.
    expect(shouldAdoptExecSummary(null, drafted("Machine words."), true)).toBe(false);
    expect(shouldAdoptExecSummary(drafted("Old."), drafted("New."), true)).toBe(false);
    expect(shouldAdoptExecSummary(drafted("Old."), null, true)).toBe(false);
  });

  it("stands pat when nothing has changed, so the effect cannot loop", () => {
    expect(shouldAdoptExecSummary(drafted("Same."), drafted("Same."), false)).toBe(false);
    expect(shouldAdoptExecSummary(null, null, false)).toBe(false);
  });

  it("notices a draft the group has since made its own, at identical text", () => {
    // Saving unchanged text flips source to edited and nothing else. The chip above the
    // box reads from that, so the composer has to pick the change up.
    expect(
      shouldAdoptExecSummary(drafted("Same words."), { ...drafted("Same words."), source: "edited" }, false)
    ).toBe(true);
  });
});
