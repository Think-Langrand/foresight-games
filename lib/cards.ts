import "server-only";

import unc from "@/data/uncertainties.seed.json";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase";
import type { Card, CardRole, Deck, UncertaintyLite } from "@/lib/workshop-types";

// The deck is derived from the canonical scenario-uncertainties set: 13
// uncertainties x 4 outcome cards = 52. It is read from Supabase (tables
// `uncertainties` + `card_outcomes`) when configured, else the bundled seed
// (data/uncertainties.seed.json). Driver linkage lives on the uncertainty
// (sourceDriverIds), so cards inherit it.

// Normalized uncertainty row (Supabase or seed), before deck assembly.
export interface UncertaintyRow {
  number: number;
  id: string; // slug
  domain: string;
  title: string;
  question: string;
  sourceDriverIds: string[];
  outcomes: { code: string; role: string; title: string; description: string }[];
}

const SEED_UNCERTAINTIES = (unc as { uncertainties: UncertaintyRow[] }).uncertainties;

// The deck writes 'ai'/'chws' verbatim from the slides; present them cleanly.
function tidy(s: string): string {
  return s.replace(/\bai\b/g, "AI").replace(/\bchws\b/g, "CHWs");
}

function toRole(r: string): CardRole {
  return r === "Edge" || r === "Wildcard" ? r : "Core";
}

function buildDeck(uncertaintiesInput: UncertaintyRow[]): Deck {
  const cards: Card[] = [];
  for (const u of uncertaintiesInput) {
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
  const dimensions = uncertaintiesInput.map((u) => u.title); // deck order
  const uncertainties: UncertaintyLite[] = uncertaintiesInput.map((u) => ({
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

// Supabase row shapes.
interface UncRow {
  slug: string;
  number: number;
  domain: string;
  title: string;
  question: string;
  source_driver_ids: string[] | null;
}
interface OutcomeRow {
  code: string;
  uncertainty_slug: string;
  role: string;
  title: string;
  description: string;
  sort_order: number;
}

/**
 * The normalized uncertainty set. Reads Supabase when configured (ordered by
 * uncertainty number, then card sort order), else the bundled seed. Shared by
 * the deck (here) and the scenario-uncertainty model (lib/model.ts).
 */
export async function getUncertaintyRows(): Promise<UncertaintyRow[]> {
  if (!supabaseConfigured()) return SEED_UNCERTAINTIES;
  try {
    const sb = supabaseAdmin();
    const [uncRes, outRes] = await Promise.all([
      sb
        .from("uncertainties")
        .select("slug, number, domain, title, question, source_driver_ids")
        .order("number", { ascending: true }),
      sb
        .from("card_outcomes")
        .select("code, uncertainty_slug, role, title, description, sort_order")
        .order("sort_order", { ascending: true }),
    ]);
    if (uncRes.error) throw uncRes.error;
    if (outRes.error) throw outRes.error;
    const uncs = (uncRes.data ?? []) as UncRow[];
    const outs = (outRes.data ?? []) as OutcomeRow[];
    if (uncs.length === 0 || outs.length === 0) return SEED_UNCERTAINTIES;

    const bySlug = new Map<string, UncertaintyRow>();
    for (const u of uncs) {
      bySlug.set(u.slug, {
        number: u.number,
        id: u.slug,
        domain: u.domain,
        title: u.title,
        question: u.question,
        sourceDriverIds: u.source_driver_ids ?? [],
        outcomes: [],
      });
    }
    for (const o of outs) {
      bySlug.get(o.uncertainty_slug)?.outcomes.push({
        code: o.code,
        role: o.role,
        title: o.title,
        description: o.description,
      });
    }
    return [...bySlug.values()];
  } catch (err) {
    console.error("[getUncertaintyRows] Supabase read failed, using seed:", err);
    return SEED_UNCERTAINTIES;
  }
}

/** The outcome-card deck, built from Supabase (or the bundled seed). */
export async function getDeck(): Promise<{ deck: Deck; source: "supabase" | "seed" }> {
  const rows = await getUncertaintyRows();
  const source = supabaseConfigured() && rows !== SEED_UNCERTAINTIES ? "supabase" : "seed";
  return { deck: buildDeck(rows), source };
}

export function getSeedDeck(): Deck {
  return buildDeck(SEED_UNCERTAINTIES);
}
