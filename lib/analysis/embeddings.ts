import "server-only";

import { createHash } from "node:crypto";
import OpenAI from "openai";
import { supabaseAdmin, withRetry } from "@/lib/supabase";
import { NARRATIVE_FIELDS, type KernelEntry } from "./types";

// Server-side embedding cache for theme clustering (lib/analysis/cluster.ts).
//
// One vector per kernel, cached in public.kernel_embeddings and keyed by a hash
// of the exact text we embed. Re-embed only kernels whose text changed (or that
// were never embedded); reuse everything else. Best-effort: a model failure on
// one kernel drops it from the result rather than throwing, so clustering still
// runs over whatever embedded successfully.

const MODEL = "text-embedding-3-small";
const TABLE = "kernel_embeddings";
// text-embedding-3-small returns 1536-D vectors; kept for the cache row + a
// cheap sanity check that a cached vector matches the current model.
const DIMS = 1536;

export interface KernelVector {
  id: string; // team id
  vector: number[];
}

export function embeddingsConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

// The text we embed for a kernel: title first, then every filled narrative
// field, labelled. Deterministic — same kernel always yields the same string,
// so the hash is stable and the cache stays warm until the content actually
// changes. Card titles are intentionally excluded: clustering should key on the
// team's own narrative, not on the popular outcome cards many teams share.
export function embeddingText(entry: KernelEntry): string {
  const parts: string[] = [];
  const title = (entry.worldTitle ?? "").trim();
  if (title) parts.push(`Title: ${title}`);
  for (const f of NARRATIVE_FIELDS) {
    const v = (entry[f] ?? "").trim();
    if (v) parts.push(`${f}: ${v}`);
  }
  return parts.join("\n");
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

interface CacheRow {
  team_id: string;
  text_hash: string;
  embedding: number[];
}

/**
 * Return a cached vector per kernel, embedding only the ones whose text is new
 * or has changed since last time. Kernels with empty text (nothing to embed)
 * and any that error out are simply omitted from the result.
 */
export async function getKernelVectors(entries: KernelEntry[]): Promise<KernelVector[]> {
  if (!embeddingsConfigured()) return [];

  // Build the target text + hash for every kernel that has any text at all.
  const targets = entries
    .filter((e) => e.id)
    .map((e) => {
      const text = embeddingText(e);
      return { id: e.id as string, text, hash: hashText(text) };
    })
    .filter((t) => t.text.length > 0);
  if (targets.length === 0) return [];

  const ids = targets.map((t) => t.id);

  // Read existing cache rows for these kernels. Non-fatal: if the cache table is
  // missing (migration not applied yet) or the read fails, we proceed with an
  // empty cache — every kernel is re-embedded this run, nothing else breaks.
  let cached: CacheRow[] = [];
  try {
    cached = await withRetry(async () => {
      const res = await supabaseAdmin()
        .from(TABLE)
        .select("team_id, text_hash, embedding")
        .in("team_id", ids);
      if (res.error) throw res.error;
      return (res.data ?? []) as CacheRow[];
    });
  } catch (err) {
    console.error("[embeddings] cache read failed (embedding all):", err);
  }

  const byId = new Map<string, CacheRow>(cached.map((r) => [r.team_id, r]));
  const vectors = new Map<string, number[]>();
  const stale: typeof targets = [];
  for (const t of targets) {
    const hit = byId.get(t.id);
    if (hit && hit.text_hash === t.hash && Array.isArray(hit.embedding)) {
      vectors.set(t.id, hit.embedding);
    } else {
      stale.push(t);
    }
  }

  // Embed the stale/missing kernels in one batched call, then upsert the cache.
  if (stale.length > 0) {
    const client = new OpenAI();
    try {
      const res = await client.embeddings.create({
        model: MODEL,
        input: stale.map((t) => t.text),
      });
      const now = new Date().toISOString();
      const rows = res.data.map((d, i) => {
        const vector = d.embedding as number[];
        vectors.set(stale[i].id, vector);
        return {
          team_id: stale[i].id,
          text_hash: stale[i].hash,
          model: MODEL,
          dims: vector.length || DIMS,
          embedding: vector,
          updated_at: now,
        };
      });
      // Cache write is best-effort — if it fails we still return the vectors we
      // just computed; they'll simply be recomputed next run.
      try {
        await withRetry(async () => {
          const up = await supabaseAdmin().from(TABLE).upsert(rows, { onConflict: "team_id" });
          if (up.error) throw up.error;
          return up;
        });
      } catch {
        // swallow — see note above.
      }
    } catch (err) {
      // Embedding call failed for the batch: fall back to whatever was cached.
      console.error("[embeddings] batch embed failed:", err);
    }
  }

  return targets
    .map((t) => ({ id: t.id, vector: vectors.get(t.id) }))
    .filter((v): v is KernelVector => Array.isArray(v.vector) && v.vector.length > 0);
}
