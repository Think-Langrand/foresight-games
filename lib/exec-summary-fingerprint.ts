import { createHash } from "node:crypto";
import type { ExecSummaryInput } from "@/lib/analysis/exec-summary";

// A FINGERPRINT OF THE MATERIAL A HANDOFF LEAD WAS DRAFTED FROM.
//
// This is what lets the generate route tell a group that changed an answer from a group
// that came back to read what it already has. See execSummaryReuse for why a timestamp
// could not do it.
//
// IT HASHES THE MODEL'S INPUT, exactly — the same object handed to draftExecSummary and
// nothing else. Anything the draft was written from belongs here, because a change to it
// makes the draft stale; anything else must stay out, because a change to it would throw
// away a perfectly good lead. That is why this takes ExecSummaryInput rather than the board:
// the two cannot drift apart if there is only one thing to pass.
//
// SERVER-SIDE ONLY (node:crypto, and only the generate route imports it). The decision this
// feeds is made on the server for one source of truth, so no client needs it.
//
// BUILT AS AN ARRAY, not from JSON.stringify of the input. Key order is an accident of how
// a caller happened to build the object, and two members' boards assembling the same
// material must agree — if they did not, each would regenerate and the dedup would be
// pointless. Nesting is kept rather than flattened so that merging two answers into one
// cannot hash the same as leaving them apart.
export function execSummaryFingerprint(input: ExecSummaryInput): string {
  const canonical = [
    input.scenarioTitle.trim(),
    input.changes.map((b) => [b.label, b.answers]),
    input.role.map((b) => [b.label, b.answers]),
    input.keyChanges,
    // The score, not just the words: the lead leans on what the group ranked highest, so a
    // re-placed chip is a change to what it was written from.
    input.stakes.map((s) => [s.text, s.score]),
    input.responses,
  ];
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 32);
}
