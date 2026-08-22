import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import {
  finalizeDesignGroup,
  getDesignGroup,
  reopenDesignGroup,
} from "@/lib/design-groups";

export const dynamic = "force-dynamic";

// Admin-only: finalize a group's map into its output (session → HARVEST, locks new
// implications), or reopen it for more building (session → BUILD). Body: { action }.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id, groupId } = await params;
  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const group = await getDesignGroup(groupId);
  if (!group || group.projectId !== project.id)
    return NextResponse.json({ error: "Design group not found." }, { status: 404 });

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    if (body.action === "reopen") await reopenDesignGroup(groupId);
    else if (body.action === "finalize") await finalizeDesignGroup(groupId);
    else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    const updated = await getDesignGroup(groupId);
    return NextResponse.json({ group: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "NO_SESSION")
      return NextResponse.json(
        { error: "Assign a scenario before finalizing." },
        { status: 400 }
      );
    console.error("[POST design-group finalize]", err);
    return NextResponse.json({ error: "Failed to update design group." }, { status: 500 });
  }
}
