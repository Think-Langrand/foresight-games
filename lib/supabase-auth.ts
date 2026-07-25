import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

// Cookie-based Supabase client for reading the *logged-in facilitator* in Server
// Components and Route Handlers. This is only an auth gate — all data reads/writes
// still go through the service-role client in lib/supabase.ts. Uses the anon key
// (RLS applies), plus the httpOnly auth cookies Supabase sets on sign-in.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function authConfigured(): boolean {
  return Boolean(URL && ANON);
}

// Read the current user from the request's auth cookies. Returns null when auth
// isn't configured or nobody is signed in. `getUser()` verifies the JWT with the
// auth server, so this is a trustworthy check (not just a decoded cookie).
export async function getSessionUser(): Promise<User | null> {
  if (!authConfigured()) return null;
  const cookieStore = await cookies();
  const supabase = createServerClient(URL!, ANON!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // In a Server Component the cookie store is read-only; ignore write
        // attempts here. Session refresh/cookie writes happen in proxy.ts.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* read-only context */
        }
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}
