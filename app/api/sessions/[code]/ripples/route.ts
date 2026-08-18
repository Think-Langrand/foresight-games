import { NextResponse } from "next/server";
import { getSessionByCode, supabaseConfigured } from "@/lib/workshop";
import { getRipplesView } from "@/lib/ripples";

export const dynamic = "force-dynamic";

// The aggregated live board for a Ripples session (initial load for the team +
// present views; live updates arrive via Supabase realtime, not polling).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code } = await params;
  try {
    const session = await getSessionByCode(code);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    if (session.scope !== "Ripples") {
      return NextResponse.json({ error: "Not a Ripples session." }, { status: 400 });
    }
    const view = await getRipplesView(session);
    return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[GET ripples]", err);
    return NextResponse.json({ error: "Failed to load board." }, { status: 500 });
  }
}
