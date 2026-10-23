import { describe, expect, it } from "vitest";
import {
  EXEC_SUMMARY_LIMITS,
  coerceExecSummary,
  execSummaryDefaultText,
} from "./exec-summary-shape";

const block = (key: string, label: string, answers: string[]) => ({ key, label, answers });

describe("coerceExecSummary", () => {
  it("reads a well-formed override", () => {
    expect(
      coerceExecSummary({ text: "We lead with this.", editedAt: "2026-10-23T00:00:00Z", editedBy: "Mara" })
    ).toEqual({ text: "We lead with this.", editedAt: "2026-10-23T00:00:00Z", editedBy: "Mara" });
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
    expect(o).toEqual({ text: "Kept.", editedAt: "", editedBy: "" });
  });

  it("ignores keys it does not know", () => {
    const o = coerceExecSummary({ text: "Kept.", blocks: [1, 2], reopenedAt: "x" });
    expect(o).toEqual({ text: "Kept.", editedAt: "", editedBy: "" });
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
