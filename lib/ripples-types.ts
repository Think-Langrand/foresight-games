// Client-safe types + pure helpers for the RIPPLES implications-mapping game.
// No server imports — safe in client components, route handlers, and tests.
//
// The game: players build causal chains of implication cards inside a scenario
// ("In this world…" → "Because of that…" → "And this causes…", branching onward as
// far as the group wants to push it), then wager chips on which implications
// matter. A facilitator advances phases.

import type { WorkshopSession } from "@/lib/workshop-types";

// ---------------------------------------------------------------------------
// Phases (facilitator-advanced, all teams move together)
// ---------------------------------------------------------------------------
// The worksheet flow: read the premise, then one BUILD phase where the whole
// implications tree + the four reflection questions are filled in, then submit.
// (WAGER is retained in the type for the dormant betting routes.)
export type RipplePhase =
  | "LOBBY"
  | "PREMISE"
  | "BUILD"
  | "WAGER"
  | "HARVEST"
  | "CLOSED";

// Ordered — the facilitator's Next ▶ / ◀ Back walk (and the solo self-advance).
export const RIPPLE_PHASES: RipplePhase[] = ["LOBBY", "PREMISE", "BUILD", "HARVEST", "CLOSED"];

export const PHASE_LABELS: Record<RipplePhase, string> = {
  LOBBY: "Lobby",
  PREMISE: "Premise",
  BUILD: "Build",
  WAGER: "Wager",
  HARVEST: "Harvest",
  CLOSED: "Closed",
};

// Implication mapping runs untimed — no phase has a countdown.
export const TIMED_PHASES: RipplePhase[] = [];

export function isRipplePhase(v: string): v is RipplePhase {
  return (RIPPLE_PHASES as string[]).includes(v);
}

// Step the phase pointer; clamps at both ends. `dir` is +1 (next) or -1 (back).
export function stepPhase(current: RipplePhase, dir: 1 | -1): RipplePhase {
  const i = RIPPLE_PHASES.indexOf(current);
  // Unknown (legacy) phase → treat as start so we still move forward sensibly.
  const from = i === -1 ? 0 : i;
  const next = Math.min(RIPPLE_PHASES.length - 1, Math.max(0, from + dir));
  return RIPPLE_PHASES[next];
}

// ---------------------------------------------------------------------------
// Card order + the prompt each level of the tree uses
// ---------------------------------------------------------------------------
// A tree card's order encodes its depth, so the server can check a new card's
// level from the parent row alone — no chain walk. The chain grows as far as a
// group wants to push it, and the three original names are the first three
// entries, so existing boards keep working untouched:
//
//   depth 0 → "FIRST"    (= 1st entry) — a key change, hanging off the scenario
//   depth 1 → "SECOND"
//   depth 2 → "TERMINAL"
//   depth 3+ → "ORDER_4", "ORDER_5", …  (ORDER_n = the nth level = depth n-1)
//
// Raising the cap is appending one string here. `card_order` is plain text with
// no CHECK constraint (supabase/migrations/0007_ripples.sql) — don't add one, or
// this list stops being the single source of truth.
export const TREE_ORDERS = [
  "FIRST",
  "SECOND",
  "TERMINAL",
  "ORDER_4",
  "ORDER_5",
  "ORDER_6",
  "ORDER_7",
  "ORDER_8",
  "ORDER_9",
  "ORDER_10",
] as const;

export type TreeOrder = (typeof TREE_ORDERS)[number];

// STICKY is a freeform brainstorm note, independent of the tree (never a parent
// or child), so it has no depth at all.
export type CardOrder = TreeOrder | "STICKY";

// Deepest tree level, 0-based. A guard against a runaway map, not a design
// limit; real chains stop well short of it.
export const MAX_TREE_DEPTH = TREE_ORDERS.length - 1;

const DEPTH_BY_ORDER = new Map<string, number>(TREE_ORDERS.map((o, i) => [o, i] as const));

// A card order's depth in the tree, or null if it isn't a tree card at all.
// Tolerant of junk (an unrecognised value reads as null) so one bad row can't
// throw the whole board.
export function depthOfOrder(order: CardOrder | string): number | null {
  return DEPTH_BY_ORDER.get(order) ?? null;
}

// The order a card at `depth` must carry; null past the cap.
export function orderAtDepth(depth: number): TreeOrder | null {
  return TREE_ORDERS[depth] ?? null;
}

export function isTreeOrder(v: string): v is TreeOrder {
  return DEPTH_BY_ORDER.has(v);
}

// The card order a given parent's child must be. Root (no parent) → FIRST.
// null = no child allowed: the chain has bottomed out at MAX_TREE_DEPTH, or the
// parent isn't a tree card (a STICKY note never takes children).
export function childOrderOf(parentOrder: CardOrder | null): TreeOrder | null {
  if (parentOrder === null) return "FIRST";
  const depth = depthOfOrder(parentOrder);
  return depth === null ? null : orderAtDepth(depth + 1);
}

// The build-form prompt for a level. Past the second level the phrasing just
// repeats — every further step is another "and this causes…".
export function prefixForDepth(depth: number): string {
  return depth <= 0 ? "In this world…" : depth === 1 ? "Because of that…" : "And this causes…";
}

// 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th"… (11/12/13 are the usual exceptions).
export function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

// How a level is named to the reader: the roots are the key changes, and their
// implications count outward from there (1st order, 2nd order, …).
export function orderLabelForDepth(depth: number): string {
  return depth <= 0 ? "Key change" : `${ordinal(depth)} order`;
}

export const CARD_TEXT_MAX = 200;

// ---------------------------------------------------------------------------
// Per-session config (stored in sessions.config jsonb; snapshotted at create)
// ---------------------------------------------------------------------------
export interface ScenarioResolution {
  uncertaintyId: string;
  title: string;
  resolution: string;
}

// Scenario artwork for the play surface. URLs are the Foresight signed, short-TTL
// URLs — fetched fresh at page load (never snapshotted), so they don't 403 later.
export interface RippleArtImage {
  url: string;
  prompt: string;
}

export interface RipplesConfig {
  scenarioRef: string; // slug (provenance)
  projectRef: string | null; // carmelita ref; null = default tenant
  scenarioTitle: string; // snapshot of Scenario.title
  premise: string; // snapshot of Scenario.body (Markdown)
  resolutions: ScenarioResolution[]; // snapshot of Scenario.linkedUncertainties
  ripple1Seconds: number;
  chainSeconds: number;
  wagerSeconds: number;
  chipsPerPlayer: number;
  challengeEnabled: boolean;
  lensDeckEnabled: boolean;
  // Solo: one person, no lobby/facilitator. The player self-advances phases at
  // their own pace (untimed), the challenge vote is off (it's a group mechanic).
  solo: boolean;
  // Shared board (design groups): many people, no lobby, no per-device board and
  // no team picker — every member auto-joins the ONE pre-seeded team and edits the
  // same map live. Members never advance phases or submit; an admin finalizes.
  sharedTeam: boolean;
  // The reflection questions asked after the three rounds (admin-editable).
  questions: string[];
}

// The default reflection questions (used unless an admin overrides them).
export const DEFAULT_QUESTIONS: string[] = [
  "In this world, what does a public health institute do that it does not do today?",
  "What capability would we need eighteen months before we needed it?",
  "What that we do today loses its purpose, funding, or its permission?",
  "Who would we need relationships with that we do not have now to best do our work?",
];

export const DEFAULT_RIPPLES_CONFIG: RipplesConfig = {
  scenarioRef: "",
  projectRef: null,
  scenarioTitle: "",
  premise: "",
  resolutions: [],
  ripple1Seconds: 300,
  chainSeconds: 600,
  wagerSeconds: 180,
  chipsPerPlayer: 3,
  challengeEnabled: true,
  lensDeckEnabled: false,
  solo: false,
  sharedTeam: false,
  questions: DEFAULT_QUESTIONS,
};

// Coerce a raw jsonb blob (or null) into a complete, well-typed config by merging
// over the defaults. Tolerant of missing/extra keys so old rows keep working.
export function resolveConfig(raw: Record<string, unknown> | null | undefined): RipplesConfig {
  const r = (raw ?? {}) as Partial<Record<keyof RipplesConfig, unknown>>;
  const num = (v: unknown, d: number) => (typeof v === "number" && v > 0 ? v : d);
  const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const resolutions = Array.isArray(r.resolutions)
    ? (r.resolutions as unknown[])
        .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
        .map((x) => ({
          uncertaintyId: str(x.uncertaintyId, ""),
          title: str(x.title, ""),
          resolution: str(x.resolution, ""),
        }))
    : DEFAULT_RIPPLES_CONFIG.resolutions;
  return {
    scenarioRef: str(r.scenarioRef, DEFAULT_RIPPLES_CONFIG.scenarioRef),
    projectRef: typeof r.projectRef === "string" ? r.projectRef : DEFAULT_RIPPLES_CONFIG.projectRef,
    scenarioTitle: str(r.scenarioTitle, DEFAULT_RIPPLES_CONFIG.scenarioTitle),
    premise: str(r.premise, DEFAULT_RIPPLES_CONFIG.premise),
    resolutions,
    ripple1Seconds: num(r.ripple1Seconds, DEFAULT_RIPPLES_CONFIG.ripple1Seconds),
    chainSeconds: num(r.chainSeconds, DEFAULT_RIPPLES_CONFIG.chainSeconds),
    wagerSeconds: num(r.wagerSeconds, DEFAULT_RIPPLES_CONFIG.wagerSeconds),
    chipsPerPlayer: num(r.chipsPerPlayer, DEFAULT_RIPPLES_CONFIG.chipsPerPlayer),
    challengeEnabled: bool(r.challengeEnabled, DEFAULT_RIPPLES_CONFIG.challengeEnabled),
    lensDeckEnabled: bool(r.lensDeckEnabled, DEFAULT_RIPPLES_CONFIG.lensDeckEnabled),
    solo: bool(r.solo, DEFAULT_RIPPLES_CONFIG.solo),
    sharedTeam: bool(r.sharedTeam, DEFAULT_RIPPLES_CONFIG.sharedTeam),
    questions:
      Array.isArray(r.questions) && r.questions.length > 0
        ? (r.questions as unknown[]).filter((q): q is string => typeof q === "string" && q.trim().length > 0)
        : DEFAULT_QUESTIONS,
  };
}

// ---------------------------------------------------------------------------
// Client-facing row types (camelCase; lib/ripples.ts maps snake_case → these)
// ---------------------------------------------------------------------------
export interface RippleTeam {
  id: string;
  code: string;
  name: string;
  color: string;
  joinOrder: number;
  createdTime: string;
}

export interface RipplePlayer {
  id: string;
  teamId: string;
  displayName: string;
  lensId: string | null;
  // Reflection answers keyed by question index ("0".."3"); submittedAt marks done.
  answers: Record<string, string>;
  submittedAt: string | null;
  createdTime: string;
}

export interface RippleCard {
  id: string;
  teamId: string;
  authorPlayerId: string | null;
  order: CardOrder;
  parentId: string | null;
  text: string;
  lensId: string | null;
  flagged: boolean;
  greyed: boolean;
  sort: number; // orders STICKY brainstorm notes (drag-reorder); 0 for tree cards
  section: string | null; // worksheet area key for STICKY cards; null = default board
  sourceCardId: string | null; // admin-seeded copy: the earlier-week answer it came from
  sourceLabel: string | null; // …and that week's title, for the "from …" tag
  createdTime: string;
}

export interface RippleChip {
  id: string;
  teamId: string;
  playerId: string;
  cardId: string;
  createdTime: string;
}

// The aggregated live payload (GET /api/sessions/[code]/ripples).
export interface RipplesView {
  session: WorkshopSession;
  config: RipplesConfig;
  teams: RippleTeam[];
  players: RipplePlayer[];
  cards: RippleCard[];
  chips: RippleChip[];
  fetchedAt: number;
}

// ---------------------------------------------------------------------------
// Pure derivations (used by the harvest panel, export, and unit tests)
// ---------------------------------------------------------------------------

// The tree's roots: parentless cards that aren't brainstorm notes. Keyed off
// parentId rather than order === "FIRST" so a row whose order disagrees with its
// position still reads as the root of its chain.
export function isTreeRoot(card: RippleCard): boolean {
  return card.parentId === null && card.order !== "STICKY";
}

// parentId → its children, sorted oldest-first. Roots live under the null key.
export function buildChildrenMap(cards: RippleCard[]): Map<string | null, RippleCard[]> {
  const map = new Map<string | null, RippleCard[]>();
  for (const c of cards) {
    const key = c.parentId ?? null;
    const arr = map.get(key);
    if (arr) arr.push(c);
    else map.set(key, [c]);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.createdTime.localeCompare(b.createdTime));
  }
  return map;
}

// cardId → its depth in the tree, walked from the roots. This — not the stored
// `card_order` — is what every view labels and colours by, so a row whose order
// disagrees with where it actually sits still reads correctly. Cards orphaned by
// a missing parent, caught in a parent cycle, or past MAX_TREE_DEPTH are absent
// from the map (and so invisible in every view).
export function depthByCard(cards: RippleCard[]): Map<string, number> {
  const children = buildChildrenMap(cards);
  const depths = new Map<string, number>();
  let level = cards.filter(isTreeRoot);
  for (let depth = 0; depth <= MAX_TREE_DEPTH && level.length > 0; depth++) {
    const next: RippleCard[] = [];
    for (const card of level) {
      if (depths.has(card.id)) continue; // cycle guard
      depths.set(card.id, depth);
      next.push(...(children.get(card.id) ?? []));
    }
    level = next;
  }
  return depths;
}

// The deepest implication column a tree will actually draw, 0-based (-1 = none).
// Mirrors the render predicates exactly: every non-greyed card that can still
// take a child renders a ＋ one column further right, and in interactive mode the
// add-a-key-change ＋ always occupies column 0. Drives the column headers. Pass
// `depths` when the caller already has the map, to avoid walking the tree twice.
export function maxRenderedDepth(
  cards: RippleCard[],
  {
    interactive = false,
    depths = depthByCard(cards),
  }: { interactive?: boolean; depths?: Map<string, number> } = {}
): number {
  const byId = new Map(cards.map((c) => [c.id, c] as const));
  let max = interactive ? 0 : -1; // the add-root ＋ always holds column 0
  for (const [id, depth] of depths) {
    if (depth > max) max = depth;
    if (!interactive) continue;
    const card = byId.get(id);
    if (!card || card.greyed) continue;
    if (childOrderOf(card.order) !== null && depth + 1 > max) max = depth + 1;
  }
  return Math.min(max, MAX_TREE_DEPTH);
}

export function chipCountByCard(chips: RippleChip[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const chip of chips) m.set(chip.cardId, (m.get(chip.cardId) ?? 0) + 1);
  return m;
}

// The single longest root→(deepest) path across the given cards. Pass one team's
// cards for a per-team result, or all cards for the best across teams. Memoized,
// with a visiting guard so a malformed parent cycle can't loop forever.
export function longestChain(
  cards: RippleCard[]
): { teamId: string; chain: RippleCard[] } | null {
  if (cards.length === 0) return null;
  const children = buildChildrenMap(cards);
  const memo = new Map<string, RippleCard[]>();

  function longestFrom(card: RippleCard, path: Set<string>): RippleCard[] {
    const cached = memo.get(card.id);
    if (cached) return cached;
    if (path.has(card.id)) return [card]; // cycle guard
    path.add(card.id);
    let best: RippleCard[] = [];
    for (const child of children.get(card.id) ?? []) {
      const sub = longestFrom(child, path);
      if (sub.length > best.length) best = sub;
    }
    path.delete(card.id);
    const result = [card, ...best];
    memo.set(card.id, result);
    return result;
  }

  const roots = cards.filter(isTreeRoot);
  let best: RippleCard[] = [];
  for (const root of roots) {
    const chain = longestFrom(root, new Set());
    if (chain.length > best.length) best = chain;
  }
  if (best.length === 0) return null;
  return { teamId: best[0].teamId, chain: best };
}

// Cards ranked by chip count (desc), ties broken oldest-first. Only cards with at
// least one chip are returned.
export function mostChippedCards(
  cards: RippleCard[],
  chips: RippleChip[],
  topN = 1
): { card: RippleCard; chipTotal: number }[] {
  const counts = chipCountByCard(chips);
  return cards
    .map((card) => ({ card, chipTotal: counts.get(card.id) ?? 0 }))
    .filter((x) => x.chipTotal > 0)
    .sort(
      (a, b) =>
        b.chipTotal - a.chipTotal || a.card.createdTime.localeCompare(b.card.createdTime)
    )
    .slice(0, topN);
}

// Count all descendants of a card (its subtree size, excluding itself).
function countDescendants(cardId: string, children: Map<string | null, RippleCard[]>): number {
  let n = 0;
  const stack = [...(children.get(cardId) ?? [])];
  while (stack.length) {
    const c = stack.pop()!;
    n++;
    const kids = children.get(c.id);
    if (kids) stack.push(...kids);
  }
  return n;
}

// The FIRST-order card that spawned the most direct branches (ties: larger subtree,
// then oldest).
export function mostBranchedFirstOrder(
  cards: RippleCard[]
): { card: RippleCard; branchCount: number; subtreeSize: number } | null {
  const children = buildChildrenMap(cards);
  const roots = cards.filter(isTreeRoot);
  let best: { card: RippleCard; branchCount: number; subtreeSize: number } | null = null;
  for (const root of roots) {
    const branchCount = (children.get(root.id) ?? []).length;
    const subtreeSize = countDescendants(root.id, children);
    if (
      !best ||
      branchCount > best.branchCount ||
      (branchCount === best.branchCount && subtreeSize > best.subtreeSize) ||
      (branchCount === best.branchCount &&
        subtreeSize === best.subtreeSize &&
        root.createdTime.localeCompare(best.card.createdTime) < 0)
    ) {
      best = { card: root, branchCount, subtreeSize };
    }
  }
  return best;
}

// Every root→leaf path for one team, flattened to text + summed chips. Used by the
// JSON export.
export function enumerateChains(
  cards: RippleCard[],
  chips: RippleChip[],
  teamId: string
): { teamId: string; chain: string[]; chipTotal: number }[] {
  const teamCards = cards.filter((c) => c.teamId === teamId);
  const children = buildChildrenMap(teamCards);
  const counts = chipCountByCard(chips);
  const out: { teamId: string; chain: string[]; chipTotal: number }[] = [];

  function walk(card: RippleCard, path: RippleCard[], seen: Set<string>) {
    if (seen.has(card.id)) return; // cycle guard
    seen.add(card.id);
    const nextPath = [...path, card];
    const kids = children.get(card.id) ?? [];
    if (kids.length === 0) {
      out.push({
        teamId,
        chain: nextPath.map((c) => c.text),
        chipTotal: nextPath.reduce((s, c) => s + (counts.get(c.id) ?? 0), 0),
      });
    } else {
      for (const kid of kids) walk(kid, nextPath, seen);
    }
    seen.delete(card.id);
  }

  for (const root of teamCards.filter(isTreeRoot)) {
    walk(root, [], new Set());
  }
  return out;
}
