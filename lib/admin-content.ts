import "server-only";

import { supabaseAdmin, withRetry } from "@/lib/supabase";
import { bust } from "@/lib/cache";

// Admin write layer for the curated content tables (`drivers`, `uncertainties`,
// `card_outcomes`). Reads live in lib/drivers.ts / lib/cards.ts and are cached;
// every write here busts the matching cache key so edits show up immediately.
// All writes go through the service-role client (bypasses RLS) — admin-only,
// gated by the API route handlers that call these.

const DRIVERS_CACHE = "drivers";
const UNC_CACHE = "uncertainty-rows"; // the deck reads through this too

export interface DriverInput {
  slug: string;
  number: number;
  name: string;
  theme: string;
  headline: string;
  body: string;
}

export async function createDriver(input: DriverInput): Promise<void> {
  await withRetry(async () => {
    const { error } = await supabaseAdmin().from("drivers").insert({
      slug: input.slug,
      number: input.number,
      name: input.name,
      theme: input.theme,
      headline: input.headline,
      body: input.body,
    });
    if (error) throw error;
  });
  bust(DRIVERS_CACHE);
}

// The slug is the identity uncertainties reference (source_driver_ids), so it is
// immutable on edit — only the other fields change.
export async function updateDriver(
  slug: string,
  input: Omit<DriverInput, "slug">
): Promise<void> {
  await withRetry(async () => {
    const { error } = await supabaseAdmin()
      .from("drivers")
      .update({
        number: input.number,
        name: input.name,
        theme: input.theme,
        headline: input.headline,
        body: input.body,
      })
      .eq("slug", slug);
    if (error) throw error;
  });
  bust(DRIVERS_CACHE);
}

export async function deleteDriver(slug: string): Promise<void> {
  await withRetry(async () => {
    const { error } = await supabaseAdmin().from("drivers").delete().eq("slug", slug);
    if (error) throw error;
  });
  bust(DRIVERS_CACHE);
}

export interface OutcomeInput {
  code?: string; // existing outcomes carry their C-code; new ones are assigned
  role: string; // Core | Edge | Wildcard
  title: string;
  description: string;
}

export interface UncertaintyInput {
  slug: string;
  number: number;
  domain: string;
  title: string;
  question: string;
  sourceDriverIds: string[];
  outcomes: OutcomeInput[];
}

// Allocate `count` fresh, globally-unique outcome codes (C01…), stepping past
// the current max and any codes in `exclude` (the uncertainty's own kept codes).
async function nextCodes(count: number, exclude: Set<string>): Promise<string[]> {
  if (count === 0) return [];
  const rows = await withRetry(async () => {
    const { data, error } = await supabaseAdmin().from("card_outcomes").select("code");
    if (error) throw error;
    return (data ?? []) as { code: string }[];
  });
  let max = 0;
  for (const r of rows) {
    const m = /^C(\d+)$/.exec(r.code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const out: string[] = [];
  let n = max;
  while (out.length < count) {
    n += 1;
    const code = `C${String(n).padStart(2, "0")}`;
    if (!exclude.has(code)) out.push(code);
  }
  return out;
}

export async function createUncertainty(input: UncertaintyInput): Promise<void> {
  const sb = supabaseAdmin();
  await withRetry(async () => {
    const { error } = await sb.from("uncertainties").insert({
      slug: input.slug,
      number: input.number,
      domain: input.domain,
      title: input.title,
      question: input.question,
      source_driver_ids: input.sourceDriverIds,
    });
    if (error) throw error;
  });
  // If the outcome insert fails, roll back the just-created uncertainty so we
  // never persist a headerless one — the create is effectively atomic.
  try {
    const codes = await nextCodes(input.outcomes.length, new Set());
    const rows = input.outcomes.map((o, i) => ({
      code: codes[i],
      uncertainty_slug: input.slug,
      role: o.role,
      title: o.title,
      description: o.description,
      sort_order: i,
    }));
    if (rows.length) {
      await withRetry(async () => {
        const { error } = await sb.from("card_outcomes").insert(rows);
        if (error) throw error;
      });
    }
  } catch (err) {
    await sb.from("uncertainties").delete().eq("slug", input.slug);
    throw err;
  }
  bust(UNC_CACHE);
}

// The slug is the primary key and the outcomes' foreign key, so it is immutable
// on edit. Outcomes are reconciled: matched codes update in place (preserving
// any team references), new outcomes get fresh codes, dropped ones are deleted.
export async function updateUncertainty(
  slug: string,
  input: Omit<UncertaintyInput, "slug">
): Promise<void> {
  const sb = supabaseAdmin();
  await withRetry(async () => {
    const { error } = await sb
      .from("uncertainties")
      .update({
        number: input.number,
        domain: input.domain,
        title: input.title,
        question: input.question,
        source_driver_ids: input.sourceDriverIds,
      })
      .eq("slug", slug);
    if (error) throw error;
  });

  const existing = await withRetry(async () => {
    const { data, error } = await sb
      .from("card_outcomes")
      .select("code")
      .eq("uncertainty_slug", slug);
    if (error) throw error;
    return (data ?? []) as { code: string }[];
  });
  const existingCodes = new Set(existing.map((r) => r.code));

  const newCount = input.outcomes.filter(
    (o) => !o.code || !existingCodes.has(o.code)
  ).length;
  const fresh = await nextCodes(newCount, existingCodes);

  let ci = 0;
  const rows = input.outcomes.map((o, i) => ({
    code: o.code && existingCodes.has(o.code) ? o.code : fresh[ci++],
    uncertainty_slug: slug,
    role: o.role,
    title: o.title,
    description: o.description,
    sort_order: i,
  }));
  if (rows.length) {
    await withRetry(async () => {
      const { error } = await sb
        .from("card_outcomes")
        .upsert(rows, { onConflict: "code" });
      if (error) throw error;
    });
  }
  const kept = new Set(rows.map((r) => r.code));
  const toDelete = [...existingCodes].filter((c) => !kept.has(c));
  if (toDelete.length) {
    await withRetry(async () => {
      const { error } = await sb.from("card_outcomes").delete().in("code", toDelete);
      if (error) throw error;
    });
  }
  bust(UNC_CACHE);
}

export async function deleteUncertainty(slug: string): Promise<void> {
  // card_outcomes cascades on the uncertainties FK (on delete cascade).
  await withRetry(async () => {
    const { error } = await supabaseAdmin()
      .from("uncertainties")
      .delete()
      .eq("slug", slug);
    if (error) throw error;
  });
  bust(UNC_CACHE);
}
