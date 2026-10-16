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

// How long a theme's NAME may be, and where everything else goes.
//
// The prompts already carry a 60-character exemplar ("Responsibility moves to communities
// faster than resources do", 8 words), and the model ignored it: a real run returned names
// of 10 to 18 words, the long ones tacking a list of consequences onto the end —
// "Sectors blur faster than governance adapts, creating accountability vacuums, value
// deadlock, and chronic neglect of upstream work." The first five words are the theme; the
// rest is the summary's job, and the name is what has to fit on a card and be read aloud.
//
// So the limit is stated as a rule rather than modelled by example, and it says where the
// displaced material should go — otherwise the model drops it instead of moving it.
export const NAME_SHAPE =
  "Keep each theme's NAME SHORT: at most 12 words, a single clause, and no trailing list " +
  "of consequences. 'Responsibility moves to communities faster than resources do' is the " +
  "length to aim for. What the shift leads to, who it affects and what it puts at risk all " +
  "belong in the one-sentence summary, NOT in the name.";

// Write like a person. Every prompt here that produces text a human reads carries this.
//
// The patterns are the ones from Wikipedia's "Signs of AI writing" that can actually occur in
// a twelve-word phrase or a short paragraph — most of that catalogue is about headings,
// emojis and conclusions, which a theme name cannot have. These are the ones observed in real
// output from this very tool: the first pass of facilitator-written implications ran to
// "becomes a function in its own right" and "creating accountability vacuums, value deadlock,
// and chronic neglect", and had to be rewritten by hand.
//
// Stated as words to avoid rather than as "sound natural", because a model given the second
// instruction produces the same prose and adds a sentence claiming it is plain.
//
// WHY THERE ARE TWO VARIANTS. These tells divide into ones about vocabulary, which hold
// wherever the model is writing, and two about LENGTH, which only hold for a name. "Name the
// one that carries the weight" and "one clause is enough" are right for twelve words on a
// card and wrong for a paragraph: the summary prompts ask for several risks and several
// opportunities, and a group with four real risks must be able to return four. Sent verbatim
// to a prose prompt they contradict that prompt's own instructions and the strongest reading
// of them wins, which is how a facilitator ends up with one risk out of four.
const SHARED_TELLS = [
  "Inflated significance: pivotal, crucial, vital, key, era, landscape, paradigm, " +
    "underscores, redefines, reshapes, transforms, marks a shift.",
  "Filler vocabulary: navigate, leverage, foster, enhance, robust, holistic, nuanced, " +
    "intricate, interplay, tapestry, realm, seamless, dynamic, delve.",
  "Dodging the verb \"is\": serves as, stands as, emerges as, represents a, acts as.",
  "A trailing -ing clause that fakes depth: \"…, reshaping how trust works\".",
  "\"Not just X but Y\", \"at its core\", \"the real question is\".",
] as const;

// The two that are about a NAME's length. Only the naming prompts get these.
const NAME_LENGTH_TELLS = [
  "Three of anything: \"trust, capacity and legitimacy\". Name the one that carries the weight.",
  "Em dashes and semicolons. One clause is enough.",
] as const;

// The prose equivalents. The rule-of-three one keeps the real tell — padding to three for
// rhythm — without telling a prompt that asked for a list to return one item.
const PROSE_LENGTH_TELLS = [
  "Padding a list to three for rhythm. If the material holds two, give two; if it holds " +
    "four, give four. Never invent a third to round out a sentence.",
  "Em dashes and semicolons. A comma or a full stop does the same work.",
] as const;

export const PLAIN_WORD_TELLS = [...SHARED_TELLS, ...NAME_LENGTH_TELLS] as const;

const ORDINARY_WORDS =
  "\n\nOrdinary words for ordinary things: people, money, staff, rules, time, who decides. " +
  "The group's own domain words are fine — surveillance, accreditation, legitimacy — but a " +
  "word that appears only in strategy documents is not.";

// For the prompts that write a theme NAME.
export const PLAIN_WORDS =
  "Write like a person, in the plainest words that are true. These are the tells that give a " +
  `machine away, and every one of them turns up in theme names:\n${bullets(PLAIN_WORD_TELLS)}` +
  ORDINARY_WORDS;

// For the prompts that write a PARAGRAPH or a list a facilitator reads.
export const PLAIN_WORDS_PROSE =
  "Write like a person, in the plainest words that are true. These are the tells that give a " +
  `machine away:\n${bullets([...SHARED_TELLS, ...PROSE_LENGTH_TELLS])}` +
  ORDINARY_WORDS;

// --- the grouping prompt, composed ------------------------------------------------
// Here rather than in implication-cluster.ts (which is server-only) because the admin
// playground seeds its editable prompt box from this. That matters: `promptOverride`
// REPLACES the system prompt, so a facilitator handed only the guidance above would
// unknowingly drop the id discipline and theme-shape instructions the JSON schema depends
// on, and get worse output from a box that looked like an improvement. They edit the real
// prompt or they edit nothing.

export const SYSTEM_GROUP =
  "You are a foresight facilitator preparing a workshop. A group mapped out the " +
  "implications of a future scenario; your job is to propose how those implications " +
  "could be clustered into themes, so the group has somewhere to start rather than a " +
  "blank board.";

export const SYSTEM_COHORT =
  "You are a foresight facilitator preparing a plenary session. SEVERAL groups each " +
  "mapped out the implications of a future scenario, and all of their implications are " +
  "pooled below. Your job is to propose the themes that run across the whole cohort, so " +
  "the facilitator can show every room what they collectively found.";

// The mechanics the response schema depends on. Changing these changes what comes back.
export const THEME_INSTRUCTIONS =
  "Name each theme as a STATEMENT ABOUT CHANGE — 'Responsibility moves to communities " +
  "faster than resources do', not 'Community capacity'. " +
  NAME_SHAPE +
  " Use the ids exactly as given. " +
  "Aim for 3-6 themes unless the facilitator's criteria say otherwise. These are " +
  "suggestions a group will argue with, so prefer a cut that is interesting and " +
  "arguable over one that is safe.\n\n" +
  "An implication MAY belong to more than one theme — put it in every theme it " +
  "genuinely speaks to, and do not force a choice where it bridges two. Equally, an " +
  "implication that fits nothing well should be left out of every theme rather than " +
  "pushed into the nearest one; outliers are useful to see.";

export function composeClusterPrompt(framing: "group" | "cohort"): string {
  return [
    framing === "cohort" ? SYSTEM_COHORT : SYSTEM_GROUP,
    GROUPING_GUIDANCE,
    THEME_INSTRUCTIONS,
    PLAIN_WORDS,
  ].join("\n\n");
}
