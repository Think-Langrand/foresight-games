// Client-safe shaping for the Week 3 SYNTHESIS board. No server imports — safe in client
// components, route handlers, and tests.
//
// One shared board holds three different things in ONE parent tree, told apart only by
// card_kind (migration 0020):
//
//   theme (a FIRST root) ─ implication children (kind null, clustered from Week 2)
//                        └ hope/fear children, alternating with their flip side, deep
//
// Because a theme's implication children and its hope/fear children sit at the SAME tree
// depth, the hopes & fears step cannot use depthByCard — it would interleave the two. It
// walks the KIND-FILTERED subgraph below instead (chainDepth).

import {
  MAX_TREE_DEPTH,
  buildChildrenMap,
  depthByCard,
  isTreeRoot,
  type CardKind,
  type RippleCard,
} from "@/lib/ripples-types";

export type HopeFear = "hope" | "fear";

// A hope's flip side is a fear, and the other way round. This drives the ＋ affordance's
// label and the kind it posts, so the alternation rule lives in exactly one place.
export function flipOf(kind: HopeFear): HopeFear {
  return kind === "hope" ? "fear" : "hope";
}

export function isHopeFear(kind: CardKind | null): kind is HopeFear {
  return kind === "hope" || kind === "fear";
}

// Is it legal for a card of `kind` to hang under a parent of `parentKind`? Returns a human
// sentence when not, so the caller can pass it straight back as the refusal message.
// `parentKind` is undefined when the card is becoming a root.
//
// BOTH the add-a-card and the reparent routes check this, and they must agree: a card that
// slips through either one lands outside chainDepth above — on the board, drawn by no view,
// so visible to nobody and deletable by nobody.
export function placementError(
  kind: CardKind | null,
  parentKind: CardKind | null | undefined
): string | null {
  const root = parentKind === undefined;
  if (kind === "theme") return root ? null : "A theme is a top-level card.";
  if (isHopeFear(kind)) {
    if (root) return "Hopes and fears belong on a theme.";
    if (parentKind === null) return "Write hopes and fears on a theme.";
    if (parentKind !== "theme" && kind !== flipOf(parentKind)) {
      return `A ${parentKind} chains to a ${flipOf(parentKind)}.`;
    }
    return null;
  }
  // A plain implication: a root in the tray, or clustered under a theme.
  if (root || parentKind === null || parentKind === "theme") return null;
  return "Implications belong under a theme.";
}

export interface SynthesisBoard {
  themes: RippleCard[]; // kind 'theme', tree roots, not parked
  unclustered: RippleCard[]; // kind null, tree roots, not parked — the tray
  clusters: Map<string, RippleCard[]>; // themeId → its implication children
  chains: Map<string, RippleCard[]>; // parentId → its hope/fear children
  chainDepth: Map<string, number>; // theme = 0, hope/fear = 1, 2, …
  parked: RippleCard[]; // set aside, non-STICKY
}

// Index a whole Week 3 board in one pass plus one BFS. Every Week 3 selector reads this,
// so callers should memoize it on the card array rather than re-scanning.
//
// `chainDepth` carries the same invisibility contract as depthByCard: a card absent from
// it is drawn by no view. That is deliberate and is why the POST-a-card route refuses a
// hope/fear whose parent is neither a theme nor a hope/fear — such a card would sit in the
// database unreachable from any theme, visible to nobody and deletable by nobody.
export function indexSynthesisBoard(cards: RippleCard[]): SynthesisBoard {
  const themes: RippleCard[] = [];
  const unclustered: RippleCard[] = [];
  const parked: RippleCard[] = [];
  const clusters = new Map<string, RippleCard[]>();
  const chains = new Map<string, RippleCard[]>();

  const push = (map: Map<string, RippleCard[]>, key: string, card: RippleCard) => {
    const arr = map.get(key);
    if (arr) arr.push(card);
    else map.set(key, [card]);
  };

  for (const c of cards) {
    if (c.order === "STICKY") continue; // brainstorm notes live on the sections, not here
    if (c.parked) {
      parked.push(c);
      continue;
    }
    if (isHopeFear(c.cardKind)) {
      if (c.parentId) push(chains, c.parentId, c);
      continue;
    }
    if (c.cardKind === "theme") {
      if (isTreeRoot(c)) themes.push(c);
      continue;
    }
    // A plain implication: either in the tray or clustered under a theme.
    if (c.parentId === null) unclustered.push(c);
    else push(clusters, c.parentId, c);
  }

  // `sort` first, creation time as the tiebreak. Every card starts at sort 0, so a board
  // nobody has reordered still reads in creation order; dragging assigns real sort values.
  const byOrder = (a: RippleCard, b: RippleCard) =>
    a.sort - b.sort || a.createdTime.localeCompare(b.createdTime);
  themes.sort(byOrder);
  unclustered.sort(byOrder);
  parked.sort(byOrder);
  for (const arr of clusters.values()) arr.sort(byOrder);
  for (const arr of chains.values()) arr.sort(byOrder);

  // Breadth-first from the themes, following ONLY hope/fear children. Cycle-guarded and
  // capped at MAX_TREE_DEPTH, so a malformed board truncates instead of spinning.
  const chainDepth = new Map<string, number>();
  let level = themes;
  for (let depth = 0; depth <= MAX_TREE_DEPTH && level.length > 0; depth++) {
    const next: RippleCard[] = [];
    for (const c of level) {
      if (chainDepth.has(c.id)) continue;
      chainDepth.set(c.id, depth);
      next.push(...(chains.get(c.id) ?? []));
    }
    level = next;
  }

  return { themes, unclustered, clusters, chains, chainDepth, parked };
}

// --- Reordering --------------------------------------------------------------
// Dropping a card onto another one puts it in that position. Rather than trying to find a
// midpoint between the neighbours' stored sorts — which collides immediately, because every
// card starts at sort 0 — this renumbers the affected list and reports only the rows that
// actually changed. Lists here hold a handful of cards, so that is a few small writes at
// most, and it can never wedge the way repeated midpoints eventually do.

export const SORT_STEP = 1000;

export interface SortWrite {
  cardId: string;
  sort: number;
}

// Turn "I dropped on the far side of card X" into the id to insert BEFORE (null = the end).
// `movingId` is skipped, because a card being dragged within its own list should not be
// treated as its own neighbour — dropping just after A, when the moving card already sits
// between A and B, has to mean "before B", not "before me".
export function insertionPoint(
  list: RippleCard[],
  anchorId: string,
  after: boolean,
  movingId: string
): string | null {
  const others = list.filter((c) => c.id !== movingId);
  const at = others.findIndex((c) => c.id === anchorId);
  if (at === -1) return null; // the anchor was the moving card, or has gone — drop at the end
  if (!after) return anchorId;
  return others[at + 1]?.id ?? null;
}

// `list` is the list as currently rendered. Move `cardId` to sit where `beforeId` is, or to
// the end when `beforeId` is null. A card already in the list is moved; one from elsewhere
// is inserted. Returns the rows whose sort must change.
export function planReorder(
  list: RippleCard[],
  cardId: string,
  beforeId: string | null
): SortWrite[] {
  const without = list.filter((c) => c.id !== cardId);
  const moved = list.find((c) => c.id === cardId);
  const at = beforeId === null ? without.length : without.findIndex((c) => c.id === beforeId);
  if (beforeId !== null && at === -1) return []; // target left the list under us
  // Dropping a card onto itself, or onto the card right after it, is a no-op.
  if (moved && list[Math.max(0, list.indexOf(moved))] && beforeId === cardId) return [];

  const next = [...without];
  next.splice(at, 0, moved ?? ({ id: cardId } as RippleCard));

  const writes: SortWrite[] = [];
  next.forEach((c, i) => {
    const sort = (i + 1) * SORT_STEP;
    // The moved card always gets written (its parent may be changing too); the others only
    // when their position genuinely shifted.
    if (c.id === cardId || c.sort !== sort) writes.push({ cardId: c.id, sort });
  });
  return writes;
}

// --- Week 2 lineage ----------------------------------------------------------
// What the hopes & fears drill-in shows beside each clustered implication: the chain it
// was part of back in Week 2, and the key change at the head of it.

export interface Week2Lineage {
  keyChange: string; // the root card's text
  chain: string[]; // root text first, this card's own text last
}

// cardId → its Week 2 ANCESTOR path. Keyed by the Week 2 card id, which a seeded Week 3
// card points at via source_card_id.
//
// Not enumerateChains: that returns root→LEAF paths, so a card in the middle of a branching
// map appears in several of them. The ancestor path is the one unique answer to "what chain
// was this part of". Cards the tree walk never placed are omitted, matching every view.
export function lineageByCardId(week2Cards: RippleCard[]): Record<string, Week2Lineage> {
  const depths = depthByCard(week2Cards);
  const children = buildChildrenMap(week2Cards);
  const out: Record<string, Week2Lineage> = {};

  const walk = (card: RippleCard, trail: string[]) => {
    const chain = [...trail, card.text];
    out[card.id] = { keyChange: chain[0], chain };
    for (const kid of children.get(card.id) ?? []) {
      if (depths.has(kid.id) && !out[kid.id]) walk(kid, chain);
    }
  };

  for (const root of week2Cards.filter(isTreeRoot)) {
    if (depths.has(root.id)) walk(root, []);
  }
  return out;
}

export interface ImplicationSeedCandidate {
  id: string;
  text: string;
  keyChange: string; // the key change this implication hangs under
  depth: number;
  createdAt: string;
}

// Week 2's implications, offered as seed candidates for a Week 3 tray and labelled with the
// key change each came from. Excludes the roots (Week 3 clusters IMPLICATIONS, not key
// changes), brainstorm stickies, and cards challenged out of the Week 2 map.
export function implicationSeedCandidates(week2Cards: RippleCard[]): ImplicationSeedCandidate[] {
  const lineage = lineageByCardId(week2Cards);
  const depths = depthByCard(week2Cards);
  return week2Cards
    .filter((c) => c.order !== "STICKY" && !c.greyed && !isTreeRoot(c) && lineage[c.id])
    .map((c) => ({
      id: c.id,
      text: c.text,
      keyChange: lineage[c.id].keyChange,
      depth: depths.get(c.id) ?? 0,
      createdAt: c.createdTime,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
