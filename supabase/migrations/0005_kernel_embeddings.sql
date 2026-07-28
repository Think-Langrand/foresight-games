-- 0005 — Embedding cache for the Analysis view's theme clustering (Tier 2).
--
-- Clustering groups submitted kernels by semantic similarity. The vectors come
-- from an embedding model and are expensive to recompute, so we cache one per
-- team keyed by a hash of the exact text we embedded. When a kernel's narrative
-- is edited its hash changes and the row is re-embedded on the next run; when it
-- is unchanged we reuse the cached vector and make zero model calls.
--
-- The embedding is stored as jsonb (a plain float array) rather than a pgvector
-- column: clustering runs in-process over the workshop's few-hundred kernels, so
-- we never need ANN search, and jsonb keeps this migration extension-free.
--
-- Written idempotently: a no-op on projects that already have the table.

create table if not exists public.kernel_embeddings (
  team_id    uuid primary key references public.teams(id) on delete cascade,
  text_hash  text not null,
  model      text not null,
  dims       integer not null,
  embedding  jsonb not null,
  updated_at timestamptz not null default now()
);
