import "server-only";

import unc from "@/data/uncertainties.seed.json";
import { supabaseAdmin, supabaseConfigured, withRetry } from "@/lib/supabase";
import { cached } from "@/lib/cache";
import {
  orderedDomains,
  type Card,
  type CardRole,
  type Deck,
  type UncertaintyLite,
} from "@/lib/workshop-types";
import {
  getForesightDrivers,
  getForesightUncertainties,
} from "@/lib/foresight/client";
import type { PublicUncertainty } from "@/lib/foresight/types";
import { getProjectById } from "@/lib/projects";
import { getDrivers } from "@/lib/drivers";
import type { DriverLite } from "@/lib/drivers-shared";
import { STARTER_DIMENSIONS } from "@/lib/capture";

// The deck is derived from the canonical scenario-uncertainties set: 13
// uncertainties x 4 outcome cards = 52. It is read from Supabase (tables
// `uncertainties` + `card_outcomes`) when configured, else the bundled seed
// (data/uncertainties.seed.json). Driver linkage lives on the uncertainty
// (sourceDriverIds), so cards inherit it.

// Normalized uncertainty row (Supabase, seed, or Carmelita), before deck assembly.
export interface UncertaintyRow {
  number: number;
  id: string; // slug
  domain: string;
  title: string;
  question: string;
  sourceDriverIds: string[];
  outcomes: { code: string; role: string; title: string; description: string }[];
  // Carmelita rows carry the platform's `sharpest` flag (the per-project starter
  // pool). Undefined for global rows, where STARTER_DIMENSIONS decides.
  sharpest?: boolean;
}

const SEED_UNCERTAINTIES = (unc as { uncertainties: UncertaintyRow[] }).uncertainties;

// The deck writes 'ai'/'chws' verbatim from the slides; present them cleanly.
function tidy(s: string): string {
  return s.replace(/\bai\b/g, "AI").replace(/\bchws\b/g, "CHWs");
}

function toRole(r: string): CardRole {
  return r === "Edge" || r === "Wildcard" ? r : "Core";
}

function buildDeck(input: UncertaintyRow[]): Deck {
  // Guard: guarantee a non-empty, stable uncertainty id even when the platform
  // leaves it blank (some Carmelita projects don't set one). Cards and the slot
  // picker key off this id, so a blank/duplicate id would collapse the 2nd/3rd-slot
  // picker (every uncertainty reads as the same one, already "in play"). Falls back
  // to the uncertainty number.
  const uncertaintiesInput = input.map((u) => ({
    ...u,
    id: u.id?.trim() || `u${u.number}`,
  }));
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
    // Carmelita: its `sharpest` flag; global: the curated STARTER_DIMENSIONS list.
    isStarter: u.sharpest !== undefined ? u.sharpest : STARTER_DIMENSIONS.includes(u.title),
  }));
  return { cards, dimensions, uncertainties, domains: orderedDomains(uncertaintiesInput) };
}

// Map a Carmelita PublicUncertainty into the deck's normalized row. sourceDriverIds
// are driver UUIDs (not slugs); getProjectDriverLites keys its map by the same UUIDs
// so the driver chips still resolve.
function mapPublicUncertaintyToRow(u: PublicUncertainty): UncertaintyRow {
  return {
    number: u.number,
    id: u.id, // == code, the stable per-project ref
    domain: u.domain,
    title: u.title,
    question: u.question,
    sourceDriverIds: u.sourceDriverIds,
    outcomes: u.outcomes.map((o) => ({
      code: o.code,
      role: o.role,
      title: o.title,
      description: o.description,
    })),
    sharpest: u.sharpest,
  };
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
export async function getUncertaintyRows(ref?: string): Promise<UncertaintyRow[]> {
  // Per-project: pull the project's Carmelita uncertainties and map to rows. The
  // underlying foresight fetch is no-store, but the mapped rows carry no expiring
  // URLs, so caching them in-process (5 min, per-ref key) is safe and keeps team
  // saves / live refetches from re-hitting the platform each time.
  if (ref) {
    return cached(`uncertainty-rows:${ref}`, 300_000, async () => {
      const pub = await getForesightUncertainties(ref);
      return pub.map(mapPublicUncertaintyToRow);
    });
  }
  if (!supabaseConfigured()) return SEED_UNCERTAINTIES;
  // Static content — cache it so team saves and live refetches don't re-read
  // the whole deck from Supabase every time (retrying through transient 520s).
  return cached("uncertainty-rows", 300_000, async () => {
    try {
      const { uncs, outs } = await withRetry(async () => {
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
        return {
          uncs: (uncRes.data ?? []) as UncRow[],
          outs: (outRes.data ?? []) as OutcomeRow[],
        };
      });
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
  });
}

/**
 * The outcome-card deck. With no `ref`, the global deck (Supabase, or the bundled
 * seed). With a `ref`, that project's deck built from its Carmelita uncertainties.
 */
export async function getDeck(
  ref?: string
): Promise<{ deck: Deck; source: "supabase" | "seed" | "carmelita" }> {
  if (ref) {
    const rows = await getUncertaintyRows(ref);
    return { deck: buildDeck(rows), source: "carmelita" };
  }
  const rows = await getUncertaintyRows();
  const source = supabaseConfigured() && rows !== SEED_UNCERTAINTIES ? "supabase" : "seed";
  return { deck: buildDeck(rows), source };
}

/**
 * Resolve the deck for a world/session by its stored `project_id`. This is THE
 * backward-compat seam: null → the global deck (unchanged); set → that project's
 * Carmelita deck. `getProjectById` is NOT enabled-filtered, so a session whose
 * project was later disabled still resolves. Returns the resolved carmelita `ref`
 * too, so callers know which driver source to use.
 */
export async function getDeckForProjectId(
  projectId: string | null
): Promise<{ deck: Deck; source: string; ref: string | null }> {
  if (!projectId) {
    const g = await getDeck();
    return { ...g, ref: null };
  }
  const project = await getProjectById(projectId);
  const ref = project?.carmelitaProjectRef ?? null;
  const d = await getDeck(ref ?? undefined);
  return { ...d, ref };
}

/**
 * Driver "lites" for a project deck, keyed by driver UUID (slug := d.id) so the
 * views' `new Map(drivers.map(d => [d.slug, d]))` + resolveDrivers() match the
 * UUID sourceDriverIds that project cards carry (global cards use slug keys —
 * resolveDrivers is key-agnostic). Falls back to the uncertainties' linkedDrivers
 * if the drivers endpoint is unavailable.
 */
export async function getProjectDriverLites(ref: string): Promise<DriverLite[]> {
  try {
    const cards = await getForesightDrivers(ref);
    return cards.map((d, i) => ({
      slug: d.id,
      number: i + 1,
      name: d.name,
      theme: d.tags[0]?.name ?? "",
      headline: d.shortDescription ?? "",
      body: "",
    }));
  } catch {
    const uncs = await getForesightUncertainties(ref).catch(() => []);
    const byId = new Map<string, DriverLite>();
    for (const u of uncs) {
      for (const d of u.linkedDrivers) {
        if (!byId.has(d.driverId)) {
          byId.set(d.driverId, {
            slug: d.driverId,
            number: byId.size + 1,
            name: d.name,
            theme: "",
            headline: "",
            body: "",
          });
        }
      }
    }
    return [...byId.values()];
  }
}

/** Drivers for a world/session by project_id: global slug-keyed, or project UUID-keyed. */
export async function getDriversForProjectRef(ref: string | null): Promise<DriverLite[]> {
  return ref ? getProjectDriverLites(ref) : getDrivers();
}

export function getSeedDeck(): Deck {
  return buildDeck(SEED_UNCERTAINTIES);
}
