import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import { buildProjectExport } from "@/lib/cohort-export";

export const dynamic = "force-dynamic";
// The app runs on Render as a long-lived Node server, so this export is inert here — kept
// to match the sibling routes. A whole-project export is a dozen or so board reads, which
// is well inside any limit, but a project with many groups and weeks grows linearly.
export const maxDuration = 300;

// Admin-only: the whole project — every design group, every week — in one payload.
//
// READ-ONLY BY DESIGN. Nothing here writes a card, a config key or a row.
//
// A route rather than part of the admin page's render because building it costs one board
// read per (group × board-backed week). The project page is opened constantly and almost
// never to export, so paying that on every render would be paying it ~always for ~never.
//
// This is also the only way the real data comes out: local environments point at dev, and
// the facilitator-facing admin runs against prod, so the person who needs the export is
// the one who can reach it.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const payload = await buildProjectExport({
    id: project.id,
    slug: project.slug,
    name: project.name,
  });
  return NextResponse.json(payload);
}
