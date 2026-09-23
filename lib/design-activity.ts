import "server-only";

import { supabaseAdmin, supabaseConfigured, withRetry } from "@/lib/supabase";
import { listDesignGroups, type DesignGroup } from "@/lib/design-groups";
import { listExercises, type DesignGroupExercise } from "@/lib/design-group-exercises";
import { toProgramDTO, type ProgramDTO } from "@/lib/design-program-shape";
import { tallyCards, type ActivityCardRow, type CardTally } from "@/lib/design-activity-shape";

// How much each design group has added to each week of the program. Built ON TOP of
// toProgramDTO so the week alignment across groups (which is subtle — groups own their own
// exercise rows) is defined in exactly one place: read a cell as
//   program.weeks[i].sessionByGroup[groupId] -> code -> tallyByCode[code]
// The card rows themselves come from two batched queries over every board in the project,
// the same shape as listRippleMaps in lib/ripples.ts — no per-board round trips.

export interface BoardPeople {
  players: number;
  submitted: number;
}

export interface ProgramActivity {
  program: ProgramDTO;
  groups: DesignGroup[];
  exercisesByGroup: Record<string, DesignGroupExercise[]>;
  tallyByCode: Record<string, CardTally>;
  peopleByCode: Record<string, BoardPeople>;
  namesByPlayerId: Record<string, string>;
  // Epoch ms at which the rows were read. The page hands it to the client component for its
  // "4m ago" labels — stamped here, once, so the SSR and hydration passes agree.
  readAt: number;
}

interface CardRow {
  code: string;
  card_order: string;
  section: string | null;
  parent_card_id: string | null;
  created_at: string;
  author_player_id: string | null;
}

interface PlayerRow {
  code: string;
  id: string;
  display_name: string | null;
  submitted_at: string | null;
}

export async function getProgramActivity(projectId: string): Promise<ProgramActivity> {
  const groups = await listDesignGroups(projectId);
  const perGroup = await Promise.all(groups.map((g) => listExercises(g.id)));
  const exercisesByGroup: Record<string, DesignGroupExercise[]> = {};
  groups.forEach((g, i) => {
    exercisesByGroup[g.id] = perGroup[i];
  });

  // The coarse per-code counts toProgramDTO wants for its display-only `cardsByGroup`.
  // Derived from the same rows below, so the DTO and the breakdown can never disagree.
  const codes = [
    ...new Set(
      perGroup
        .flat()
        .map((e) => e.sessionCode?.trim().toUpperCase() ?? "")
        .filter(Boolean)
    ),
  ];

  const { cards, players } = await loadBoardRows(codes);

  const tallies = tallyCards(
    cards.map(
      (c): ActivityCardRow => ({
        code: c.code,
        order: c.card_order,
        parentId: c.parent_card_id,
        section: c.section,
        createdAt: c.created_at,
        authorPlayerId: c.author_player_id,
      })
    )
  );

  const peopleByCode: Record<string, BoardPeople> = {};
  const namesByPlayerId: Record<string, string> = {};
  for (const p of players) {
    const code = p.code.toUpperCase();
    const seen = (peopleByCode[code] ??= { players: 0, submitted: 0 });
    seen.players += 1;
    if (p.submitted_at) seen.submitted += 1;
    if (p.display_name) namesByPlayerId[p.id] = p.display_name;
  }

  const coarse = new Map([...tallies].map(([code, t]) => [code, t.total] as const));
  return {
    program: toProgramDTO(groups, exercisesByGroup, coarse),
    groups,
    exercisesByGroup,
    tallyByCode: Object.fromEntries(tallies),
    peopleByCode,
    namesByPlayerId,
    readAt: Date.now(),
  };
}

// PostgREST caps an unbounded select (db-max-rows, 1000 by default), and it does so
// SILENTLY — a truncated read still looks like a complete one. Every number on the
// activity page comes from these rows, so a project big enough to cross the cap would
// show plausible-but-wrong totals rather than an error. Page explicitly instead.
const PAGE_SIZE = 1000;

// Every row of `table` for these boards, fetched a page at a time. Ordered by id so the
// pages can't overlap or skip rows (an unordered paged read has no stable sequence).
async function selectAllByCode<T>(table: string, columns: string, codes: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await withRetry(async () => {
      const { data, error } = await supabaseAdmin()
        .from(table)
        .select(columns)
        .in("code", codes)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return (data ?? []) as T[];
    });
    out.push(...page);
    if (page.length < PAGE_SIZE) return out;
  }
}

// Two reads for every board in the project, tallied in memory — the shape listRippleMaps
// uses. Select only the columns the tally needs: boards carry a lot of text.
async function loadBoardRows(codes: string[]): Promise<{ cards: CardRow[]; players: PlayerRow[] }> {
  if (codes.length === 0 || !supabaseConfigured()) return { cards: [], players: [] };
  const [cards, players] = await Promise.all([
    selectAllByCode<CardRow>(
      "ripple_cards",
      "code, card_order, section, parent_card_id, created_at, author_player_id",
      codes
    ),
    selectAllByCode<PlayerRow>("ripple_players", "code, id, display_name, submitted_at", codes),
  ]);
  return { cards, players };
}
