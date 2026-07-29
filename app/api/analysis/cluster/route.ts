import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase-auth";
import { listAllTeams } from "@/lib/teams";
import { getDeck } from "@/lib/cards";
import { getDrivers } from "@/lib/drivers";
import { supabaseConfigured } from "@/lib/supabase";
import { teamsToKernelEntries } from "@/lib/analysis/from-teams";
import { cleanEntries } from "@/lib/analysis/clean";
import { getKernelVectors, embeddingsConfigured } from "@/lib/analysis/embeddings";
import { clusterVectors, type Cluster } from "@/lib/analysis/cluster";
import { labelCluster } from "@/lib/analysis/theme-label";
import { mapPool } from "@/lib/analysis/suggest";
import { NARRATIVE_FIELDS, type KernelEntry } from "@/lib/analysis/types";
import { teamTriadIds, type Card } from "@/lib/workshop-types";
import type {
  ClusterResponse,
  ThemeCard,
  ThemeCluster,
  ThemeMember,
  ThemeTally,
} from "@/lib/analysis/theme-types";

export const dynamic = "force-dynamic";
// Embedding + a handful of GPT label calls can outrun the default budget.
export const maxDuration = 60;

const EMBED_MODEL = "text-embedding-3-small";

// Facilitator-only: group the submitted kernels into semantic "themes". Embeds
// each kernel (cached), clusters the vectors, names each multi-kernel cluster
// with the LLM, and returns full member + lineage detail (cards → uncertainties
// → drivers) so the view can expand it and the JSON export is self-contained.
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

  const [teams, { deck }, drivers] = await Promise.all([
    listAllTeams({ onlySubmitted: true }),
    getDeck(),
    getDrivers(),
  ]);
  const scoped = wanted && wanted.size ? teams.filter((t) => wanted.has(t.code.toUpperCase())) : teams;
  const entries = teamsToKernelEntries(scoped, deck);
  const { kept } = cleanEntries(entries);
  const byId = new Map<string, KernelEntry>(kept.filter((e) => e.id).map((e) => [e.id as string, e]));

  // Lineage lookups: full card by id, driver name by slug, and each team's triad
  // of full cards (which carry uncertainty + source-driver ids).
  const cardById = new Map<string, Card>(deck.cards.map((c) => [c.id, c]));
  const driverName = new Map<string, string>(drivers.map((d) => [d.slug, d.name]));
  const cardsByTeam = new Map<string, Card[]>(
    scoped.map((t) => [
      t.id,
      teamTriadIds(t)
        .map((id) => cardById.get(id))
        .filter((c): c is Card => Boolean(c)),
    ])
  );

  const toThemeCards = (id: string): ThemeCard[] =>
    (cardsByTeam.get(id) ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      role: c.role,
      dimension: c.dimension,
      uncertaintyId: c.uncertaintyId,
      domain: c.domain,
      condition: c.condition,
      sourceDriverIds: c.sourceDriverIds,
    }));

  const toMember = (id: string): ThemeMember | null => {
    const e = byId.get(id);
    if (!e) return null;
    const narrative = Object.fromEntries(
      NARRATIVE_FIELDS.map((f) => [f, (e[f] ?? "").trim()])
    ) as ThemeMember["narrative"];
    return {
      id,
      code: e.code,
      name: e.name,
      worldTitle: e.worldTitle || "",
      worldDescription: e.worldDescription || "",
      tone: e.tone ?? null,
      family: e.family ?? null,
      narrative,
      primaryCondition: e.primaryCondition || "",
      cards: toThemeCards(id),
    };
  };

  // Distinct-member tallies: how many worlds in the cluster share each key.
  const tally = (
    members: ThemeMember[],
    keysOf: (m: ThemeMember) => { key: string; label: string }[]
  ): ThemeTally[] => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const m of members) {
      const seen = new Set<string>();
      for (const { key, label } of keysOf(m)) {
        if (seen.has(key)) continue; // count each member once per key
        seen.add(key);
        const cur = counts.get(key);
        if (cur) cur.count++;
        else counts.set(key, { label, count: 1 });
      }
    }
    return [...counts.entries()]
      .map(([key, v]) => ({ key, label: v.label, count: v.count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };

  const aggregate = (cluster: Cluster, label: string | null, summary: string | null): ThemeCluster => {
    const members = cluster.ids.map(toMember).filter((m): m is ThemeMember => Boolean(m));
    const toneCounts = { hopeful: 0, dark: 0, untagged: 0 };
    for (const m of members) {
      if (m.tone === "hopeful") toneCounts.hopeful++;
      else if (m.tone === "dark") toneCounts.dark++;
      else toneCounts.untagged++;
    }
    return {
      label,
      summary,
      size: cluster.size,
      cohesion: cluster.cohesion,
      members,
      dimensions: tally(members, (m) =>
        m.cards.map((c) => ({ key: c.uncertaintyId, label: c.dimension }))
      ),
      drivers: tally(members, (m) =>
        m.cards.flatMap((c) =>
          c.sourceDriverIds.map((slug) => ({ key: slug, label: driverName.get(slug) ?? slug }))
        )
      ),
      cards: tally(members, (m) => m.cards.map((c) => ({ key: c.id, label: c.title }))),
      toneCounts,
      families: tally(members, (m) =>
        (m.family ?? "").trim() ? [{ key: m.family as string, label: m.family as string }] : []
      ),
    };
  };

  const minSim = minSimilarity ?? 0.1;
  const vectors = await getKernelVectors(kept);
  const clusters = clusterVectors(vectors, { center: true, minSimilarity: minSim });
  const multi = clusters.filter((c) => c.size >= 2);
  const singles = clusters.filter((c) => c.size < 2);

  // Label multi-member clusters concurrently (bounded), best-effort.
  const labeled = await mapPool(multi, 3, async (c) => {
    const memberEntries = c.ids.map((id) => byId.get(id)).filter((e): e is KernelEntry => Boolean(e));
    const label = await labelCluster(memberEntries);
    return aggregate(c, label?.label ?? null, label?.summary ?? null);
  });

  const singletons = singles
    .flatMap((c) => c.ids)
    .map(toMember)
    .filter((m): m is ThemeMember => Boolean(m));

  const scope =
    wanted && wanted.size
      ? `Sessions ${[...wanted].join(", ")} — ${vectors.length} kernels clustered.`
      : `All submitted kernels — ${vectors.length} clustered.`;

  const payload: ClusterResponse = {
    clusters: labeled,
    singletons,
    embedded: vectors.length,
    minSimilarity: minSim,
    model: EMBED_MODEL,
    generatedAt: new Date().toISOString(),
    scope,
  };
  return NextResponse.json(payload);
}
