// Fold one design group's whole program into the handoff summary.
//
// WHAT THIS IS FOR. Every other read of a group is per-week: the member board shows the week
// you are in, the admin viewer shows one week per tab. Nothing reads the program end to end,
// and the group's final deliverable is exactly that — the scenario, the six key changes and
// their scores, the themes with what each puts at stake, the hopes and fears with their flips,
// and what the room never settled. This shapes that one payload.
//
// IT IS PURE, and takes the SHAPED weeks (lib/group-answers.shapeExerciseAnswers) rather than
// boards, so it reuses the same projection the admin viewer trusts and stays testable without
// a database.
//
// IT REPORTS WHAT IS MISSING, deliberately. Across the real cohort four fields the Session 3
// board offers came back empty in every group: the four exploration answers, each risk and
// opportunity's mechanism, the shortlist star, and a theme's description. A summary that
// silently omitted them would read as though the room had nothing to say, so `gaps` counts
// them and the page prints the count. An empty slot is a fact about the session, not a finding.

import type {
  ExerciseAnswers,
  StakeRow,
  SynthesisTheme,
} from "@/components/design-groups/AnswerPanels";
import type { RippleCard } from "@/lib/ripples-types";
import { orderLabelForDepth, TREE_ORDERS } from "@/lib/ripples-types";
import { READING_FIELDS } from "@/lib/synthesis-shape";

// A key change, split so the page can lead with the label the group typed. Three groups
// prefixed theirs ("POWER: …"), one numbered them ("1. …"), one wrote plain sentences — so
// the label is optional and the body always carries the whole claim.
//
// No chain here on purpose: the handoff draws the map with ImplicationsPanel, the same
// read-only component a group gets when it tabs back to Session 2 from Session 3, and that
// builds the tree, the branch chips and the order filters from `ex.cards` itself. A second
// tree shaped here would be a copy that can disagree with it.
export interface SummaryKeyChange {
  id: string;
  label: string | null;
  body: string;
  plausibility: number | null;
  impact: number | null;
}

export interface SummaryTheme {
  id: string;
  text: string;
  description: string | null;
  implications: number;
  risks: StakeRow[];
  opportunities: StakeRow[];
}

// A fear and the hopes the room wrote from the same facts. `hopes` is a list because a fear
// can be flipped more than once; empty means the room left the fear standing.
export interface SummaryFlip {
  id: string;
  fear: string;
  hopes: string[];
}

export interface SummaryOrderCount {
  label: string;
  n: number;
}

// One end of the Session 2 → Session 3 flow.
export interface ClusterNode {
  id: string;
  label: string;
  total: number; // traced implications at this end
}

export interface ClusterLink {
  sourceId: string; // a key change
  themeIndex: number; // index into ClusterFlow.themes
  count: number;
}

// How a group's implications regrouped: which key change each clustered implication came
// from, and which theme it ended up in.
//
// The lineage is two hops and only runs one way. A Session 3 implication is a COPY carrying
// `sourceCardId` back to its Session 2 card, and that card's parent chain ends at a key
// change — so "this theme drew on that key change" is reconstructible, which is the whole
// point of the slide. `untraced` is the honest remainder: a filed card whose source is null
// or points outside the Session 2 board, which happens for facilitator-added cards.
export interface ClusterFlow {
  keyChanges: ClusterNode[];
  themes: ClusterNode[];
  links: ClusterLink[];
  traced: number;
  untraced: number;
}

export interface SummaryGaps {
  explorationAnswers: number; // cards of a READING_FIELDS kind
  explorationSlots: number; // themes × 4
  mechanisms: number; // risks + opportunities carrying one
  stakes: number; // risks + opportunities in total
  starred: number;
  themeDescriptions: number;
  themes: number;
}

export interface GroupSummary {
  groupName: string;
  scenarioTitle: string | null;
  // Which weeks actually have a board with work on it, so the page can say "not yet" rather
  // than render an empty section as if it were the finding.
  has: { assessment: boolean; implications: boolean; synthesis: boolean };
  keyChanges: SummaryKeyChange[];
  orderCounts: SummaryOrderCount[];
  totalImplicationCards: number;
  themes: SummaryTheme[];
  clusterFlow: ClusterFlow;
  unclustered: number;
  flips: SummaryFlip[];
  standaloneHopes: string[];
  gaps: SummaryGaps;
  unsettled: { bucket: string; text: string }[];
}

// Week 1's assess block keys, in the order the handoff reads them. These are permanent
// section keys (lib/exercise-types.ts) — minted once, never renamed.
const UNSETTLED_BLOCKS: { key: string; bucket: string }[] = [
  { key: "assess-unclear", bucket: "Unclear" },
  { key: "assess-assumptions", bucket: "Assumed" },
  { key: "assess-missing", bucket: "Missing" },
];

const READING_SET = new Set<string>(READING_FIELDS);

// "POWER: Power is in the hands…" → label "POWER". A leading "1." is dropped as numbering
// rather than kept as a label.
//
// A label is the run before the first colon, and it is recognised by SHOUTING rather than by
// an all-caps character class: the real ones include "FUNDING and BUDGET" and "CROSS-SECTOR
// WORK/SDOH", so a lowercase connector has to be allowed. Requiring most of the letters to be
// uppercase is what keeps a sentence's own colon out — "Transient population leading to:
// Funding issues, …" is one of the six key changes, and it is not a label.
const LABEL_MAX = 46;
const SHOUT_RATIO = 0.6;

export function splitKeyChange(text: string): { label: string | null; body: string } {
  const t = text.trim();
  // [\s\S] rather than . with the `s` flag: this tsconfig targets below es2018.
  const numbered = t.match(/^\d+\.\s*([\s\S]+)$/);
  const rest = numbered ? numbered[1].trim() : t;

  const at = rest.indexOf(":");
  if (at > 1 && at <= LABEL_MAX) {
    const head = rest.slice(0, at).trim();
    const body = rest.slice(at + 1).trim();
    const letters = head.replace(/[^A-Za-z]/g, "");
    const shouted = head.replace(/[^A-Z]/g, "").length;
    if (body && letters.length >= 2 && shouted / letters.length >= SHOUT_RATIO) {
      return { label: head.replace(/\s+/g, " "), body };
    }
  }
  return { label: null, body: rest };
}

// A theme with the letter the handoff knows it by. The letter is assigned from BOARD order
// and travels with the theme, so slides may disagree about sequence but never about which
// theme is which.
export interface LetteredTheme {
  theme: SummaryTheme;
  boardIndex: number;
  letter: string;
}

// Themes ordered by how much they put at stake, most first.
//
// Shared by the themes slide and the risks-and-opportunities slide, which both order this
// way — two copies of the comparator drifted once already. Ties keep board order, which
// makes the sort stable rather than dependent on the engine's: Group 3 has three themes at
// seven stakes each, and they should not reshuffle between renders.
export function themesByStakes(themes: SummaryTheme[]): LetteredTheme[] {
  const stakes = (t: SummaryTheme) => t.risks.length + t.opportunities.length;
  return themes
    .map((theme, boardIndex) => ({
      theme,
      boardIndex,
      letter: String.fromCharCode(65 + boardIndex),
    }))
    .sort((a, b) => stakes(b.theme) - stakes(a.theme) || a.boardIndex - b.boardIndex);
}

function pick(weeks: ExerciseAnswers[], kind: "worksheet" | "implications" | "synthesis") {
  return weeks.find((w) => w.kind === kind);
}

export function buildGroupSummary(
  weeks: ExerciseAnswers[],
  group: { name: string; scenarioTitle?: string | null }
): GroupSummary {
  const assessment = pick(weeks, "worksheet");
  const implications = pick(weeks, "implications");
  const synthesis = pick(weeks, "synthesis");

  // ---- Week 2: key changes and their chains -------------------------------------------
  const cards: RippleCard[] = implications?.kind === "implications" ? implications.cards : [];
  const roots = cards.filter((c) => c.order === "FIRST");
  const keyChanges: SummaryKeyChange[] = roots.map((c) => {
    const { label, body } = splitKeyChange(c.text);
    return { id: c.id, label, body, plausibility: c.plausibility, impact: c.impact };
  });

  const byOrder = new Map<string, number>();
  for (const c of cards) {
    if (c.order === "STICKY") continue;
    byOrder.set(c.order, (byOrder.get(c.order) ?? 0) + 1);
  }
  const orderCounts: SummaryOrderCount[] = TREE_ORDERS.filter((o) => byOrder.has(o)).map((o) => ({
    label: orderLabelForDepth(TREE_ORDERS.indexOf(o)),
    n: byOrder.get(o) ?? 0,
  }));

  // ---- Week 3: themes, stakes, flips, and the empty slots -----------------------------
  const sCards: RippleCard[] = synthesis?.kind === "synthesis" ? synthesis.cards : [];
  const sThemes: SynthesisTheme[] = synthesis?.kind === "synthesis" ? synthesis.themes : [];

  const themes: SummaryTheme[] = sThemes.map((t) => ({
    id: t.id,
    text: t.text,
    description: t.description,
    implications: t.implications.length,
    risks: t.risks,
    opportunities: t.opportunities,
  }));

  const fears = sCards.filter((c) => c.cardKind === "fear");
  const hopes = sCards.filter((c) => c.cardKind === "hope");
  const fearIds = new Set(fears.map((f) => f.id));
  const flips: SummaryFlip[] = fears.map((f) => ({
    id: f.id,
    fear: f.text.trim(),
    hopes: hopes.filter((h) => h.parentId === f.id).map((h) => h.text.trim()).filter(Boolean),
  }));
  // A hope the room wrote on its own: board-level, not hanging off a fear.
  const standaloneHopes = hopes
    .filter((h) => !h.parentId || !fearIds.has(h.parentId))
    .map((h) => h.text.trim())
    .filter(Boolean);

  // ---- Session 2 → Session 3: which key change fed which theme -------------------------
  // Walk a Session 2 card up to the key change it hangs from. Cycle-guarded: parent_card_id
  // is a self-referencing FK with nothing stopping a loop.
  const w2 = new Map(cards.map((c) => [c.id, c]));
  const rootOf = (startId: string): string | null => {
    let cur = w2.get(startId);
    const seenUp = new Set<string>();
    while (cur && cur.parentId && !seenUp.has(cur.id)) {
      seenUp.add(cur.id);
      const next = w2.get(cur.parentId);
      if (!next) break;
      cur = next;
    }
    return cur && cur.order === "FIRST" ? cur.id : null;
  };

  const themeIndexById = new Map(themes.map((t, i) => [t.id, i]));
  const kcById = new Map(keyChanges.map((k) => [k.id, k]));
  const linkCounts = new Map<string, number>(); // `${keyChangeId}:${themeIndex}`
  const kcTotals = new Map<string, number>();
  const themeTotals = new Map<number, number>();
  let traced = 0;
  let untraced = 0;

  for (const c of sCards) {
    if (c.cardKind !== null) continue; // themes, hopes, fears, risks, opportunities
    const ti = c.parentId ? themeIndexById.get(c.parentId) : undefined;
    if (ti === undefined) continue; // unclustered, or hanging off something else
    const kc = c.sourceCardId ? rootOf(c.sourceCardId) : null;
    if (!kc || !kcById.has(kc)) {
      untraced += 1;
      continue;
    }
    traced += 1;
    const k = `${kc}:${ti}`;
    linkCounts.set(k, (linkCounts.get(k) ?? 0) + 1);
    kcTotals.set(kc, (kcTotals.get(kc) ?? 0) + 1);
    themeTotals.set(ti, (themeTotals.get(ti) ?? 0) + 1);
  }

  const clusterFlow: ClusterFlow = {
    // Key changes in their board order, but only the ones that actually fed a theme — a
    // source node with nothing leaving it is a label with no ribbon.
    keyChanges: keyChanges
      .filter((k) => (kcTotals.get(k.id) ?? 0) > 0)
      .map((k) => ({
        id: k.id,
        label: k.label ?? k.body,
        total: kcTotals.get(k.id) ?? 0,
      })),
    themes: themes.map((t, i) => ({ id: t.id, label: t.text, total: themeTotals.get(i) ?? 0 })),
    links: [...linkCounts.entries()].map(([k, count]) => {
      const [sourceId, ti] = k.split(":");
      return { sourceId, themeIndex: Number(ti), count };
    }),
    traced,
    untraced,
  };

  const stakeRows: StakeRow[] = themes.flatMap((t) => [...t.risks, ...t.opportunities]);
  const gaps: SummaryGaps = {
    explorationAnswers: sCards.filter((c) => c.cardKind && READING_SET.has(c.cardKind)).length,
    explorationSlots: themes.length * READING_FIELDS.length,
    mechanisms: stakeRows.filter((r) => r.mechanism && r.mechanism.trim()).length,
    stakes: stakeRows.length,
    starred: stakeRows.filter((r) => r.shortlisted).length,
    themeDescriptions: themes.filter((t) => t.description && t.description.trim()).length,
    themes: themes.length,
  };

  // ---- Week 1: what the room never settled --------------------------------------------
  const unsettled: { bucket: string; text: string }[] = [];
  if (assessment?.kind === "worksheet") {
    for (const { key, bucket } of UNSETTLED_BLOCKS) {
      const block = assessment.questions.find((q) => q.key === key);
      for (const a of block?.answers ?? []) {
        const text = a.text.trim();
        if (text) unsettled.push({ bucket, text });
      }
    }
  }

  return {
    groupName: group.name,
    scenarioTitle: group.scenarioTitle ?? null,
    has: {
      assessment: assessment?.kind === "worksheet" && assessment.questions.some((q) => q.answers.length > 0),
      implications: cards.length > 0,
      synthesis: sCards.length > 0,
    },
    keyChanges,
    orderCounts,
    totalImplicationCards: cards.length,
    themes,
    clusterFlow,
    unclustered: synthesis?.kind === "synthesis" ? synthesis.unclustered.length : 0,
    flips,
    standaloneHopes,
    gaps,
    unsettled,
  };
}
