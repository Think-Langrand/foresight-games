import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Next.js 16 "Proxy" (formerly Middleware). Refreshes the Supabase auth session
// and gates the facilitator admin area: an unauthenticated request to /admin is
// redirected to /login. The public site (card game, drivers, uncertainties,
// scenario molecules) is untouched. Secure checks are ALSO enforced in the admin
// route handlers — this is the optimistic front door.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function proxy(request: NextRequest) {
  // If auth isn't configured, don't lock anyone out of the local/preview build.
  if (!URL || !ANON) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, options);
      },
    },
  });

  // IMPORTANT: getUser() must be called to refresh the token cookies. It THROWS an
  // AuthApiError ("Invalid Refresh Token") when the request carries a stale/expired
  // auth cookie (e.g. left over from another Supabase project or a prior deploy) —
  // so it must be caught, or the admin area 500s instead of bouncing to /login.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    const redirect = NextResponse.redirect(url);
    // Clear any stale Supabase auth cookies so a bad refresh token doesn't keep
    // re-triggering the error on every subsequent request.
    for (const c of request.cookies.getAll()) {
      if (c.name.startsWith("sb-")) redirect.cookies.delete(c.name);
    }
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
