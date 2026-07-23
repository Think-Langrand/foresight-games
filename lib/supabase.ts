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
