import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import {
  getCanonicalProgram,
  saveProgram,
  StartedWeekEditError,
  type ProgramWeekInput,
} from "@/lib/design-program";
import { resolveSections } from "@/lib/exercise-types";

export const dynamic = "force-dynamic";

// Admin-only: the PROJECT-LEVEL program. [id] = project id. GET returns the canonical
// program (weeks + group roster) the editor renders; PUT accepts the full canonical
// program and fans it out to every group (lib/design-program.reconcileGroupsToProgram).

async function guard(id: string) {
  if (!supabaseConfigured())
    return { res: NextResponse.json({ error: "Database not configured." }, { status: 503 }) };
  if (!(await getSessionUser()))
    return { res: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  const project = await getProjectById(id);
  if (!project)
    return { res: NextResponse.json({ error: "Project not found." }, { status: 404 }) };
  return { project };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if ("res" in g) return g.res;
  try {
    const program = await getCanonicalProgram(g.project.id);
    return NextResponse.json(program);
  } catch (err) {
    console.error("[GET program]", err);
    return NextResponse.json({ error: "Failed to load program." }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id);
  if ("res" in g) return g.res;

  let body: { weeks?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!Array.isArray(body.weeks))
    return NextResponse.json({ error: "weeks[] is required." }, { status: 400 });
  if (body.weeks.length === 0)
    return NextResponse.json(
      { error: "A program needs at least one week. Delete the group instead to clear it." },
      { status: 400 }
    );

  const weeks: ProgramWeekInput[] = body.weeks.map((raw) => {
    const w = (raw ?? {}) as Record<string, unknown>;
    const slots =
      w.slots && typeof w.slots === "object" && !Array.isArray(w.slots)
        ? (w.slots as Record<string, string>)
        : {};
    return {
      title: typeof w.title === "string" ? w.title : "",
      type: typeof w.type === "string" ? w.type : "placeholder",
      opensAt: typeof w.opensAt === "string" && w.opensAt ? w.opensAt : null,
      locked: w.locked === true,
      sections: resolveSections(w.sections),
      slots,
      force: w.force === true,
    };
  });

  try {
    await saveProgram(g.project.id, weeks);
    const program = await getCanonicalProgram(g.project.id);
    return NextResponse.json({ program });
  } catch (err) {
    // Editing a started week's questions/type would orphan answers: 409 + needsConfirm so
    // the client can re-send those weeks with { force: true }.
    if (err instanceof StartedWeekEditError)
      return NextResponse.json(
        {
          error: `These weeks already have answers, so changing their questions or type may discard some: ${err.weeks.join(", ")}. Save anyway?`,
          needsConfirm: true,
          weeks: err.weeks,
        },
        { status: 409 }
      );
    const msg = err instanceof Error ? err.message : "";
    if (msg === "SCENARIO_NOT_FOUND")
      return NextResponse.json(
        { error: "A group's scenario could not be found while provisioning a board." },
        { status: 404 }
      );
    console.error("[PUT program]", err);
    return NextResponse.json({ error: "Failed to save program." }, { status: 500 });
  }
}
