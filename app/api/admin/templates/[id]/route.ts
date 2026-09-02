import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getTemplate, updateTemplate, deleteTemplate } from "@/lib/exercise-templates";
import { type WorksheetSection } from "@/lib/exercise-types";

export const dynamic = "force-dynamic";

// Admin-only: edit a template (name/description/type/sections/sort).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const existing = await getTemplate(id);
  if (!existing) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  let body: {
    name?: string;
    description?: string;
    type?: string;
    sections?: WorksheetSection[];
    sort?: number;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    await updateTemplate(id, {
      name: body.name,
      description: body.description,
      type: body.type,
      sections: body.sections,
      sort: body.sort,
    });
    return NextResponse.json({ template: await getTemplate(id) });
  } catch (err) {
    console.error("[PATCH template]", err);
    return NextResponse.json({ error: "Failed to update template." }, { status: 500 });
  }
}

// Admin-only: delete a template. Exercises already stamped from it are snapshots and are
// unaffected.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  try {
    await deleteTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE template]", err);
    return NextResponse.json({ error: "Failed to delete template." }, { status: 500 });
  }
}
