import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import { createDesignGroup, listDesignGroups } from "@/lib/design-groups";

export const dynamic = "force-dynamic";

// Admin-only: list a project's design groups. [id] = project id (matches the
// sibling projects/[id] route's param name — Next requires one slug name per level).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const groups = await listDesignGroups(project.id);
  return NextResponse.json({ groups });
}

// Admin-only: create a design group in this project.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  let body: { name?: string; sort?: number; color?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  try {
    // Default new group to the end of the list (existing count).
    const existing = await listDesignGroups(project.id);
    const group = await createDesignGroup({
      projectId: project.id,
      name,
      sort: typeof body.sort === "number" ? body.sort : existing.length,
      color: body.color ?? null,
    });
    return NextResponse.json({ group });
  } catch (err) {
    console.error("[POST design-group]", err);
    return NextResponse.json({ error: "Failed to create design group." }, { status: 500 });
  }
}
