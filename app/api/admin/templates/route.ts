import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { listTemplates, createTemplate, ensureDefaultTemplates } from "@/lib/exercise-templates";
import { type WorksheetSection } from "@/lib/exercise-types";

export const dynamic = "force-dynamic";

// Admin-only: list the template library (seeding the built-ins on first read).
export async function GET() {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  await ensureDefaultTemplates();
  return NextResponse.json({ templates: await listTemplates() });
}

// Admin-only: create a template.
export async function POST(req: Request) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

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
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  try {
    const template = await createTemplate({
      name,
      description: body.description,
      type: body.type ?? "worksheet",
      sections: body.sections,
      sort: typeof body.sort === "number" ? body.sort : undefined,
    });
    return NextResponse.json({ template });
  } catch (err) {
    console.error("[POST template]", err);
    return NextResponse.json({ error: "Failed to create template." }, { status: 500 });
  }
}
