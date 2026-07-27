import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { createDriver } from "@/lib/admin-content";
import { parseDriver } from "@/lib/admin-content-validate";

export const dynamic = "force-dynamic";

// Admin-only: create a curated slide driver.
export async function POST(req: Request) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseDriver(body, { withSlug: true });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    await createDriver(parsed.input);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = (err as { code?: string })?.code === "23505"
      ? "A driver with that slug or name already exists."
      : "Failed to create driver.";
    console.error("[POST driver]", err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
