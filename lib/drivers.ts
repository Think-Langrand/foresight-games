import "server-only";

import seed from "@/data/drivers.seed.json";
import { supabaseAdmin, supabaseConfigured, withRetry } from "@/lib/supabase";
import { cached } from "@/lib/cache";
import type { DriverLite } from "@/lib/drivers-shared";

const SEED_DRIVERS: DriverLite[] = (seed as { drivers: DriverLite[] }).drivers;

interface DriverRow {
  slug: string;
  number: number;
  name: string;
  theme: string;
  headline: string;
  body: string;
}

/**
 * The curated driver set. Reads the Supabase `drivers` table when configured,
 * else the bundled seed (data/drivers.seed.json). Ordered by slide number.
 */
export async function getDrivers(): Promise<DriverLite[]> {
  if (!supabaseConfigured()) return SEED_DRIVERS;
  return cached("drivers", 300_000, async () => {
    try {
      const rows = await withRetry(async () => {
        const { data, error } = await supabaseAdmin()
          .from("drivers")
          .select("slug, number, name, theme, headline, body")
          .order("number", { ascending: true });
        if (error) throw error;
        return (data ?? []) as DriverRow[];
      });
      return rows.length ? rows : SEED_DRIVERS;
    } catch (err) {
      console.error("[getDrivers] Supabase read failed, using seed:", err);
      return SEED_DRIVERS;
    }
  });
}
