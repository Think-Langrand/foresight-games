import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase client. Uses the service_role key, so it BYPASSES RLS —
// never import this into a client component. All workshop writes go through here.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function supabaseConfigured(): boolean {
  return Boolean(URL && SERVICE_KEY);
}

let client: SupabaseClient | null = null;

// Lazily create a singleton (avoids constructing during build when env is absent).
export function supabaseAdmin(): SupabaseClient {
  if (!URL || !SERVICE_KEY) {
    throw new Error(
      "Supabase is not configured (missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."
    );
  }
  if (!client) {
    client = createClient(URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/**
 * Retry a Supabase call through transient origin failures. The project's
 * Cloudflare edge intermittently returns 520/525 (origin dropped the request)
 * under burst load; a short backoff lets the next attempt succeed instead of
 * surfacing a user-facing error. `fn` must re-issue the query each attempt
 * (PostgREST builders execute once), and should throw on `{ error }`.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 2, baseMs = 200 }: { retries?: number; baseMs?: number } = {}
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, baseMs * 2 ** attempt));
      }
    }
  }
  throw lastErr;
}
