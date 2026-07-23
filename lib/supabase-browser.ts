"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser Supabase client — anon/publishable key only. Used purely for realtime
// subscriptions (change events on the workshop tables, which have public SELECT
// RLS policies). All writes go through the app's API routes, never from here.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient | null {
  if (!URL || !ANON) return null;
  if (!client) {
    client = createClient(URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
