import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { updateProject, deleteProject } from "@/lib/projects";
import { parseProject } from "@/lib/admin-projects-validate";
import { hashPassphrase } from "@/lib/project-gate";

export const dynamic = "force-dynamic";

// Admin-only: edit a project (slug is immutable). Passphrase rules:
//   clearPassphrase=true  -> remove the gate (hash = null)
//   passphrase non-empty  -> set/rotate to the new hash
//   otherwise             -> leave the existing hash unchanged
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseProject(body, { withSlug: false });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const passphraseHash = parsed.input.clearPassphrase
    ? null
    : parsed.input.passphrase
      ? hashPassphrase(parsed.input.passphrase)
      : undefined; // leave unchanged

  try {
    await updateProject(id, {
      name: parsed.input.name,
      carmelitaProjectRef: parsed.input.carmelitaProjectRef,
      homeConfig: parsed.input.homeConfig,
      enabled: parsed.input.enabled,
      passphraseHash,
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[PATCH project]", err);
    return NextResponse.json({ error: "Failed to update project." }, { status: 400 });
  }
}

// Admin-only: delete a project.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  try {
    await deleteProject(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE project]", err);
    return NextResponse.json({ error: "Failed to delete project." }, { status: 500 });
  }
}
