import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { createProject, listProjects } from "@/lib/projects";
import { parseProject } from "@/lib/admin-projects-validate";
import { hashPassphrase } from "@/lib/project-gate";

export const dynamic = "force-dynamic";

// Admin-only: list all projects (enabled + disabled).
export async function GET() {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const projects = await listProjects();
  // Never leak the hash to the client.
  return NextResponse.json({
    projects: projects.map(({ passphraseHash, ...p }) => ({
      ...p,
      hasPassphrase: Boolean(passphraseHash),
    })),
  });
}

// Admin-only: create a project.
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

  const parsed = parseProject(body, { withSlug: true });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    await createProject({
      slug: parsed.input.slug,
      name: parsed.input.name,
      carmelitaProjectRef: parsed.input.carmelitaProjectRef,
      passphraseHash: parsed.input.passphrase
        ? hashPassphrase(parsed.input.passphrase)
        : null,
      homeConfig: parsed.input.homeConfig,
      enabled: parsed.input.enabled,
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg =
      (err as { code?: string })?.code === "23505"
        ? "A project with that slug already exists."
        : "Failed to create project.";
    console.error("[POST project]", err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
