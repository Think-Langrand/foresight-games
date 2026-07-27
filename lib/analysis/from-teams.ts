// Bridge from the live store to the analysis layer.
//
// Resolves each Team's triad card ids against the deck into the flat KernelEntry
// export shape (the same shape the admin JSON export produces). This is the ONE
// place the analysis view touches the domain model; everything downstream is
// pure functions over KernelEntry[].

import { teamTriadIds, type Card, type Team } from "@/lib/workshop-types";
import type { KernelCard, KernelEntry } from "./types";

export function teamToKernelEntry(team: Team, byId: Map<string, Card>): KernelEntry {
  const cards: KernelCard[] = teamTriadIds(team)
    .map((id) => byId.get(id))
    .filter((c): c is Card => Boolean(c))
    .map((c) => ({
      title: c.title,
      role: c.role,
      dimension: c.dimension,
      condition: c.condition,
    }));

  return {
    id: team.id,
    code: team.code,
    name: team.name,
    worldTitle: team.worldTitle,
    status: team.status,
    convergence: team.convergence,
    primaryCondition: team.primaryCondition,
    definingCharacteristics: team.definingCharacteristics,
    centralTension: team.centralTension,
    newNormal: team.newNormal,
    brokenAssumption: team.brokenAssumption,
    worldDescription: team.worldDescription,
    createdTime: team.createdTime,
    cards,
    tone: team.tone ?? null,
    family: team.family ?? null,
  };
}

export function teamsToKernelEntries(teams: Team[], deck: { cards: Card[] }): KernelEntry[] {
  const byId = new Map(deck.cards.map((c) => [c.id, c]));
  return teams.map((t) => teamToKernelEntry(t, byId));
}
