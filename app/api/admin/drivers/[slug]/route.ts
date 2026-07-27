import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { updateDriver, deleteDriver } from "@/lib/admin-content";
import { parseDriver } from "@/lib/admin-content-validate";

export const dynamic = "force-dynamic";

// Admin-only: edit a driver's fields (slug is immutable).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { slug } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseDriver(body, { withSlug: false });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    await updateDriver(slug, parsed.input);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = (err as { code?: string })?.code === "23505"
      ? "Another driver already uses that name."
      : "Failed to update driver.";
    console.error("[PATCH driver]", err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// Admin-only: delete a driver.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { slug } = await params;
  try {
    await deleteDriver(slug);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE driver]", err);
    return NextResponse.json({ error: "Failed to delete driver." }, { status: 500 });
  }
}
