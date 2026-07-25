"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Browser auth client (anon key) that reads/writes the Supabase auth cookies the
// proxy and server components rely on. Used only by the login/sign-out UI.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function supabaseAuthBrowser(): SupabaseClient | null {
  if (!URL || !ANON) return null;
  if (!client) client = createBrowserClient(URL, ANON);
  return client;
}
