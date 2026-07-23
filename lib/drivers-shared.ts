// Client-safe driver types. Cards link to drivers through their uncertainty's
// `sourceDriverIds` (curated in data/uncertainties.seed.json), so no name-string
// matching or alias map is needed — resolution is a direct slug lookup.

export interface DriverLite {
  slug: string;
  number: number;
  name: string;
  theme: string;
  headline: string;
  body: string;
}

// Resolve a card's driver slugs to the drivers they map to (deduped, in order).
// Slugs with no loaded driver (e.g. the pending climate/disease drivers) are
// dropped silently.
export function resolveDrivers(
  sourceDriverIds: string[],
  bySlug: Map<string, DriverLite>
): DriverLite[] {
  const out: DriverLite[] = [];
  const seen = new Set<string>();
  for (const slug of sourceDriverIds) {
    if (seen.has(slug)) continue;
    const d = bySlug.get(slug);
    if (d) {
      seen.add(slug);
      out.push(d);
    }
  }
  return out;
}
