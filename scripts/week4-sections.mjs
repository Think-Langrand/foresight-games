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

// lib/exercise-types.ts COMMITMENTS_SECTIONS, the six-activity shape. Kept in step BY HAND
// because scripts/ cannot import lib/ (it is `import "server-only"`), so changing a prompt
// means changing it in both places or this script re-stamps the old text over the new.
//
// THE KEYS ARE THE PERMANENT ANSWER-CARD BUCKETS and are copied verbatim; the labels and
// help text are the display side and may drift without consequence, because a stamped
// exercise owns its own snapshot. `w4-role` is matched by identity by the handoff deck and
// is deliberately NOT renamed although its activity is now "Set the vision" — the answers
// under it are the same kind of thing.
//
// ONLY THREE OF THE SIX ACTIVITIES APPEAR HERE. Acts 2, 4 and 6 are boards: the group's
// answer there is what it stars, writes on a card or sharpens, and their discussion
// prompts are guidance that lives in each board's Directions fold.
export const COMMITMENTS_SECTIONS = [
  {
    key: "w4-attention",
    kind: "question",
    step: "Reconnect",
    label: "What most needs our attention in this future?",
    help: "We aren't looking for how the world has changed, but instead looking for what has changed about the world that public health needs to prioritize and act on.",
  },
  {
    key: "w4-keep-in-mind",
    kind: "question",
    step: "Reconnect",
    label: "What is happening in this world that we need to keep in mind today?",
    help: "What has already started happening in this world faster than expected? What is happening now that we are missing?",
  },
  {
    key: "w4-outcomes",
    kind: "question",
    step: "Desired outcomes",
    label:
      "Looking at your priorities and hopes, what do you want public health to make possible for communities in this future?",
    help: "One or two for each priority. Write what would be different for communities if public health did its job well here.",
  },
  {
    key: "w4-role",
    kind: "question",
    step: "Set the vision",
    label: "What future do you want to work toward?",
    help: "Looking across our desired outcomes and response ideas, what future do we want to work toward? What would be different for communities because public health acted; what is public health making possible?",
    test: "Pressure test: Is this worth achieving for people? Does it respond to the particular conditions of our scenario?",
  },
];
