import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase-auth";
import { listAllTeams } from "@/lib/teams";
import { getDeck } from "@/lib/cards";
import { supabaseConfigured } from "@/lib/supabase";
import { teamsToKernelEntries } from "@/lib/analysis/from-teams";
import { cleanEntries } from "@/lib/analysis/clean";
import { getKernelVectors, embeddingsConfigured } from "@/lib/analysis/embeddings";
import { clusterVectors } from "@/lib/analysis/cluster";
import { labelCluster } from "@/lib/analysis/theme-label";
import { mapPool } from "@/lib/analysis/suggest";
import type { KernelEntry } from "@/lib/analysis/types";
import type { ClusterResponse, ThemeMember } from "@/lib/analysis/theme-types";

export const dynamic = "force-dynamic";
// Embedding + a handful of GPT label calls can outrun the default budget.
export const maxDuration = 60;

// Facilitator-only: group the submitted kernels into semantic "themes". Embeds
// each kernel (cached), clusters the vectors, then names each multi-kernel
// cluster with the LLM. Optionally scoped to ?codes / body.codes; tune the
// grouping tightness with body.minSimilarity.
export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to cluster." }, { status: 401 });
  if (!embeddingsConfigured()) {
    return NextResponse.json(
      { error: "Clustering needs an embedding model (missing OPENAI_API_KEY)." },
      { status: 503 }
    );
  }

  let body: { minSimilarity?: unknown; codes?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — use defaults
  }
  const minSimilarity =
    typeof body.minSimilarity === "number" && body.minSimilarity >= -1 && body.minSimilarity <= 1
      ? body.minSimilarity
      : undefined;
  const wanted = Array.isArray(body.codes)
    ? new Set(body.codes.filter((c): c is string => typeof c === "string").map((c) => c.toUpperCase()))
    : null;

  const [teams, { deck }] = await Promise.all([
    listAllTeams({ onlySubmitted: true }),
    getDeck(),
  ]);
  const scoped = wanted && wanted.size ? teams.filter((t) => wanted.has(t.code.toUpperCase())) : teams;
  const entries = teamsToKernelEntries(scoped, deck);
  const { kept } = cleanEntries(entries);
  const byId = new Map<string, KernelEntry>(kept.filter((e) => e.id).map((e) => [e.id as string, e]));

  const vectors = await getKernelVectors(kept);
  const clusters = clusterVectors(vectors, minSimilarity != null ? { minSimilarity } : {});

  const toMember = (id: string): ThemeMember | null => {
    const e = byId.get(id);
    if (!e) return null;
    return {
      id,
      worldTitle: e.worldTitle || "",
      code: e.code,
      name: e.name,
      family: e.family ?? null,
      tone: e.tone ?? null,
    };
  };

  const multi = clusters.filter((c) => c.size >= 2);
  const singles = clusters.filter((c) => c.size < 2);

  // Label multi-member clusters concurrently (bounded), best-effort.
  const labeled = await mapPool(multi, 3, async (c) => {
    const memberEntries = c.ids.map((id) => byId.get(id)).filter((e): e is KernelEntry => Boolean(e));
    const label = await labelCluster(memberEntries);
    return {
      label: label?.label ?? null,
      summary: label?.summary ?? null,
      size: c.size,
      cohesion: c.cohesion,
      members: c.ids.map(toMember).filter((m): m is ThemeMember => Boolean(m)),
    };
  });

  const singletons = singles
    .flatMap((c) => c.ids)
    .map(toMember)
    .filter((m): m is ThemeMember => Boolean(m));

  const payload: ClusterResponse = {
    clusters: labeled,
    singletons,
    embedded: vectors.length,
    minSimilarity: minSimilarity ?? 0.55,
  };
  return NextResponse.json(payload);
}
