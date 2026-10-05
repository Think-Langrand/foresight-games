// Client-safe shaping for the Week 3 SYNTHESIS board. No server imports — safe in client
// components, route handlers, and tests.
//
// One shared board holds several different things in ONE parent tree, told apart only by
// card_kind (migration 0020):
//
//   theme (a FIRST root) ─ implication children (kind null, clustered from Week 2)
//                        ├ the four "how does this future work?" answers (READING_FIELDS)
//                        └ risk / opportunity cards (step 2's two walls)
//   hope / fear (a FIRST root) ─ its flip side as a child (step 4), alternating, deep
//
// Hopes and fears are the board's, not a theme's (step 3). Older boards wrote them under a
// theme; that shape still indexes, which is why chainDepth is seeded from BOTH the themes
// and the root hopes/fears. Because a theme's implication children and its hope/fear
// children sit at the SAME tree depth, the chain walk cannot use depthByCard — it would
// interleave the two. It walks the KIND-FILTERED subgraph below instead (chainDepth).

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

// The four questions a theme is asked, in the order the 2×2 shows them. Each answer is a
// card of that kind hung straight off the theme.
//
// Earlier the questions were asked of a `reading` — a concrete example card under the theme
// — with two different questions (`assumed_role`, `question`). Those cards stay readable:
// a field kind is accepted under a theme OR a reading, the legacy kinds still index into
// the same bucket, and themeAnswers() falls back to a reading's answer where the theme has
// none of its own.
export const READING_FIELDS = ["benefit", "cost", "experience", "mechanism"] as const;
export type ReadingField = (typeof READING_FIELDS)[number];
const READING_FIELD_SET = new Set<string>(READING_FIELDS);
const LEGACY_FIELDS = ["assumed_role", "question"] as const;
const FIELD_LIKE_SET = new Set<string>([...READING_FIELDS, ...LEGACY_FIELDS]);

export function isReadingField(kind: CardKind | null): kind is ReadingField {
  return kind !== null && READING_FIELD_SET.has(kind);
}

// LEGACY — the retired "what could work differently" step: four answers on the theme. No
// step asks them any more; boards that wrote them still read in the panel and the CSV.
export const VALUES_FIELDS = ["condition", "assumption", "alternative", "test"] as const;
export type ValuesField = (typeof VALUES_FIELDS)[number];

// LEGACY — the retired "public health's role" step: four answers for the WHOLE BOARD as
// root cards. `opportunity` and `risk` double as step 2's per-theme walls: root = an old
// board's role answer, under a theme = a wall card.
export const ROLE_FIELDS = ["desired_role", "opportunity", "risk", "investigate"] as const;
export type RoleField = (typeof ROLE_FIELDS)[number];

// Every kind that is "an answer to a question about the theme", with the one-line label the
// viewer and the CSV print for it. One map, so the three never disagree.
export type ThemeAnswerKind = ReadingField | ValuesField | RoleField | "assumed_role" | "question";
export const ANSWER_LABELS: Record<ThemeAnswerKind, string> = {
  benefit: "Who benefits, and how?",
  cost: "Who bears a cost or loses access?",
  experience: "Who might experience this differently?",
  mechanism: "What would make that happen?",
  condition: "Which scenario conditions do we need to keep?",
  assumption: "The arrangement we're assuming",
  alternative: "Another way it could work",
  test: "What changes — and what needs testing?",
  desired_role: "A desirable role for public health",
  opportunity: "What could this role make possible?",
  risk: "What could it put at risk or miss?",
  investigate: "What should DG4 investigate?",
  assumed_role: "Where do we imagine public health?",
  question: "What do we still need to understand?",
};

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
      // The role step's answers are board-level (root); older boards wrote them per theme.
      return root || parentKind === "theme" ? null : "That belongs on the board or a theme.";

    case "tension":
      return parentKind === "theme" ? null : "That belongs on a theme.";

    case "assumption":
      // On the theme (step 2B's "arrangement we're assuming"), or under a hope or fear on
      // boards worked before assumptions moved there.
      return parentKind === "theme" || isHopeFear(parentKind ?? null)
        ? null
        : "An assumption belongs on a theme, a hope or a fear.";

    case "concerns":
      return isHopeFear(parentKind ?? null)
        ? null
        : "Who it concerns is written on a hope or a fear.";

    case "condition":
    case "alternative":
    case "test":
      return parentKind === "theme" ? null : "That belongs on a theme.";

    case "desired_role":
    case "investigate":
      // The role is one answer for the whole board, so a root card. A theme parent is
      // tolerated for the brief period they were written per theme.
      return root || parentKind === "theme" ? null : "That belongs on the board.";

    case "reading":
      return parentKind === "theme" ? null : "A reading belongs on a theme.";

    case "benefit":
    case "cost":
    case "experience":
    case "mechanism":
    case "assumed_role":
    case "question":
      // An answer to one of the theme's questions. On the theme now; under a reading on
      // boards worked before the example was dropped.
      return parentKind === "theme" || parentKind === "reading"
        ? null
        : "That belongs on a theme.";

    case "hope":
    case "fear":
      // The board's own (step 3), or an older board's under a theme.
      if (root || parentKind === "theme") return null;
      if (!isHopeFear(parentKind ?? null)) return "Hopes and fears belong on the board.";
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
  hopesFears: RippleCard[]; // kind 'hope'/'fear', tree roots — step 3's two walls
  unclustered: RippleCard[]; // kind null, tree roots, not parked — the tray
  clusters: Map<string, RippleCard[]>; // themeId → its implication children
  risks: Map<string, RippleCard[]>; // themeId → its risk cards
  opportunities: Map<string, RippleCard[]>; // themeId → its opportunity cards
  tensions: Map<string, RippleCard[]>; // themeId → its surprises & disagreements
  readings: Map<string, RippleCard[]>; // themeId → its readings (step 2)
  readingFields: Map<string, RippleCard[]>; // themeId or readingId → its answer cards
  chains: Map<string, RippleCard[]>; // parentId → its hope/fear children
  concerns: Map<string, RippleCard[]>; // hope/fear id → its "who does this concern" note
  assumptions: Map<string, RippleCard[]>; // theme id or hope/fear id → the assumptions under it
  answers: Map<string, RippleCard[]>; // themeId → theme-level answers (condition, alternative, test; legacy desired_role, investigate)
  boardAnswers: RippleCard[]; // the role step's answers — root cards, one set for the board
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
  const hopesFears: RippleCard[] = [];
  const unclustered: RippleCard[] = [];
  const parked: RippleCard[] = [];
  const orphans: RippleCard[] = [];
  const clusters = new Map<string, RippleCard[]>();
  const risks = new Map<string, RippleCard[]>();
  const opportunities = new Map<string, RippleCard[]>();
  const tensions = new Map<string, RippleCard[]>();
  const readings = new Map<string, RippleCard[]>();
  const readingFields = new Map<string, RippleCard[]>();
  const chains = new Map<string, RippleCard[]>();
  const concerns = new Map<string, RippleCard[]>();
  const assumptions = new Map<string, RippleCard[]>();
  const answers = new Map<string, RippleCard[]>();
  const boardAnswers: RippleCard[] = [];

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
        // A root is the board's own (step 3); under something, it chains off a theme
        // (older boards) or off its flip side.
        if (c.parentId) push(chains, c.parentId, c);
        else hopesFears.push(c);
        break;
      case "risk":
        // Root = the role step's answer for the board; under a theme = an older board's.
        if (c.parentId === null) boardAnswers.push(c);
        else push(risks, c.parentId, c);
        break;
      case "opportunity":
        if (c.parentId === null) boardAnswers.push(c);
        else push(opportunities, c.parentId, c);
        break;
      case "tension":
        stake(tensions, c);
        break;
      case "assumption":
        if (c.parentId) push(assumptions, c.parentId, c);
        else orphans.push(c);
        break;
      case "concerns":
        if (c.parentId) push(concerns, c.parentId, c);
        else orphans.push(c);
        break;
      case "condition":
      case "alternative":
      case "test":
        stake(answers, c);
        break;
      case "desired_role":
      case "investigate":
        if (c.parentId === null) boardAnswers.push(c);
        else push(answers, c.parentId, c);
        break;
      case "reading":
        // A reading reads one theme; parentless it reads nothing.
        stake(readings, c);
        break;
      case "benefit":
      case "cost":
      case "experience":
      case "mechanism":
      case "assumed_role":
      case "question":
        // Keyed by parent: a theme's own answers, or a legacy reading's.
        if (c.parentId) push(readingFields, c.parentId, c);
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
  for (const arr of [themes, hopesFears, unclustered, parked, boardAnswers]) arr.sort(byOrder);
  for (const map of [
    clusters,
    risks,
    opportunities,
    tensions,
    readings,
    readingFields,
    chains,
    concerns,
    assumptions,
    answers,
  ]) {
    for (const arr of map.values()) arr.sort(byOrder);
  }

  // Breadth-first, following ONLY hope/fear children. Cycle-guarded and capped at
  // MAX_TREE_DEPTH, so a malformed board truncates instead of spinning. Seeded twice:
  // from the themes at 0 (an older board's chains hang off them), then from the board's
  // own hopes and fears at 1 — "1 = written straight on", whichever shape the board is.
  const chainDepth = new Map<string, number>();
  const seedDepths = (seeds: RippleCard[], startDepth: number) => {
    let level = seeds;
    for (let depth = startDepth; depth <= MAX_TREE_DEPTH && level.length > 0; depth++) {
      const next: RippleCard[] = [];
      for (const c of level) {
        if (chainDepth.has(c.id)) continue;
        chainDepth.set(c.id, depth);
        next.push(...(chains.get(c.id) ?? []));
      }
      level = next;
    }
  };
  seedDepths(themes, 0);
  seedDepths(hopesFears, 1);

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
  // A "who does this concern" note hangs off a live hope or fear; an assumption off a live
  // theme (step 2B) or a live hope or fear (the older shape). Themes sit in chainDepth at 0,
  // so for the notes reachability alone would wave a theme parent through — hence the set.
  const liveChainCard = new Set<string>();
  for (const c of hopesFears) liveChainCard.add(c.id);
  for (const arr of chains.values()) {
    for (const c of arr) if (chainDepth.has(c.id)) liveChainCard.add(c.id);
  }
  sweep(concerns, (id) => liveChainCard.has(id));
  sweep(assumptions, (id) => liveTheme.has(id) || liveChainCard.has(id));
  for (const map of [risks, opportunities, tensions, readings, answers]) {
    sweep(map, (id) => liveTheme.has(id));
  }
  // An answer hangs off a live theme, or off a live reading (the older shape). Readings have
  // just been swept, so this runs after them — an answer under a reading that was itself
  // orphaned is orphaned.
  const liveReading = new Set<string>();
  for (const arr of readings.values()) for (const c of arr) liveReading.add(c.id);
  sweep(readingFields, (id) => liveTheme.has(id) || liveReading.has(id));
  orphans.sort(byOrder);

  return {
    themes,
    hopesFears,
    unclustered,
    clusters,
    risks,
    opportunities,
    tensions,
    readings,
    readingFields,
    chains,
    concerns,
    assumptions,
    answers,
    boardAnswers,
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
    // A theme's readings, and a reading's four answers. Left out when readings were added,
    // which made the delete-theme count blind to exactly the work step 1 now produces.
    ...(board.readings.get(cardId) ?? []),
    ...(board.readingFields.get(cardId) ?? []),
    ...(board.concerns.get(cardId) ?? []),
    ...(board.answers.get(cardId) ?? []),
  ];
}

// --- One answer per question ---------------------------------------------------------

// The card answering `kind` under `parentId`, whichever bucket holds it — a theme's
// condition in `answers`, its risk in `risks`, a hope's "who does this concern" in
// `concerns`. First card of the kind wins, as everywhere else: a second card of one kind is
// a duplicate the UI never creates, and keeping the earlier one means a stray never
// displaces what the group actually wrote.
export function answerOf(board: SynthesisBoard, parentId: string, kind: CardKind): RippleCard | null {
  return childrenOf(board, parentId).find((c) => c.cardKind === kind) ?? null;
}

export function answersOf<K extends CardKind>(
  board: SynthesisBoard,
  parentId: string,
  kinds: readonly K[]
): Partial<Record<K, RippleCard>> {
  const out: Partial<Record<K, RippleCard>> = {};
  for (const c of childrenOf(board, parentId)) {
    const k = c.cardKind as K | null;
    if (k !== null && kinds.includes(k) && !out[k]) out[k] = c;
  }
  return out;
}

// LEGACY — an older board's role answers, keyed by question: root cards, first of a kind
// wins. Nothing writes these any more; the panel and the CSV still read them.
export function boardAnswersOf(board: SynthesisBoard): Partial<Record<RoleField, RippleCard>> {
  const out: Partial<Record<RoleField, RippleCard>> = {};
  for (const c of board.boardAnswers) {
    const k = c.cardKind as RoleField | null;
    if (k !== null && (ROLE_FIELDS as readonly string[]).includes(k) && !out[k]) out[k] = c;
  }
  return out;
}

// Step 1 is done once the theme actually holds something. A theme is a grouping; an
// empty one has not grouped anything yet.
export function clusterProgress(board: SynthesisBoard, themeId: string): ThemeProgress {
  return (board.clusters.get(themeId)?.length ?? 0) > 0 ? "done" : "empty";
}

// Step 2 is done when the four questions are answered AND the theme has at least one risk
// and one opportunity; started once either half has anything on it.
export function exploreProgress(board: SynthesisBoard, themeId: string): ThemeProgress {
  const reading = readingProgress(board, themeId);
  const stakes = stakeProgress(board, themeId);
  if (reading === "done" && stakes === "done") return "done";
  return reading !== "empty" || stakes !== "empty" ? "started" : "empty";
}

// Step 4: how many of the board's fears have a hope written on their other side. A fear
// is flipped once a hope hangs off it; the UI nudges towards all of them without blocking.
export function flipProgress(board: SynthesisBoard): { flipped: number; total: number } {
  const fears = board.hopesFears.filter((c) => c.cardKind === "fear");
  const flipped = fears.filter((f) => (board.chains.get(f.id) ?? []).some((c) => c.cardKind === "hope"));
  return { flipped: flipped.length, total: fears.length };
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
  walkChain(board, themeId, null, out);
  return out;
}

function walkChain(board: SynthesisBoard, parentId: string, parent: RippleCard | null, out: ChainEntry[]) {
  for (const c of board.chains.get(parentId) ?? []) {
    const depth = board.chainDepth.get(c.id);
    // Absent from chainDepth = unreachable from any root, so drawn by no view.
    if (depth === undefined || !isHopeFear(c.cardKind)) continue;
    out.push({ card: c, depth, flippedFrom: parent });
    walkChain(board, c.id, c, out);
  }
}

// The board's own hopes and fears (step 3) with whatever was flipped from each (step 4),
// depth-first so a flipped card follows the one it came from. Depth 1 is a card written
// on the board; 2 is its other side.
export function boardChainCards(board: SynthesisBoard): ChainEntry[] {
  const out: ChainEntry[] = [];
  for (const root of board.hopesFears) {
    const depth = board.chainDepth.get(root.id);
    if (depth === undefined) continue;
    out.push({ card: root, depth, flippedFrom: null });
    walkChain(board, root.id, root, out);
  }
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

// The other side of a pair, looked up in BOTH directions.
//
// A flip stores the new card as a CHILD of the one it answers, which gives the pair a
// direction it does not actually have: the step's claim is that a hope and its fear are
// one piece of thinking, not a parent and a dependent. A child-only lookup finds the fear
// from the hope and nothing from the fear — so a flipped fear sat beside an empty card
// back offering to write the very hope it had come from.
//
// A child of the flip kind still wins over the parent, so an existing chain is walked one
// pair at a time exactly as before; the parent is only consulted when there is no child to
// show. That makes this strictly additive: nothing that resolved before resolves
// differently now.
export function oppositeOf(board: SynthesisBoard, card: RippleCard): RippleCard | null {
  if (!isHopeFear(card.cardKind)) return null;
  const other = flipOf(card.cardKind);

  const child = (board.chains.get(card.id) ?? []).find((c) => c.cardKind === other);
  if (child) return child;

  // Upwards. The parent is one of the board's own hopes/fears (step 4 flips a root fear),
  // or — on an older board — somebody else's child in `chains`. Cheap at these sizes, and
  // it avoids a second index whose only job would be this one lookup.
  if (!card.parentId) return null;
  const root = board.hopesFears.find((c) => c.id === card.parentId);
  if (root) return root.cardKind === other ? root : null;
  for (const siblings of board.chains.values()) {
    for (const c of siblings) {
      // A theme parent is not an opposite, and neither is a hope above a hope.
      if (c.id === card.parentId) return c.cardKind === other ? c : null;
    }
  }
  return null;
}

// What a theme has behind it, for the one line that stands in for the whole dossier when
// it is tucked into a drawer. Naming the counts is what stops the material going silently
// out of mind: you can see there are three risks without having to open anything.
export interface DossierCounts {
  implications: number;
  readings: number;
  risks: number;
  opportunities: number;
  tensions: number;
}

export function themeDossierCounts(board: SynthesisBoard, themeId: string): DossierCounts {
  return {
    implications: board.clusters.get(themeId)?.length ?? 0,
    readings: board.readings.get(themeId)?.length ?? 0,
    risks: board.risks.get(themeId)?.length ?? 0,
    opportunities: board.opportunities.get(themeId)?.length ?? 0,
    tensions: board.tensions.get(themeId)?.length ?? 0,
  };
}

// How far a theme has got in a step. The picker is really a checklist — a group works
// through every theme and needs to see which ones are still owed something — so "done"
// has to mean something specific per step rather than just "has cards".
export type ThemeProgress = "empty" | "started" | "done";

// Step 2 is done when the theme has both sides of the analysis. Tensions are optional —
// a theme the group simply agreed on is finished, not deficient.
export function stakeProgress(board: SynthesisBoard, themeId: string): ThemeProgress {
  const risks = board.risks.get(themeId)?.length ?? 0;
  const opportunities = board.opportunities.get(themeId)?.length ?? 0;
  const tensions = board.tensions.get(themeId)?.length ?? 0;
  if (risks > 0 && opportunities > 0) return "done";
  if (risks + opportunities + tensions > 0) return "started";
  return "empty";
}

// One reading of a theme: the concrete example (the reading card's own text) and whichever
// of the four questions have been answered, keyed by kind so no caller has to go hunting
// through the children for the one it wants.
export interface ThemeReading {
  card: RippleCard; // its `text` is the concrete example
  fields: Partial<Record<ReadingField, RippleCard>>;
}

export function readingsFor(board: SynthesisBoard, themeId: string): ThemeReading[] {
  return (board.readings.get(themeId) ?? []).map((card) => {
    const fields: Partial<Record<ReadingField, RippleCard>> = {};
    for (const f of board.readingFields.get(card.id) ?? []) {
      // First wins. A second card of one kind is a duplicate the UI never creates; keeping
      // the earlier one means a stray never displaces what the group actually wrote.
      if (isReadingField(f.cardKind) && !fields[f.cardKind]) fields[f.cardKind] = f;
    }
    return { card, fields };
  });
}

// The theme's answers, keyed by question. Its own answers first; where it has none for a
// question, the first legacy reading's answer of that kind stands in, so a board worked
// before the example was dropped still shows what it wrote. First card of a kind wins, as
// in readingsFor.
export function themeAnswers(
  board: SynthesisBoard,
  themeId: string
): Partial<Record<ReadingField, RippleCard>> {
  const out: Partial<Record<ReadingField, RippleCard>> = {};
  for (const f of board.readingFields.get(themeId) ?? []) {
    if (isReadingField(f.cardKind) && !out[f.cardKind]) out[f.cardKind] = f;
  }
  for (const r of readingsFor(board, themeId)) {
    for (const k of READING_FIELDS) if (!out[k] && r.fields[k]) out[k] = r.fields[k];
  }
  return out;
}

// Done when all four questions have a non-blank answer; started once anything has been
// written on the theme's questions (including a legacy reading); empty otherwise. Three of
// four is not finished — the step exists to make a group work a theme all the way through.
export function readingProgress(board: SynthesisBoard, themeId: string): ThemeProgress {
  const answers = themeAnswers(board, themeId);
  const answered = READING_FIELDS.filter((f) => (answers[f]?.text ?? "").trim().length > 0);
  if (answered.length === READING_FIELDS.length) return "done";
  if (answered.length > 0) return "started";
  const legacy = (board.readings.get(themeId) ?? []).length > 0;
  const stray = (board.readingFields.get(themeId) ?? []).some((c) => FIELD_LIKE_SET.has(c.cardKind ?? ""));
  return legacy || stray ? "started" : "empty";
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

// An assumption, with what it was written under. On its own "that goodwill is not infinite"
// says little; the hope it hangs off and the theme that hope belongs to are what make it
// readable in a list that has left its card behind.
export interface AssumptionEntry {
  card: RippleCard;
  source: RippleCard; // the hope or fear it was written on
  theme: RippleCard;
}

// Every assumption on the board, theme by theme. Step 4 asks which of them were challenged
// in a way that surprised the group, and that question only makes sense across the whole
// board — an assumption is interesting precisely when it turns up under more than one theme.
export function assumptionLedger(board: SynthesisBoard): AssumptionEntry[] {
  const out: AssumptionEntry[] = [];
  for (const theme of board.themes) {
    for (const { card: source } of flattenChainCards(board, theme.id)) {
      for (const card of board.assumptions.get(source.id) ?? []) {
        out.push({ card, source, theme });
      }
    }
  }
  return out;
}

// How many cards are picked for the committee. The target is three of each; the UI nudges
// past it rather than blocking, so this counts rather than caps.
export function shortlistCounts(board: SynthesisBoard): {
  risks: number;
  opportunities: number;
  assumptions: number;
} {
  let risks = 0;
  let opportunities = 0;
  for (const arr of board.risks.values()) for (const c of arr) if (c.shortlisted) risks += 1;
  for (const arr of board.opportunities.values()) {
    for (const c of arr) if (c.shortlisted) opportunities += 1;
  }
  // Counted through the ledger rather than the raw map, so an assumption hanging off a
  // card no view can reach is not counted towards a total nobody can see the parts of.
  const assumptions = assumptionLedger(board).filter((e) => e.card.shortlisted).length;
  return { risks, opportunities, assumptions };
}

// --- One implication in several themes (0023) --------------------------------
//
// Clustering is not a partition: an implication can genuinely belong to more than one
// theme, and a group forced to pick one loses that reading. A copy is an ordinary card
// parented to its theme; copies of one implication share a `twinKey`.
//
// `twinKey ?? id` means a card that has never been copied is simply its own group of one,
// so nothing had to be backfilled and every call site can treat identity uniformly.
export function implicationKey(card: RippleCard): string {
  return card.twinKey ?? card.id;
}

export interface TwinInfo {
  key: string;
  cards: RippleCard[]; // every copy, tray and themed
  themeIds: string[]; // the themes it sits in, in board order; empty while it is in the tray
  // Only the seeded original carries the Week 2 link — a copy is written with a null
  // sourceCardId so it stays out of 0018's unique constraint. The lineage disclosure
  // follows the twin to whichever copy does hold it, so every copy can still say where it
  // came from.
  sourceCardId: string | null;
}

// Every implication on the board, by identity. One pass; callers index into it per card
// while rendering rather than re-scanning.
export function twinIndex(board: SynthesisBoard): Map<string, TwinInfo> {
  const out = new Map<string, TwinInfo>();
  const add = (card: RippleCard, themeId: string | null) => {
    const key = implicationKey(card);
    const found = out.get(key);
    const info = found ?? { key, cards: [], themeIds: [], sourceCardId: null };
    if (!found) out.set(key, info);
    info.cards.push(card);
    if (themeId && !info.themeIds.includes(themeId)) info.themeIds.push(themeId);
    if (!info.sourceCardId && card.sourceCardId) info.sourceCardId = card.sourceCardId;
  };

  for (const c of board.unclustered) add(c, null);
  // Theme order, so "in 3 themes" lists them the way the board reads.
  for (const theme of board.themes) {
    for (const c of board.clusters.get(theme.id) ?? []) add(c, theme.id);
  }
  return out;
}

// How many themes hold a copy of this card's implication. 1 is the ordinary case; 0 means
// it is still in the tray. The UI marks anything above 1 — the group should be able to see
// where it has doubled up without reading every column.
export function themeCountFor(index: Map<string, TwinInfo>, card: RippleCard): number {
  return index.get(implicationKey(card))?.themeIds.length ?? 0;
}

// Which Week 3 card came from which Week 2 one, and where it currently sits.
//
// The map draws WEEK 2 cards; themes hold WEEK 3 cards. A node is therefore a reference to
// a card, not a card — every interaction on the map has to come back through here to find
// the row it is actually allowed to move. A Week 2 id that is absent was never seeded, and
// nothing on the map can be done with it.
//
// Twin copies carry a null sourceCardId on purpose (migration 0023), so each Week 2 card
// maps to exactly one Week 3 ORIGINAL. Compose with twinIndex where a node needs to say it
// is in more than one theme.
export interface SeededCard {
  card: RippleCard;
  themeId: string | null; // null = still in the tray, or parked
  parked: boolean;
}

export function seededIndex(board: SynthesisBoard): Map<string, SeededCard> {
  const out = new Map<string, SeededCard>();
  const add = (card: RippleCard, themeId: string | null, parked: boolean) => {
    if (card.sourceCardId) out.set(card.sourceCardId, { card, themeId, parked });
  };
  for (const c of board.unclustered) add(c, null, false);
  for (const theme of board.themes) {
    for (const c of board.clusters.get(theme.id) ?? []) add(c, theme.id, false);
  }
  for (const c of board.parked) add(c, null, true);
  return out;
}

// --- Week 2 lineage ----------------------------------------------------------
// What the hopes & fears drill-in shows beside each clustered implication: the chain it
// was part of back in Week 2, and the key change at the head of it.

export interface Week2Lineage {
  keyChange: string; // the root card's text
  keyChangeId: string; // …and its id, so a caller can find the card and draw its branch
  chain: string[]; // root text first, this card's own text last
}

// How many steps out from the key change this implication sits: 1 = a direct consequence,
// 3 = a consequence of a consequence of a consequence.
//
// The chain INCLUDES the key change at [0] and the card itself at the end, so the order is
// its length minus one. A card the group typed by hand here has no Week 2 ancestry and no
// order — null rather than 0, because "not from the map" is not the same as "zero steps".
//
// This matters more than it looks on a real board: Group 1's production map is 23 first
// order, 53 second, 68 third, 2 fourth. A group clustering that blind weighs a speculative
// third-order knock-on exactly like a direct consequence, and the themes inherit it.
// One implication's branch of the Week 2 map: the key change it hangs under, every card
// on that branch, and the path of ids from the root down to this card. The drill-in draws
// the branch and picks the path out of it — a list of ancestor text named the steps but
// never showed the shape they sit in.
export interface Week2Branch {
  root: RippleCard;
  subtree: RippleCard[]; // the root and everything under it
  pathIds: Set<string>; // root → … → the card asked about
}

export function branchOf(cards: RippleCard[], cardId: string): Week2Branch | null {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const start = byId.get(cardId);
  if (!start) return null;

  // Up to the root, cycle-guarded — a malformed map must not hang the UI.
  const pathIds = new Set<string>([start.id]);
  let root = start;
  while (root.parentId) {
    const next = byId.get(root.parentId);
    if (!next || pathIds.has(next.id)) break;
    pathIds.add(next.id);
    root = next;
  }

  const kids = new Map<string, RippleCard[]>();
  for (const c of cards) {
    if (!c.parentId) continue;
    const arr = kids.get(c.parentId);
    if (arr) arr.push(c);
    else kids.set(c.parentId, [c]);
  }
  const subtree: RippleCard[] = [];
  const seen = new Set<string>();
  const walk = (c: RippleCard) => {
    if (seen.has(c.id)) return;
    seen.add(c.id);
    subtree.push(c);
    for (const k of kids.get(c.id) ?? []) walk(k);
  };
  walk(root);
  return { root, subtree, pathIds };
}

export function implicationOrder(lineage: Week2Lineage | undefined): number | null {
  if (!lineage || lineage.chain.length < 2) return null;
  return lineage.chain.length - 1;
}

// A key change is a whole sentence — "DECENTRALIZATION: Public health is hyperlocal,
// posing limits to coordination and state and national strategizing." — and a filter chip
// has room for a few words. Week 2's key changes are conventionally written with a
// SHOUTED topic before a colon, so that prefix is the label the group already uses for it.
// Where there is no colon, or the prefix is itself a sentence, fall back to a truncation
// rather than inventing a name the group would not recognise.
export function keyChangeLabel(text: string, max = 28): string {
  const t = (text ?? "").trim();
  const colon = t.indexOf(":");
  if (colon > 0 && colon <= max) return t.slice(0, colon).trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
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

  const walk = (card: RippleCard, trail: string[], rootId: string) => {
    const chain = [...trail, card.text];
    out[card.id] = { keyChange: chain[0], keyChangeId: rootId, chain };
    for (const kid of children.get(card.id) ?? []) {
      if (depths.has(kid.id) && !out[kid.id]) walk(kid, chain, rootId);
    }
  };

  for (const root of week2Cards.filter(isTreeRoot)) {
    if (depths.has(root.id)) walk(root, [], root.id);
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
