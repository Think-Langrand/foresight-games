import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { updateUncertainty, deleteUncertainty } from "@/lib/admin-content";
import { parseUncertainty } from "@/lib/admin-content-validate";

export const dynamic = "force-dynamic";

// Admin-only: edit an uncertainty and reconcile its outcome cards (slug is
// immutable — it's the outcomes' foreign key).
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

  const parsed = parseUncertainty(body, { withSlug: false });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    await updateUncertainty(slug, parsed.input);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH uncertainty]", err);
    return NextResponse.json({ error: "Failed to update uncertainty." }, { status: 500 });
  }
}

// Admin-only: delete an uncertainty (its outcome cards cascade).
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
    await deleteUncertainty(slug);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE uncertainty]", err);
    return NextResponse.json({ error: "Failed to delete uncertainty." }, { status: 500 });
  }
}
