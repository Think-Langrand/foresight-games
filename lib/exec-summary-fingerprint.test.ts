import { describe, expect, it } from "vitest";
import { execSummaryFingerprint } from "./exec-summary-fingerprint";
import type { ExecSummaryInput } from "./analysis/exec-summary";

const base: ExecSummaryInput = {
  scenarioTitle: "The Public Works",
  changes: [{ label: "What is different", answers: ["Transit is free.", "Clinics moved."] }],
  role: [{ label: "Our role", answers: ["Convene."] }],
  keyChanges: ["Ridership doubles"],
  stakes: [
    { text: "Funding collapses", score: 20 },
    { text: "New coalitions", score: 12 },
  ],
  responses: ["Fund the pilot."],
  directions: ["Fund the pilot permanently — The purpose: the funding priority."],
};

describe("execSummaryFingerprint", () => {
  it("is stable for the same material, so reopening a board reuses the draft", () => {
    expect(execSummaryFingerprint(base)).toBe(execSummaryFingerprint({ ...base }));
  });

  it("is stable across separately built copies of equal material", () => {
    // Two members' boards assemble this independently from the same cards. If the hash
    // depended on object identity or key order the two would disagree and each would
    // regenerate, which is the whole failure being designed out.
    const copy: ExecSummaryInput = JSON.parse(JSON.stringify(base));
    expect(execSummaryFingerprint(copy)).toBe(execSummaryFingerprint(base));
  });

  it("changes when an answer is edited", () => {
    const edited = {
      ...base,
      changes: [{ label: "What is different", answers: ["Transit is free.", "Clinics closed."] }],
    };
    expect(execSummaryFingerprint(edited)).not.toBe(execSummaryFingerprint(base));
  });

  it("changes when an answer is deleted", () => {
    const fewer = {
      ...base,
      changes: [{ label: "What is different", answers: ["Transit is free."] }],
    };
    expect(execSummaryFingerprint(fewer)).not.toBe(execSummaryFingerprint(base));
  });

  it("changes when a bold move is added", () => {
    const more = { ...base, role: [{ label: "Our role", answers: ["Convene.", "Fund it."] }] };
    expect(execSummaryFingerprint(more)).not.toBe(execSummaryFingerprint(base));
  });

  it("changes when the ranking changes, because the lead leans on what ranked highest", () => {
    const reranked = {
      ...base,
      stakes: [
        { text: "New coalitions", score: 25 },
        { text: "Funding collapses", score: 20 },
      ],
    };
    expect(execSummaryFingerprint(reranked)).not.toBe(execSummaryFingerprint(base));
  });

  it("changes when a response or key change moves", () => {
    expect(execSummaryFingerprint({ ...base, responses: ["Fund two pilots."] })).not.toBe(
      execSummaryFingerprint(base)
    );
    expect(execSummaryFingerprint({ ...base, keyChanges: ["Ridership halves"] })).not.toBe(
      execSummaryFingerprint(base)
    );
  });

  it("does not confuse two blocks whose answers could be run together", () => {
    // ["a","b"] and ["ab"] must not hash alike, or an edit that merges two answers into
    // one would read as no change at all.
    const split = { ...base, responses: ["a", "b"] };
    const joined = { ...base, responses: ["ab"] };
    expect(execSummaryFingerprint(split)).not.toBe(execSummaryFingerprint(joined));
  });
});
