import "server-only";

import { supabaseAdmin, supabaseConfigured, withRetry } from "@/lib/supabase";
import { getForesightDrivers, getScenario, foresightConfigured } from "@/lib/foresight/client";
import type { PublicDriverCard, Scenario } from "@/lib/foresight/types";
import { TEAM_COLORS, type WorkshopSession } from "@/lib/workshop-types";
import {
  resolveConfig,
  type CardOrder,
  type RippleArtImage,
  type RippleCard,
  type RippleChip,
  type RipplePlayer,
  type RippleTeam,
  type RipplesView,
} from "@/lib/ripples-types";

// Server-only data layer for the RIPPLES game. Mirrors lib/teams.ts: snake_case
// row interfaces + mapRow, all reads/writes on supabaseAdmin() (service_role,
// bypasses RLS) wrapped in withRetry. Gameplay validation lives in the route
// handlers; these functions are the thin persistence layer.

// ---------- row shapes ----------
interface TeamRow {
  id: string;
  code: string;
  name: string;
  color: string;
  join_order: number;
  created_at: string;
}
interface PlayerRow {
  id: string;
  team_id: string;
  display_name: string;
  lens_id: string | null;
  answers: Record<string, string> | null;
  submitted_at: string | null;
  created_at: string;
}
interface CardRow {
  id: string;
  team_id: string;
  author_player_id: string | null;
  card_order: string;
  parent_card_id: string | null;
  text: string;
  lens_id: string | null;
  flagged: boolean;
  greyed: boolean;
  sort: number | null;
  created_at: string;
}
interface ChipRow {
  id: string;
  team_id: string;
  player_id: string;
  card_id: string;
  created_at: string;
}

function mapTeam(r: TeamRow): RippleTeam {
  return {
    id: r.id,
    code: r.code,
    name: r.name ?? "",
    color: r.color || TEAM_COLORS[0].hex,
    joinOrder: r.join_order ?? 0,
    createdTime: r.created_at,
  };
}
function mapPlayer(r: PlayerRow): RipplePlayer {
  return {
    id: r.id,
    teamId: r.team_id,
    displayName: r.display_name ?? "",
    lensId: r.lens_id ?? null,
    answers: r.answers ?? {},
    submittedAt: r.submitted_at ?? null,
    createdTime: r.created_at,
  };
}
function mapCard(r: CardRow): RippleCard {
  return {
    id: r.id,
    teamId: r.team_id,
    authorPlayerId: r.author_player_id ?? null,
    order: (r.card_order ?? "FIRST") as CardOrder,
    parentId: r.parent_card_id ?? null,
    text: r.text ?? "",
    lensId: r.lens_id ?? null,
    flagged: r.flagged ?? false,
    greyed: r.greyed ?? false,
    sort: r.sort ?? 0,
    createdTime: r.created_at,
  };
}
function mapChip(r: ChipRow): RippleChip {
  return {
    id: r.id,
    teamId: r.team_id,
    playerId: r.player_id,
    cardId: r.card_id,
    createdTime: r.created_at,
  };
}

const up = (code: string) => code.trim().toUpperCase();

// ---------- reads ----------
export async function getRippleTeams(code: string): Promise<RippleTeam[]> {
  if (!supabaseConfigured()) return [];
  const data = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("ripple_teams")
      .select("*")
      .eq("code", up(code))
      .order("join_order", { ascending: true });
    if (error) throw error;
    return data as TeamRow[];
  });
  return data.map(mapTeam);
}

// The full live board for a session: teams, players, cards, chips + resolved config.
export async function getRipplesView(session: WorkshopSession): Promise<RipplesView> {
  const code = up(session.code);
  const { teams, players, cards, chips } = await withRetry(async () => {
    const db = supabaseAdmin();
    const [teamRes, playerRes, cardRes, chipRes] = await Promise.all([
      db.from("ripple_teams").select("*").eq("code", code).order("join_order", { ascending: true }),
      db.from("ripple_players").select("*").eq("code", code).order("created_at", { ascending: true }),
      db.from("ripple_cards").select("*").eq("code", code).order("created_at", { ascending: true }),
      db.from("ripple_chips").select("*").eq("code", code),
    ]);
    for (const r of [teamRes, playerRes, cardRes, chipRes]) if (r.error) throw r.error;
    return {
      teams: (teamRes.data ?? []) as TeamRow[],
      players: (playerRes.data ?? []) as PlayerRow[],
      cards: (cardRes.data ?? []) as CardRow[],
      chips: (chipRes.data ?? []) as ChipRow[],
    };
  });
  return {
    session,
    config: resolveConfig(session.config),
    teams: teams.map(mapTeam),
    players: players.map(mapPlayer),
    cards: cards.map(mapCard),
    chips: chips.map(mapChip),
    fetchedAt: Date.now(),
  };
}

// Fresh scenario artwork for a Ripples session, resolved live from Foresight so
// the signed URLs are valid at render time (they expire fast — never snapshot
// them). Tolerant of the platform being down: returns [] and the UI just omits
// art. Pages calling this must be force-dynamic.
export async function getRippleArt(session: WorkshopSession): Promise<RippleArtImage[]> {
  const cfg = resolveConfig(session.config);
  if (!cfg.scenarioRef || !foresightConfigured()) return [];
  try {
    const scenario = await getScenario(cfg.scenarioRef, cfg.projectRef ?? undefined);
    return (scenario?.images ?? [])
      .filter((img): img is typeof img & { url: string } => Boolean(img.url))
      .sort((a, b) => a.position - b.position)
      .map((img) => ({ url: img.url, prompt: img.prompt ?? "" }));
  } catch (err) {
    console.error("[getRippleArt]", err);
    return [];
  }
}

// The full scenario for a Ripples session, resolved live from Foresight so its
// signed image URLs are valid at render time (never snapshotted). Used by the
// participant play surface, which renders the shared ScenarioReader as the
// backdrop. Returns null when the platform is down/unset — the play surface then
// falls back to the snapshotted premise text in config. Pages must be force-dynamic.
export async function getRippleScenario(session: WorkshopSession): Promise<Scenario | null> {
  const cfg = resolveConfig(session.config);
  if (!cfg.scenarioRef || !foresightConfigured()) return null;
  try {
    return await getScenario(cfg.scenarioRef, cfg.projectRef ?? undefined);
  } catch (err) {
    console.error("[getRippleScenario]", err);
    return null;
  }
}

// The project's driver cards, for the Drivers tab on the scenario backdrop. The
// reader filters these down to the scenario's linked drivers. Non-fatal: an empty
// list just hides the tab. Same project ref as the scenario.
export async function getRippleDrivers(session: WorkshopSession): Promise<PublicDriverCard[]> {
  const cfg = resolveConfig(session.config);
  if (!cfg.scenarioRef || !foresightConfigured()) return [];
  try {
    return await getForesightDrivers(cfg.projectRef ?? undefined);
  } catch (err) {
    console.error("[getRippleDrivers]", err);
    return [];
  }
}

export async function getPlayerByParticipant(
  code: string,
  participantId: string
): Promise<RipplePlayer | null> {
  if (!participantId) return null;
  const data = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("ripple_players")
      .select("*")
      .eq("code", up(code))
      .eq("participant_id", participantId)
      .maybeSingle();
    if (error) throw error;
    return data as PlayerRow | null;
  });
  return data ? mapPlayer(data) : null;
}

export async function getRippleCard(code: string, cardId: string): Promise<RippleCard | null> {
  const data = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("ripple_cards")
      .select("*")
      .eq("code", up(code))
      .eq("id", cardId)
      .maybeSingle();
    if (error) throw error;
    return data as CardRow | null;
  });
  return data ? mapCard(data) : null;
}

export async function countTeamMembers(teamId: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("ripple_players")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);
  if (error) throw error;
  return count ?? 0;
}

export async function countPlayerChips(code: string, playerId: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("ripple_chips")
    .select("id", { count: "exact", head: true })
    .eq("code", up(code))
    .eq("player_id", playerId);
  if (error) throw error;
  return count ?? 0;
}

// ---------- join: create-or-get a player (idempotent on participant_id) ----------
export async function joinRipples(input: {
  sessionId: string;
  code: string;
  participantId: string;
  displayName: string;
  teamId?: string; // join an existing board…
  teamName?: string; // …or create a new one
  projectId?: string | null;
}): Promise<{ team: RippleTeam; player: RipplePlayer }> {
  const code = up(input.code);
  const db = supabaseAdmin();

  // Idempotent rejoin: a device already on this session keeps its player/team.
  const existing = await getPlayerByParticipant(code, input.participantId);
  if (existing) {
    if (input.displayName && input.displayName !== existing.displayName) {
      await withRetry(async () => {
        const { error } = await db
          .from("ripple_players")
          .update({ display_name: input.displayName })
          .eq("id", existing.id);
        if (error) throw error;
      });
      existing.displayName = input.displayName;
    }
    const teams = await getRippleTeams(code);
    const team = teams.find((t) => t.id === existing.teamId);
    if (team) return { team, player: existing };
  }

  // Resolve the target team: join a named one, or create a fresh board.
  let team: RippleTeam;
  if (input.teamId) {
    const teams = await getRippleTeams(code);
    const found = teams.find((t) => t.id === input.teamId);
    if (!found) throw new Error("TEAM_NOT_FOUND");
    team = found;
  } else {
    const existingTeams = await getRippleTeams(code);
    const n = existingTeams.length;
    const color = TEAM_COLORS[n % TEAM_COLORS.length].hex;
    const name = input.teamName?.trim() || `Team ${n + 1}`;
    const row = await withRetry(async () => {
      const { data, error } = await db
        .from("ripple_teams")
        .insert({ session_id: input.sessionId, code, name, color, join_order: n })
        .select("*")
        .single();
      if (error) throw error;
      return data as TeamRow;
    });
    team = mapTeam(row);
  }

  // Create the player. On a rare unique(code, participant_id) collision (a double
  // submit), fall back to the now-existing row instead of erroring.
  try {
    const row = await withRetry(async () => {
      const { data, error } = await db
        .from("ripple_players")
        .insert({
          session_id: input.sessionId,
          code,
          team_id: team.id,
          participant_id: input.participantId,
          display_name: input.displayName?.trim() || "Player",
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as PlayerRow;
    });
    return { team, player: mapPlayer(row) };
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      const again = await getPlayerByParticipant(code, input.participantId);
      if (again) {
        const teams = await getRippleTeams(code);
        const t = teams.find((x) => x.id === again.teamId) ?? team;
        return { team: t, player: again };
      }
    }
    throw err;
  }
}

// Record a player's reflection answers and mark them submitted.
export async function submitAnswers(input: {
  code: string;
  playerId: string;
  answers: Record<string, string>;
  submittedAt: string;
}): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("ripple_players")
    .update({ answers: input.answers, submitted_at: input.submittedAt })
    .eq("code", up(input.code))
    .eq("id", input.playerId);
  if (error) throw error;
}

// ---------- cards ----------
export async function addCard(input: {
  sessionId: string;
  code: string;
  teamId: string;
  authorPlayerId: string;
  order: CardOrder;
  parentId: string | null;
  text: string;
  sort?: number;
}): Promise<RippleCard> {
  const row = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("ripple_cards")
      .insert({
        session_id: input.sessionId,
        code: up(input.code),
        team_id: input.teamId,
        author_player_id: input.authorPlayerId,
        card_order: input.order,
        parent_card_id: input.parentId,
        text: input.text,
        sort: input.sort ?? 0,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as CardRow;
  });
  return mapCard(row);
}

// Reorder a brainstorm sticky (team-scoped) by setting its sort key.
export async function updateCardSort(code: string, cardId: string, sort: number): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("ripple_cards")
    .update({ sort })
    .eq("code", up(code))
    .eq("id", cardId);
  if (error) throw error;
}

// Edit a card's text in place (used for inline sticky/note editing).
export async function updateCardText(code: string, cardId: string, text: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("ripple_cards")
    .update({ text })
    .eq("code", up(code))
    .eq("id", cardId);
  if (error) throw error;
}

// Delete a card (its children cascade via parent_card_id on delete cascade).
export async function deleteCard(code: string, cardId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("ripple_cards")
    .delete()
    .eq("code", up(code))
    .eq("id", cardId);
  if (error) throw error;
}

export async function flagCard(code: string, cardId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("ripple_cards")
    .update({ flagged: true })
    .eq("code", up(code))
    .eq("id", cardId);
  if (error) throw error;
}

// Record a challenge vote (deduped by unique(card_id, player_id)) and grey the card
// if it now has a team majority. Returns the fresh state for the response.
export async function voteCard(input: {
  sessionId: string;
  code: string;
  cardId: string;
  teamId: string;
  playerId: string;
}): Promise<{ greyed: boolean; votes: number; members: number }> {
  const code = up(input.code);
  const db = supabaseAdmin();

  // Insert the vote; a duplicate (same player) is a no-op, not an error.
  const { error: insErr } = await db.from("ripple_card_votes").insert({
    session_id: input.sessionId,
    code,
    card_id: input.cardId,
    player_id: input.playerId,
  });
  if (insErr && (insErr as { code?: string }).code !== "23505") throw insErr;

  const [{ count: votes }, members] = await Promise.all([
    db
      .from("ripple_card_votes")
      .select("id", { count: "exact", head: true })
      .eq("card_id", input.cardId),
    countTeamMembers(input.teamId),
  ]);
  const voteCount = votes ?? 0;
  const greyed = voteCount * 2 > members; // strict majority of the team

  if (greyed) {
    const { error } = await db
      .from("ripple_cards")
      .update({ greyed: true })
      .eq("code", code)
      .eq("id", input.cardId);
    if (error) throw error;
  }
  return { greyed, votes: voteCount, members };
}

// ---------- chips ----------
// Single insert (no withRetry): a unique(player_id, card_id) collision is the
// expected "already chipped" conflict and should return immediately (the route
// maps 23505 → 409), not sit through a retry backoff.
export async function placeChip(input: {
  sessionId: string;
  code: string;
  teamId: string;
  playerId: string;
  cardId: string;
}): Promise<RippleChip> {
  const { data, error } = await supabaseAdmin()
    .from("ripple_chips")
    .insert({
      session_id: input.sessionId,
      code: up(input.code),
      team_id: input.teamId,
      player_id: input.playerId,
      card_id: input.cardId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapChip(data as ChipRow);
}

export async function removeChip(input: {
  code: string;
  playerId: string;
  cardId: string;
}): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("ripple_chips")
    .delete()
    .eq("code", up(input.code))
    .eq("player_id", input.playerId)
    .eq("card_id", input.cardId);
  if (error) throw error;
}
