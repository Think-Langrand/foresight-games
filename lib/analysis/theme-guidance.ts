// What makes a good theme, in the facilitator's own words. Client-safe (strings only), so
// the admin page can show it, and the model prompts can share it rather than drifting apart.
//
// This is the guidance that decides whether a run is useful. Without it the model reliably
// returns buckets — "Workforce", "Technology", "Trust" — which are categories a group
// already knew it had, not insights about what is changing. The bullets are the failure
// modes seen in real sessions, each paired with the question that fixes it.

// The framing line. Everything else is a way of failing it.
export const THEME_PREMISE =
  "Group by what is SHIFTING in this future — the changed conditions — not by subject matter.";

// The five pitfalls that bear on GROUPING and NAMING. Used in both the clustering prompt
// and the cluster-naming prompt.
export const GROUPING_PITFALLS = [
  "Categories instead of themes: “Workforce,” “technology” and “trust” are buckets, not " +
    "insights. Say what is actually changing about them.",
  "Jumping to responses: “Build new partnerships” is something an organization might do. " +
    "Name the changed condition that makes such a response useful, not the response.",
  "Stopping at the obvious: push one level further. Who experiences this differently? What " +
    "second-order effect could emerge?",
  "Making everything about the organization: include what this means for communities, " +
    "workers, partners and the wider system.",
  "Generic aspirations: “Healthy communities,” “equity” and “trust” are too broad on their " +
    "own. Say what that would actually look like in this scenario.",
] as const;

// The remaining three pitfalls concern HOPES AND FEARS (Session 3 steps 3–4), not grouping.
// Kept here so the guidance lives in one place and nothing the facilitator wrote is lost,
// but deliberately NOT sent in the clustering prompt: telling a model that groups
// implications to avoid comfortable fears steers it toward material that is not in front
// of it. They are offered in the page as a paste-in for a custom prompt instead.
export const HOPES_FEARS_PITFALLS = [
  "Hopes and fears rooted in today’s system: they should reflect the conditions and " +
    "constraints of your scenario.",
  "Avoiding uncomfortable fears: some of the most useful material involves loss of " +
    "legitimacy, relevance, control, funding or power.",
  "Assuming the direct opposite is desirable: flip it and test it. Ask what we are really " +
    "trying to protect here.",
] as const;

function bullets(items: readonly string[]): string {
  return items.map((p) => `• ${p}`).join("\n");
}

// What goes into the grouping and naming prompts.
export const GROUPING_GUIDANCE = `${THEME_PREMISE}\n\nWatch out for:\n${bullets(
  GROUPING_PITFALLS
)}`;

// The whole thing, for the page to offer as a starting point for a custom prompt.
export const FULL_GUIDANCE = `${THEME_PREMISE}\n\nWatch out for:\n${bullets([
  ...GROUPING_PITFALLS,
  ...HOPES_FEARS_PITFALLS,
])}`;
