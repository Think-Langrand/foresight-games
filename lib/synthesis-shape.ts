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

// Step 2's three lists. What could be lost or gained and through what mechanism, plus the
// surprises and disagreements worth preserving — all hanging off a theme.
export const STAKE_KINDS = ["risk", "opportunity", "tension"] as const;
export type StakeKind = (typeof STAKE_KINDS)[number];
const STAKE_SET = new Set<string>(STAKE_KINDS);

export function isStake(kind: CardKind | null): kind is StakeKind {
  return kind !== null && STAKE_SET.has(kind);
}

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
  switch (kind) {
    case "theme":
      return root ? null : "A theme is a top-level card.";

    case "risk":
    case "opportunity":
    case "tension":
      return parentKind === "theme" ? null : "That belongs on a theme.";

    case "assumption":
      return isHopeFear(parentKind ?? null)
        ? null
        : "An assumption belongs on a hope or a fear.";

    case "hope":
    case "fear":
      if (root) return "Hopes and fears belong on a theme.";
      if (parentKind === "theme") return null;
      if (!isHopeFear(parentKind ?? null)) return "Write hopes and fears on a theme.";
      // parentKind is a hope or fear: only its flip side may chain off it.
      return kind === flipOf(parentKind as HopeFear)
        ? null
        : `A ${parentKind} chains to a ${flipOf(parentKind as HopeFear)}.`;

    case null:
      // A plain implication: a root in the tray, or clustered under a theme. Under another
      // implication is how Week 2's maps already read, so that stays legal too.
      if (root || parentKind === null || parentKind === "theme") return null;
      return "Implications belong under a theme.";

    default: {
      // Adding a CARD_KIND without deciding where it may live fails to compile here.
      const exhaustive: never = kind;
      return `Unknown card kind: ${String(exhaustive)}`;
    }
  }
}

export interface SynthesisBoard {
  themes: RippleCard[]; // kind 'theme', tree roots, not parked
  unclustered: RippleCard[]; // kind null, tree roots, not parked — the tray
  clusters: Map<string, RippleCard[]>; // themeId → its implication children
  risks: Map<string, RippleCard[]>; // themeId → its risk cards
  opportunities: Map<string, RippleCard[]>; // themeId → its opportunity cards
  tensions: Map<string, RippleCard[]>; // themeId → its surprises & disagreements
  chains: Map<string, RippleCard[]>; // parentId → its hope/fear children
  assumptions: Map<string, RippleCard[]>; // hope/fear id → the assumptions under it
  chainDepth: Map<string, number>; // theme = 0, hope/fear = 1, 2, …
  parked: RippleCard[]; // set aside, non-STICKY
  // Cards no bucket could legitimately hold: a hope with no theme above it, a risk hung
  // off an implication. They are surfaced rather than dropped — see the note below.
  orphans: RippleCard[];
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
  const orphans: RippleCard[] = [];
  const clusters = new Map<string, RippleCard[]>();
  const risks = new Map<string, RippleCard[]>();
  const opportunities = new Map<string, RippleCard[]>();
  const tensions = new Map<string, RippleCard[]>();
  const chains = new Map<string, RippleCard[]>();
  const assumptions = new Map<string, RippleCard[]>();

  const push = (map: Map<string, RippleCard[]>, key: string, card: RippleCard) => {
    const arr = map.get(key);
    if (arr) arr.push(card);
    else map.set(key, [card]);
  };
  // A stake card belongs to a theme; without a parent it belongs nowhere.
  const stake = (map: Map<string, RippleCard[]>, c: RippleCard) => {
    if (c.parentId) push(map, c.parentId, c);
    else orphans.push(c);
  };

  for (const c of cards) {
    if (c.order === "STICKY") continue; // brainstorm notes live on the sections, not here
    if (c.parked) {
      parked.push(c);
      continue;
    }
    // An exhaustive switch, NOT an if-chain: adding a CARD_KIND without deciding where it
    // lives fails to compile at the `never` below. Two bugs on this feature were cards
    // falling silently through the old chain into a bucket that was wrong, or into none.
    switch (c.cardKind) {
      case "theme":
        if (isTreeRoot(c)) themes.push(c);
        else orphans.push(c);
        break;
      case "hope":
      case "fear":
        if (c.parentId) push(chains, c.parentId, c);
        else orphans.push(c);
        break;
      case "risk":
        stake(risks, c);
        break;
      case "opportunity":
        stake(opportunities, c);
        break;
      case "tension":
        stake(tensions, c);
        break;
      case "assumption":
        if (c.parentId) push(assumptions, c.parentId, c);
        else orphans.push(c);
        break;
      case null:
        // A plain implication: in the tray, or clustered under a theme.
        if (c.parentId === null) unclustered.push(c);
        else push(clusters, c.parentId, c);
        break;
      default: {
        const exhaustive: never = c.cardKind;
        orphans.push(exhaustive as RippleCard extends never ? never : RippleCard);
      }
    }
  }

  // `sort` first, creation time as the tiebreak. Every card starts at sort 0, so a board
  // nobody has reordered still reads in creation order; dragging assigns real sort values.
  const byOrder = (a: RippleCard, b: RippleCard) =>
    a.sort - b.sort || a.createdTime.localeCompare(b.createdTime);
  for (const arr of [themes, unclustered, parked]) arr.sort(byOrder);
  for (const map of [clusters, risks, opportunities, tensions, chains, assumptions]) {
    for (const arr of map.values()) arr.sort(byOrder);
  }

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

  // Reachability sweep. Being in a bucket is not the same as being reachable: a hope hung
  // off a clustered implication sits in `chains` under a parent no view ever walks to.
  // Anything unreachable moves to `orphans`, so the board can SHOW it rather than losing
  // it. This is what stops `chainDepth` quietly becoming the visibility contract again —
  // assumptions are legitimately absent from it, so "absent ⇒ invisible" no longer holds.
  const liveTheme = new Set(themes.map((t) => t.id));
  const sweep = (map: Map<string, RippleCard[]>, parentIsLive: (parentId: string) => boolean) => {
    for (const [parentId, arr] of map) {
      if (parentIsLive(parentId)) continue;
      orphans.push(...arr);
      map.delete(parentId);
    }
  };
  sweep(chains, (id) => chainDepth.has(id));
  // An assumption hangs off a HOPE OR FEAR, never off a theme — and themes sit in
  // chainDepth at 0, so reachability alone would wave one through.
  const liveChainCard = new Set<string>();
  for (const arr of chains.values()) {
    for (const c of arr) if (chainDepth.has(c.id)) liveChainCard.add(c.id);
  }
  sweep(assumptions, (id) => liveChainCard.has(id));
  for (const map of [risks, opportunities, tensions]) sweep(map, (id) => liveTheme.has(id));
  orphans.sort(byOrder);

  return {
    themes,
    unclustered,
    clusters,
    risks,
    opportunities,
    tensions,
    chains,
    assumptions,
    chainDepth,
    parked,
    orphans,
  };
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

// --- Selectors ---------------------------------------------------------------

// Everything hanging off a card, across every bucket. Callers that ask "does this card
// have children?" kept forgetting a map — the merge guard, the delete-theme count and the
// cluster board's card menu each got it wrong independently. One function, so a bucket
// added later cannot be forgotten by omission.
export function childrenOf(board: SynthesisBoard, cardId: string): RippleCard[] {
  return [
    ...(board.clusters.get(cardId) ?? []),
    ...(board.risks.get(cardId) ?? []),
    ...(board.opportunities.get(cardId) ?? []),
    ...(board.tensions.get(cardId) ?? []),
    ...(board.chains.get(cardId) ?? []),
    ...(board.assumptions.get(cardId) ?? []),
  ];
}

// Every hope and fear under a theme, depth-first so a flipped card follows the one it
// came from. `depth` is its chain depth (1 = written straight onto the theme), and
// `flippedFrom` is the card it answers, which the gallery shows instead of drawing a tree.
export interface ChainEntry {
  card: RippleCard;
  depth: number;
  flippedFrom: RippleCard | null;
}

export function flattenChainCards(board: SynthesisBoard, themeId: string): ChainEntry[] {
  const out: ChainEntry[] = [];
  const walk = (parentId: string, parent: RippleCard | null) => {
    for (const c of board.chains.get(parentId) ?? []) {
      const depth = board.chainDepth.get(c.id);
      // Absent from chainDepth = unreachable from any theme, so drawn by no view.
      if (depth === undefined || !isHopeFear(c.cardKind)) continue;
      out.push({ card: c, depth, flippedFrom: parent });
      walk(c.id, c);
    }
  };
  walk(themeId, null);
  return out;
}

// Everything that would go with a card if it were deleted: its children, their children,
// and so on. parent_card_id is ON DELETE CASCADE, so a confirmation that names only the
// first level understates the damage.
export function descendantsOf(board: SynthesisBoard, cardId: string): RippleCard[] {
  const out: RippleCard[] = [];
  const seen = new Set<string>([cardId]);
  const walk = (id: string) => {
    for (const c of childrenOf(board, id)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
      walk(c.id);
    }
  };
  walk(cardId);
  return out;
}

export interface ThemeStake {
  theme: RippleCard;
  risks: RippleCard[];
  opportunities: RippleCard[];
  tensions: RippleCard[];
}

// Step 2 and step 4 both read the board theme-first. In theme order, so the shortlist
// presents in the order the group arranged its themes.
export function stakeLedger(board: SynthesisBoard): ThemeStake[] {
  return board.themes.map((theme) => ({
    theme,
    risks: board.risks.get(theme.id) ?? [],
    opportunities: board.opportunities.get(theme.id) ?? [],
    tensions: board.tensions.get(theme.id) ?? [],
  }));
}

// How many risks and opportunities are picked for the committee. The target is three of
// each; the UI nudges past it rather than blocking, so this counts rather than caps.
export function shortlistCounts(board: SynthesisBoard): { risks: number; opportunities: number } {
  let risks = 0;
  let opportunities = 0;
  for (const arr of board.risks.values()) for (const c of arr) if (c.shortlisted) risks += 1;
  for (const arr of board.opportunities.values()) {
    for (const c of arr) if (c.shortlisted) opportunities += 1;
  }
  return { risks, opportunities };
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
