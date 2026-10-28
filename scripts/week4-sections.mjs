// Week 4's authored prompts, shared by every script that stamps them.
//
// ONE COPY FOR ALL OF scripts/, kept in step with lib/exercise-types.ts BY HAND because
// scripts/ cannot import lib/ (37 of those modules open with `import "server-only"`).
// lib/exercise-types.test.ts asserts this file's keys and steps against the real template,
// so the two can drift in wording but never in which bucket a prompt writes to or which
// tab it lands on.
//
// It lives in its own module rather than inside one script because two scripts now stamp
// these — the dev program reset and the prod-capable stamper — and a third copy would have
// been the one that went stale.

// lib/exercise-types.ts COMMITMENTS_SECTIONS, the six-activity shape as realigned to the
// screenshot design. Kept in step BY HAND because scripts/ cannot import lib/ (it is
// `import "server-only"`), so changing a prompt means changing it in both places or this
// script re-stamps the old text over the new.
//
// THE KEYS ARE THE PERMANENT ANSWER-CARD BUCKETS and are copied verbatim; the labels and
// help text are the display side and may drift without consequence, because a stamped
// exercise owns its own snapshot. `w4-role` is matched by identity by the handoff deck and
// is deliberately NOT renamed although its box is now "Our vision" — the answers under it
// are the same kind of thing.
//
// RETIRED, NEVER REUSED: `w4-attention`, `w4-keep-in-mind` (act 1's two required prompts,
// now one optional notes box) and `w4-outcomes` (outcomes are cards under their priority
// now). Re-stamping lists them as retired; their answers stay on the board.
//
// FOUR BOXES, ONE PER STEP THAT ASKS FOR PROSE. Everything else on the week is a card of a
// kind: scored picks, outcomes, responses, bold moves with their three fields.
export const COMMITMENTS_SECTIONS = [
  {
    key: "w4-notes",
    kind: "question",
    step: "Reconnect",
    label: "Discussion notes",
    help: "Capture anything the group wants to carry into today's discussion. Optional: a brief discussion is enough.",
  },
  {
    key: "w4-overlook",
    kind: "question",
    step: "Prioritize",
    label: "Anything else we should not overlook?",
    help: "Note an important disputed issue and the different views. Optional.",
  },
  {
    key: "w4-role",
    kind: "question",
    step: "Set the vision",
    label: "Our vision",
    help: "Describe what public health becomes and what that makes possible for communities. Two to three sentences the whole group agrees on.",
  },
  {
    key: "w4-together",
    kind: "question",
    step: "Three bold moves",
    label: "How do the three moves work together?",
    help: "Explain how they support one another and make the vision possible.",
  },
];
