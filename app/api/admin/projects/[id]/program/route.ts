import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import {
  getCanonicalProgram,
  saveProgram,
  StartedWeekEditError,
  ProgramConflictError,
  type ProgramWeekInput,
} from "@/lib/design-program";
import { resolveEffectiveSections } from "@/lib/exercise-types";

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

  let body: { weeks?: unknown; version?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const expectedVersion = typeof body.version === "string" ? body.version : undefined;
  if (!Array.isArray(body.weeks))
    return NextResponse.json({ error: "weeks[] is required." }, { status: 400 });
  if (body.weeks.length === 0)
    return NextResponse.json(
      { error: "A program needs at least one week. Delete the group instead to clear it." },
      { status: 400 }
    );

  const weeks: ProgramWeekInput[] = body.weeks.map((raw) => {
    const w = (raw ?? {}) as Record<string, unknown>;
    // Keep only string slot values — a non-string id would make the reconcile treat an
    // existing row as missing and create/delete weeks unexpectedly.
    const slots: Record<string, string> = {};
    if (w.slots && typeof w.slots === "object" && !Array.isArray(w.slots)) {
      for (const [gid, id] of Object.entries(w.slots as Record<string, unknown>)) {
        if (typeof id === "string") slots[gid] = id;
      }
    }
    const type = typeof w.type === "string" ? w.type : "placeholder";
    return {
      title: typeof w.title === "string" ? w.title : "",
      type,
      opensAt: typeof w.opensAt === "string" && w.opensAt ? w.opensAt : null,
      locked: w.locked === true,
      closed: w.closed === true,
      // Persist the EFFECTIVE keyset so a client sending sections=[] doesn't leave the week
      // depending on the implicit template fallback.
      sections: resolveEffectiveSections(type, w.sections),
      slots,
      force: w.force === true,
    };
  });

  try {
    await saveProgram(g.project.id, weeks, { expectedVersion });
    const program = await getCanonicalProgram(g.project.id);
    return NextResponse.json({ program });
  } catch (err) {
    // Someone else changed the program since this client loaded it: 409 + conflict so the
    // client reloads the latest instead of clobbering the other admin's edit.
    if (err instanceof ProgramConflictError)
      return NextResponse.json(
        {
          error: "This program was changed by someone else. Reload the latest and reapply your change.",
          conflict: true,
        },
        { status: 409 }
      );
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
