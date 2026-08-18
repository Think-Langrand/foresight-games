import "server-only";

import { supabaseAdmin, supabaseConfigured, withRetry } from "@/lib/supabase";
import { cached, bust } from "@/lib/cache";
import { normalizeHomeConfig, type HomeConfig } from "@/lib/project-home";

// The tenant registry. Reads the Supabase `projects` table (service_role, so it
// bypasses RLS — never import into a client component). `getProjectBySlug` is
// cached per slug (short TTL) like lib/drivers.ts; every write busts that key so
// passphrase / enabled / config edits show up immediately.

export interface Project {
  id: string;
  slug: string;
  name: string;
  carmelitaProjectRef: string;
  passphraseHash: string | null;
  homeConfig: HomeConfig;
  enabled: boolean;
}

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  carmelita_project_ref: string;
  passphrase_hash: string | null;
  home_config: unknown;
  enabled: boolean;
}

function fromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    carmelitaProjectRef: row.carmelita_project_ref,
    passphraseHash: row.passphrase_hash,
    homeConfig: normalizeHomeConfig(row.home_config),
    enabled: row.enabled,
  };
}

const COLS =
  "id, slug, name, carmelita_project_ref, passphrase_hash, home_config, enabled";

function cacheKey(slug: string): string {
  return `project:${slug}`;
}

function idCacheKey(id: string): string {
  return `project:id:${id}`;
}

/** Resolve an ENABLED project by its route slug, or null. Cached ~60s. */
export async function getProjectBySlug(slug: string): Promise<Project | null> {
  if (!supabaseConfigured()) return null;
  return cached(cacheKey(slug), 60_000, async () => {
    const row = await withRetry(async () => {
      const { data, error } = await supabaseAdmin()
        .from("projects")
        .select(COLS)
        .eq("slug", slug)
        .eq("enabled", true)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ProjectRow | null;
    });
    return row ? fromRow(row) : null;
  });
}

/**
 * Resolve a project by id, INCLUDING disabled ones. Used to resolve a session's
 * deck from its project_id — a game must still render even if the project was
 * later disabled. (getProjectBySlug stays enabled-only, for routing/gating.)
 */
export async function getProjectById(id: string): Promise<Project | null> {
  if (!supabaseConfigured()) return null;
  return cached(idCacheKey(id), 60_000, async () => {
    const row = await withRetry(async () => {
      const { data, error } = await supabaseAdmin()
        .from("projects")
        .select(COLS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ProjectRow | null;
    });
    return row ? fromRow(row) : null;
  });
}

/**
 * Resolve a project by slug INCLUDING disabled ones — for the admin dashboard
 * (an admin still manages a project they've disabled). Distinct cache key from the
 * enabled-only getProjectBySlug (which gates the public/player routes).
 */
export async function getProjectBySlugAny(slug: string): Promise<Project | null> {
  if (!supabaseConfigured()) return null;
  return cached(`project:any:${slug}`, 60_000, async () => {
    const row = await withRetry(async () => {
      const { data, error } = await supabaseAdmin()
        .from("projects")
        .select(COLS)
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ProjectRow | null;
    });
    return row ? fromRow(row) : null;
  });
}

/** All projects (enabled and disabled), newest first — for the admin list. Uncached. */
export async function listProjects(): Promise<Project[]> {
  if (!supabaseConfigured()) return [];
  const rows = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("projects")
      .select(COLS)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ProjectRow[];
  });
  return rows.map(fromRow);
}

export interface CreateProjectInput {
  slug: string;
  name: string;
  carmelitaProjectRef: string;
  passphraseHash: string | null;
  homeConfig: HomeConfig;
  enabled: boolean;
}

export async function createProject(input: CreateProjectInput): Promise<void> {
  await withRetry(async () => {
    const { error } = await supabaseAdmin().from("projects").insert({
      slug: input.slug,
      name: input.name,
      carmelita_project_ref: input.carmelitaProjectRef,
      passphrase_hash: input.passphraseHash,
      home_config: input.homeConfig,
      enabled: input.enabled,
    });
    if (error) throw error;
  });
  bust(cacheKey(input.slug));
}

export interface UpdateProjectPatch {
  name: string;
  carmelitaProjectRef: string;
  homeConfig: HomeConfig;
  enabled: boolean;
  // undefined = leave the current hash unchanged; null = clear the gate; string = set.
  passphraseHash?: string | null;
}

// The slug is the route identity, so it is immutable on edit — only the other
// fields change. Returns the affected slug so the caller need not re-fetch.
export async function updateProject(id: string, patch: UpdateProjectPatch): Promise<void> {
  const update: Record<string, unknown> = {
    name: patch.name,
    carmelita_project_ref: patch.carmelitaProjectRef,
    home_config: patch.homeConfig,
    enabled: patch.enabled,
    updated_at: new Date().toISOString(),
  };
  if (patch.passphraseHash !== undefined) update.passphrase_hash = patch.passphraseHash;

  const slug = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("projects")
      .update(update)
      .eq("id", id)
      .select("slug")
      .maybeSingle();
    if (error) throw error;
    return (data as { slug: string } | null)?.slug ?? null;
  });
  if (slug) bust(cacheKey(slug));
  bust(idCacheKey(id));
}

export async function deleteProject(id: string): Promise<void> {
  const slug = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("projects")
      .delete()
      .eq("id", id)
      .select("slug")
      .maybeSingle();
    if (error) throw error;
    return (data as { slug: string } | null)?.slug ?? null;
  });
  if (slug) bust(cacheKey(slug));
  bust(idCacheKey(id));
}
