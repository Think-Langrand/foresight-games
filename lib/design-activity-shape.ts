// Client-safe SHAPE of design-group activity: how much each group has added to each
// week's board, split by what kind of thing it is. No server imports, so it's safe in
// client components and tests alike. The server-only loader lives in lib/design-activity.ts.
//
// Every row on a board is a ripple_card; the buckets below are that one table's uses, and
// they're what the boards themselves render by:
//   themes       — a Week 3 theme       (card_kind "theme")
//   synthesis    — what Week 3 writes ON a theme or the board: an answer, a risk, an
//                  opportunity, a hope, a fear … (any other card_kind)
//   keyChanges   — tree roots           (isTreeRoot, lib/ripples-types.ts)
//   implications — anything with a parent and no kind (a Week 2 chain, or a Week 2
//                  implication clustered under a Week 3 theme)
//   brainstorm   — the freeform pad     (STICKY, no section)
//   answers      — worksheet Q&A        (STICKY + section key)
// Counting them apart matters: a week of worksheet answers and a week of deep implication
// chains are very different work, and a single all-rows total can't tell them apart. The
// kind is read first because a Week 3 theme is also a tree root and a Week 3 risk also
// has a parent: without it a synthesis week reported "4 key changes, 31 implications".

export type CardKind = "themes" | "synthesis" | "keyChanges" | "implications" | "brainstorm" | "answers";

// The buckets are mutually exclusive and exhaustive — every card lands in exactly one.
// Mirrors isTreeRoot + the STICKY/section filters in RipplesTeamView and
// lib/group-answers-shape.ts; keep them in step.
export function classifyCard(card: {
  order: string;
  parentId: string | null;
  section: string | null;
  cardKind?: string | null;
}): CardKind {
  if (card.cardKind === "theme") return "themes";
  if (card.cardKind) return "synthesis";
  if (card.parentId !== null) return "implications";
  if (card.order !== "STICKY") return "keyChanges";
  return card.section ? "answers" : "brainstorm";
}

// One board's row, pared down to what a tally needs.
export interface ActivityCardRow {
  code: string;
  order: string;
  parentId: string | null;
  section: string | null;
  cardKind?: string | null; // Week 3 kinds; null/absent for every Week 1–2 card
  createdAt: string;
  authorPlayerId: string | null;
}

export interface CardTally {
  themes: number;
  synthesis: number;
  keyChanges: number;
  implications: number;
  brainstorm: number;
  answers: number;
  total: number;
  lastAt: string | null; // most recent createdAt on the board — "when did this last move"
  byAuthor: Record<string, number>; // ripple_players.id -> cards added
}

export function emptyTally(): CardTally {
  return {
    themes: 0,
    synthesis: 0,
    keyChanges: 0,
    implications: 0,
    brainstorm: 0,
    answers: 0,
    total: 0,
    lastAt: null,
    byAuthor: {},
  };
}

// Tally rows by session code. Codes are uppercased so lookups match the rest of the app
// (every ripple_* read upper-cases the code before querying).
export function tallyCards(rows: ActivityCardRow[]): Map<string, CardTally> {
  const out = new Map<string, CardTally>();
  for (const row of rows) {
    const code = row.code.toUpperCase();
    let t = out.get(code);
    if (!t) {
      t = emptyTally();
      out.set(code, t);
    }
    t[classifyCard(row)] += 1;
    t.total += 1;
    if (row.createdAt && (t.lastAt === null || row.createdAt > t.lastAt)) t.lastAt = row.createdAt;
    if (row.authorPlayerId) t.byAuthor[row.authorPlayerId] = (t.byAuthor[row.authorPlayerId] ?? 0) + 1;
  }
  return out;
}

// Fold several tallies into one — a week's column total, or a group's row total.
export function sumTallies(tallies: CardTally[]): CardTally {
  const out = emptyTally();
  for (const t of tallies) {
    out.themes += t.themes;
    out.synthesis += t.synthesis;
    out.keyChanges += t.keyChanges;
    out.implications += t.implications;
    out.brainstorm += t.brainstorm;
    out.answers += t.answers;
    out.total += t.total;
    if (t.lastAt !== null && (out.lastAt === null || t.lastAt > out.lastAt)) out.lastAt = t.lastAt;
    for (const [player, n] of Object.entries(t.byAuthor)) {
      out.byAuthor[player] = (out.byAuthor[player] ?? 0) + n;
    }
  }
  return out;
}
