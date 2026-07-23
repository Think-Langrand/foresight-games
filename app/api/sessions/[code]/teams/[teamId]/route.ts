import { NextResponse } from "next/server";
import { getSessionByCode, supabaseConfigured } from "@/lib/workshop";
import { getTeams, updateTeam, drawWildcard } from "@/lib/teams";
import { getDeck } from "@/lib/cards";
import { KEEP_COUNT, type TeamStatus } from "@/lib/workshop-types";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ code: string; teamId: string }> }
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const { code, teamId } = await params;
  let body: {
    name?: string;
    seedCardId?: string;
    keptIds?: string[];
    convergence?: string;
    worldTitle?: string;
    worldDescription?: string;
    primaryCondition?: string;
    definingCharacteristics?: string;
    centralTension?: string;
    newNormal?: string;
    brokenAssumption?: string;
    status?: TeamStatus;
    drawWildcard?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const session = await getSessionByCode(code);
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    if (session.status === "Closed")
      return NextResponse.json({ error: "Session is closed." }, { status: 403 });

    const team = (await getTeams(session.code, { force: true })).find((t) => t.id === teamId);
    if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });

    const patch: Parameters<typeof updateTeam>[2] = {};
    const { deck } = await getDeck();
    const cardById = new Map(deck.cards.map((c) => [c.id, c]));

    if (body.name !== undefined) patch.name = body.name.trim().slice(0, 60);

    // Slot 1: must be an outcome of the team's locked uncertainty (or cleared).
    if (body.seedCardId !== undefined) {
      if (body.seedCardId === "") {
        patch.seedCardId = "";
      } else {
        const c = cardById.get(body.seedCardId);
        if (!c || c.uncertaintyId !== team.seedUncertaintyId)
          return NextResponse.json(
            { error: "That outcome isn't part of your locked uncertainty." },
            { status: 400 }
          );
        patch.seedCardId = body.seedCardId;
      }
    }

    // Slots 2 & 3: real outcomes, from distinct uncertainties, none of them the
    // locked slot-1 uncertainty.
    if (body.keptIds !== undefined) {
      const kept = [...new Set(body.keptIds)].filter((id) => cardById.has(id));
      if (kept.length > KEEP_COUNT)
        return NextResponse.json(
          { error: `Pick at most ${KEEP_COUNT} more.` },
          { status: 400 }
        );
      const uncs = kept.map((id) => cardById.get(id)!.uncertaintyId);
      if (new Set(uncs).size !== uncs.length)
        return NextResponse.json(
          { error: "Pick outcomes from different uncertainties." },
          { status: 400 }
        );
      if (uncs.includes(team.seedUncertaintyId))
        return NextResponse.json(
          { error: "That uncertainty is already your first slot." },
          { status: 400 }
        );
      patch.keptIds = kept;
    }

    if (body.convergence !== undefined) patch.convergence = body.convergence.slice(0, 2000);
    if (body.worldTitle !== undefined) patch.worldTitle = body.worldTitle.slice(0, 120);
    if (body.worldDescription !== undefined)
      patch.worldDescription = body.worldDescription.slice(0, 4000);
    if (body.primaryCondition !== undefined)
      patch.primaryCondition = body.primaryCondition.slice(0, 1000);
    if (body.definingCharacteristics !== undefined)
      patch.definingCharacteristics = body.definingCharacteristics.slice(0, 1000);
    if (body.centralTension !== undefined)
      patch.centralTension = body.centralTension.slice(0, 1000);
    if (body.newNormal !== undefined) patch.newNormal = body.newNormal.slice(0, 1000);
    if (body.brokenAssumption !== undefined)
      patch.brokenAssumption = body.brokenAssumption.slice(0, 1000);
    if (body.status !== undefined) patch.status = body.status;

    if (body.drawWildcard && !team.wildcardId) {
      const wild = drawWildcard(deck);
      if (wild) patch.wildcardId = wild.id;
    }

    if (Object.keys(patch).length === 0)
      return NextResponse.json({ team });

    const updated = await updateTeam(teamId, session.code, patch);
    return NextResponse.json({ team: updated });
  } catch (err) {
    console.error("[PATCH team]", err);
    return NextResponse.json({ error: "Failed to update team." }, { status: 500 });
  }
}
