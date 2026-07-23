import "server-only";

import unc from "@/data/uncertainties.seed.json";
import type { Card, CardRole, Deck, UncertaintyLite } from "@/lib/workshop-types";

// The deck is derived from the canonical scenario-uncertainties set
// (data/uncertainties.seed.json): 13 uncertainties × 4 outcome cards = 52.
// Driver linkage lives on the uncertainty (sourceDriverIds), so cards inherit it.

interface OutcomeRow {
  code: string;
  role: string;
  title: string;
  description: string;
}
interface UncertaintyRow {
  number: number;
  id: string;
  domain: string;
  title: string;
  question: string;
  sourceDriverIds: string[];
  outcomes: OutcomeRow[];
}

const UNCERTAINTIES = (unc as { uncertainties: UncertaintyRow[] }).uncertainties;

// The deck writes 'ai'/'chws' verbatim from the slides; present them cleanly.
function tidy(s: string): string {
  return s.replace(/\bai\b/g, "AI").replace(/\bchws\b/g, "CHWs");
}

function toRole(r: string): CardRole {
  return r === "Edge" || r === "Wildcard" ? r : "Core";
}

function buildDeck(): Deck {
  const cards: Card[] = [];
  for (const u of UNCERTAINTIES) {
    for (const o of u.outcomes) {
      cards.push({
        id: o.code,
        uncertaintyId: u.id,
        dimension: u.title,
        domain: u.domain,
        seedingQuestion: u.question,
        sourceDriverIds: u.sourceDriverIds ?? [],
        title: tidy(o.title),
        condition: tidy(o.description),
        role: toRole(o.role),
      });
    }
  }
  cards.sort((a, b) => a.id.localeCompare(b.id));
  const dimensions = UNCERTAINTIES.map((u) => u.title); // deck order
  const uncertainties: UncertaintyLite[] = UNCERTAINTIES.map((u) => ({
    id: u.id,
    number: u.number,
    title: u.title,
    domain: u.domain,
    question: u.question,
    sourceDriverIds: u.sourceDriverIds ?? [],
    outcomeCodes: u.outcomes.map((o) => o.code),
  }));
  return { cards, dimensions, uncertainties };
}

const DECK: Deck = buildDeck();

/** The outcome-card deck, built from the bundled uncertainties set. */
export async function getDeck(): Promise<{ deck: Deck; source: "seed" }> {
  return { deck: DECK, source: "seed" };
}

export function getSeedDeck(): Deck {
  return DECK;
}
