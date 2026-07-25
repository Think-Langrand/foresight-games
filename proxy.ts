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

  // IMPORTANT: getUser() must be called to refresh the token cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
