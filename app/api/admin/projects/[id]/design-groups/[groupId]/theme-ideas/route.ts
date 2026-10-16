import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getProjectById } from "@/lib/projects";
import { getDesignGroup } from "@/lib/design-groups";
import { listExercises } from "@/lib/design-group-exercises";
import { getExerciseType } from "@/lib/exercise-types";
import { getSessionByCode, updateSession } from "@/lib/workshop";
import { isClusterMethod } from "@/lib/analysis/implication-cluster-shape";
import {
  THEME_IDEA_LIMITS,
  appendThemeIdeas,
  coerceThemeIdeas,
  removeThemeIdea,
  type ThemeIdea,
} from "@/lib/theme-ideas-shape";

export const dynamic = "force-dynamic";

// Admin-only: the theme NAMES a facilitator has kept from a clustering run, saved to the
// group's Week 3 board for the group to read. Stored on the board's session config, where
// realtime carries them to every member — the same mechanism as config.summary.
//
// POST   { exerciseId, themes: [{ label, method }] }   appends
// DELETE ?exerciseId=…&ideaId=…                        removes one
//
// No OPENAI_API_KEY guard and no maxDuration, unlike the cluster and summary siblings: there
// is no model call here. The clustering already happened; this is two DB round trips, and a
// missing key must not 503 a pure write.
//
// This route writes config.themeIdeas and nothing else. The sibling cluster route stays
// read-only, which is why the save lives here rather than being bolted onto it.

// Everything a POST may carry. `id` and `savedAt` are minted here, never taken from the
// client: an id supplied by the caller would let one facilitator's save collide with or
// overwrite another's entry.
interface IncomingTheme {
  label?: unknown;
  method?: unknown;
}

async function board(projectId: string, groupId: string, exerciseId: string) {
  const project = await getProjectById(projectId);
  if (!project) return { error: "Project not found.", status: 404 } as const;
  const group = await getDesignGroup(groupId);
  if (!group || group.projectId !== project.id)
    return { error: "Design group not found.", status: 404 } as const;

  const exercise = (await listExercises(groupId)).find((e) => e.id === exerciseId);
  if (!exercise || !exercise.sessionCode)
    return { error: "Exercise not found.", status: 404 } as const;
  // Mirrors the summary route: these names belong to a synthesis week's clustering step.
  if (getExerciseType(exercise.type)?.render !== "synthesis")
    return { error: "Only a synthesis week holds theme names.", status: 400 } as const;

  const session = await getSessionByCode(exercise.sessionCode);
  if (!session) return { error: "Board not found.", status: 404 } as const;
  return { session } as const;
}

// Read the config as it is NOW and merge over the STORED blob, never over a resolved copy:
// writing resolveConfig's output back would materialise its defaults into the row and break
// the absent-key contract the rest of the app reads through it.
//
// The window between this read and the write is two round trips. There is no optimistic
// concurrency — doing it honestly needs an RPC with jsonb_set or a version column, both
// migrations — so it is stated here rather than left to be rediscovered. What makes that
// acceptable is that both verbs are DELTAS computed on this side of the wire: the realistic
// race is "save from run A, then save from run B on a client that has not heard about A",
// which a put-the-whole-list API loses by construction, every time.
async function writeIdeas(
  code: string,
  mutate: (current: ThemeIdea[]) => { ideas: ThemeIdea[]; error?: string }
) {
  const fresh = await getSessionByCode(code);
  if (!fresh) return { error: "Board not found.", status: 404 } as const;
  const stored = (fresh.config ?? {}) as Record<string, unknown>;
  const result = mutate(coerceThemeIdeas(stored.themeIdeas));
  if (result.error) return { error: result.error, status: 400 } as const;
  await updateSession(fresh.id, fresh.code, { config: { ...stored, themeIdeas: result.ideas } });
  return { themeIdeas: result.ideas } as const;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id, groupId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    exerciseId?: unknown;
    themes?: unknown;
  };
  const exerciseId = typeof body.exerciseId === "string" ? body.exerciseId : "";
  if (!exerciseId)
    return NextResponse.json({ error: "exerciseId is required." }, { status: 400 });

  const rows = Array.isArray(body.themes) ? (body.themes as IncomingTheme[]) : [];
  const now = new Date().toISOString();
  const incoming: ThemeIdea[] = [];
  for (const row of rows) {
    const name = typeof row?.label === "string" ? row.label.replace(/\s+/g, " ").trim() : "";
    if (!name || !isClusterMethod(row?.method)) continue;
    incoming.push({
      id: randomUUID(),
      name: name.slice(0, THEME_IDEA_LIMITS.name),
      method: row.method,
      savedAt: now,
    });
  }
  if (incoming.length === 0)
    return NextResponse.json({ error: "No theme names to save." }, { status: 400 });

  try {
    const target = await board(id, groupId, exerciseId);
    if ("error" in target)
      return NextResponse.json({ error: target.error }, { status: target.status });

    let added = 0;
    let duplicates = 0;
    const written = await writeIdeas(target.session.code, (current) => {
      const merged = appendThemeIdeas(current, incoming);
      // Reported rather than silently truncated: a facilitator who ticked fifteen names
      // should be told the limit, not left to count what landed.
      if (merged.overflow > 0) {
        return {
          ideas: current,
          error:
            `That would save more than ${THEME_IDEA_LIMITS.count} names. ` +
            `Remove some first — the group has ${current.length}.`,
        };
      }
      added = merged.added;
      duplicates = merged.duplicates;
      return { ideas: merged.ideas };
    });
    if ("error" in written)
      return NextResponse.json({ error: written.error }, { status: written.status });

    return NextResponse.json({ themeIdeas: written.themeIdeas, added, duplicates });
  } catch (err) {
    console.error("[POST theme-ideas]", err);
    return NextResponse.json({ error: "Failed to save the theme names." }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id, groupId } = await params;
  const url = new URL(req.url);
  const exerciseId = url.searchParams.get("exerciseId") ?? "";
  const ideaId = url.searchParams.get("ideaId") ?? "";
  if (!exerciseId || !ideaId)
    return NextResponse.json({ error: "exerciseId and ideaId are required." }, { status: 400 });

  try {
    const target = await board(id, groupId, exerciseId);
    if ("error" in target)
      return NextResponse.json({ error: target.error }, { status: target.status });

    // A missing id is a 200, not a 404: a retry after a timeout must not surface an error for
    // work that already landed.
    const written = await writeIdeas(target.session.code, (current) => ({
      ideas: removeThemeIdea(current, ideaId),
    }));
    if ("error" in written)
      return NextResponse.json({ error: written.error }, { status: written.status });

    return NextResponse.json({ themeIdeas: written.themeIdeas });
  } catch (err) {
    console.error("[DELETE theme-ideas]", err);
    return NextResponse.json({ error: "Failed to remove the theme name." }, { status: 500 });
  }
}
