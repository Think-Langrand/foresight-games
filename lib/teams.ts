import "server-only";

import { supabaseAdmin, supabaseConfigured, withRetry } from "@/lib/supabase";
import { getDeck } from "@/lib/cards";
import { STARTER_DIMENSIONS } from "@/lib/capture";
import {
  TEAM_COLORS,
  type Card,
  type Deck,
  type Team,
  type TeamStatus,
  type UncertaintyLite,
} from "@/lib/workshop-types";

interface TeamRow {
  id: string;
  code: string;
  name: string;
  color: string;
  seed_uncertainty_id: string;
  seed_card_id: string;
  seed_locked: boolean | null;
  kept_ids: string[] | null;
  wildcard_id: string | null;
  convergence: string;
  world_title: string;
  world_description: string;
  primary_condition: string;
  defining_characteristics: string;
  central_tension: string;
  new_normal: string;
  broken_assumption: string;
  status: string;
  created_at: string;
  tone: string | null;
  family: string | null;
}

function mapTeam(r: TeamRow): Team {
  return {
    id: r.id,
    code: r.code,
    name: r.name ?? "",
    color: r.color || TEAM_COLORS[0].hex,
    seedUncertaintyId: r.seed_uncertainty_id ?? "",
    seedCardId: r.seed_card_id ?? "",
    seedLocked: r.seed_locked ?? false,
    keptIds: r.kept_ids ?? [],
    wildcardId: r.wildcard_id || null,
    convergence: r.convergence ?? "",
    worldTitle: r.world_title ?? "",
    worldDescription: r.world_description ?? "",
    primaryCondition: r.primary_condition ?? "",
    definingCharacteristics: r.defining_characteristics ?? "",
    centralTension: r.central_tension ?? "",
    newNormal: r.new_normal ?? "",
    brokenAssumption: r.broken_assumption ?? "",
    status: (r.status ?? "Drafting") as TeamStatus,
    createdTime: r.created_at,
    tone: (r.tone as Team["tone"]) ?? null,
    family: r.family ?? null,
  };
}

// ---------- dealing ----------
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Deal slot 1's LOCKED uncertainty: a curated STARTER uncertainty no other group
// is already seeded on, so each group starts from a different one. Falls back to
// any starter, then any uncertainty, if the curated set is exhausted.
export function dealSeedUncertainty(
  deck: Deck,
  excludeUncertaintyIds: string[] = []
): UncertaintyLite {
  const excluded = new Set(excludeUncertaintyIds);
  const starters = deck.uncertainties.filter((u) => STARTER_DIMENSIONS.includes(u.title));
  const fresh = starters.filter((u) => !excluded.has(u.id));
  const pool = fresh.length ? fresh : starters.length ? starters : deck.uncertainties;
  return pick(pool);
}

// One random Wildcard card, if the deck holds one (offered as a late stress-test).
export function drawWildcard(deck: Deck): Card | null {
  const wilds = deck.cards.filter((c) => c.role === "Wildcard");
  return wilds.length ? pick(wilds) : null;
}

// ---------- reads / writes ----------
export async function getTeams(
  code: string,
  _opts: { force?: boolean } = {}
): Promise<Team[]> {
  if (!supabaseConfigured()) return [];
  const data = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("teams")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data as TeamRow[];
  });
  return data.map(mapTeam);
}

// Every team across all sessions, newest first. Used by the public "scenario
// molecules" gallery and the admin view-all screen. Pass onlySubmitted to hide
// still-drafting tables from the public gallery.
export async function listAllTeams(
  opts: { onlySubmitted?: boolean } = {}
): Promise<Team[]> {
  if (!supabaseConfigured()) return [];
  const data = await withRetry(async () => {
    let q = supabaseAdmin()
      .from("teams")
      .select("*")
      .order("created_at", { ascending: false });
    if (opts.onlySubmitted) q = q.eq("status", "Submitted");
    const { data, error } = await q;
    if (error) throw error;
    return data as TeamRow[];
  });
  return data.map(mapTeam);
}

// A single team by its uuid (for /scenario-molecules/[id]).
export async function getTeamById(id: string): Promise<Team | null> {
  if (!supabaseConfigured()) return null;
  const data = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("teams")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as TeamRow | null;
  });
  return data ? mapTeam(data) : null;
}

export async function createTeam(input: {
  sessionId: string;
  code: string;
  name?: string;
  // Solo builders pick all three cards themselves, so we skip the locked slot-1
  // seed. Facilitated sessions still deal each team a distinct starter uncertainty.
  freeSeed?: boolean;
}): Promise<Team> {
  const { deck } = await getDeck();
  const existing = await getTeams(input.code);

  // Lock slot 1 to a starter uncertainty no other group already holds — unless
  // this is a free-seed (solo) build, where slot 1 is chosen like the others.
  const usedUncertainties = existing.map((t) => t.seedUncertaintyId).filter(Boolean);
  const seedUncertainty = input.freeSeed
    ? null
    : dealSeedUncertainty(deck, usedUncertainties);

  // Round-robin colour + default name off the current team count.
  const color = TEAM_COLORS[existing.length % TEAM_COLORS.length].hex;
  const name = input.name?.trim() || `Team ${existing.length + 1}`;

  const data = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("teams")
      .insert({
        session_id: input.sessionId,
        code: input.code,
        name,
        color,
        seed_uncertainty_id: seedUncertainty?.id ?? "",
        seed_card_id: "",
        kept_ids: [],
        status: "Drafting",
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as TeamRow;
  });
  return mapTeam(data);
}

// Admin: delete a single team by id.
export async function deleteTeam(id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("teams").delete().eq("id", id);
  if (error) throw error;
}

export async function updateTeam(
  id: string,
  _code: string,
  patch: Partial<{
    name: string;
    seedUncertaintyId: string;
    seedCardId: string;
    seedLocked: boolean;
    keptIds: string[];
    convergence: string;
    worldTitle: string;
    worldDescription: string;
    primaryCondition: string;
    definingCharacteristics: string;
    centralTension: string;
    newNormal: string;
    brokenAssumption: string;
    status: TeamStatus;
    wildcardId: string;
    tone: "hopeful" | "dark" | null;
    family: string | null;
  }>
): Promise<Team> {
  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.seedUncertaintyId !== undefined) fields.seed_uncertainty_id = patch.seedUncertaintyId;
  if (patch.seedCardId !== undefined) fields.seed_card_id = patch.seedCardId;
  if (patch.seedLocked !== undefined) fields.seed_locked = patch.seedLocked;
  if (patch.keptIds !== undefined) fields.kept_ids = patch.keptIds;
  if (patch.convergence !== undefined) fields.convergence = patch.convergence;
  if (patch.worldTitle !== undefined) fields.world_title = patch.worldTitle;
  if (patch.worldDescription !== undefined) fields.world_description = patch.worldDescription;
  if (patch.primaryCondition !== undefined) fields.primary_condition = patch.primaryCondition;
  if (patch.definingCharacteristics !== undefined)
    fields.defining_characteristics = patch.definingCharacteristics;
  if (patch.centralTension !== undefined) fields.central_tension = patch.centralTension;
  if (patch.newNormal !== undefined) fields.new_normal = patch.newNormal;
  if (patch.brokenAssumption !== undefined) fields.broken_assumption = patch.brokenAssumption;
  if (patch.status !== undefined) fields.status = patch.status;
  if (patch.wildcardId !== undefined) fields.wildcard_id = patch.wildcardId;
  if (patch.tone !== undefined) fields.tone = patch.tone;
  if (patch.family !== undefined) fields.family = patch.family;

  const data = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("teams")
      .update(fields)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as TeamRow;
  });
  return mapTeam(data);
}
