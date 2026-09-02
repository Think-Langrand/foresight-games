import "server-only";

import { supabaseAdmin, supabaseConfigured, withRetry } from "@/lib/supabase";
import { resolveSections, type WorksheetSection } from "@/lib/exercise-types";
import {
  fromRow,
  defaultTemplateSeeds,
  type ExerciseTemplate,
  type TemplateRow,
} from "@/lib/exercise-templates-defaults";

// Server-only data layer for the EXERCISE TEMPLATE library — a global, admin-authored set
// of reusable exercises ({ type, sections }) that stamp into any design group. Mirrors
// lib/design-group-exercises.ts: snake_case row + mapper, all reads/writes on
// supabaseAdmin() wrapped in withRetry, sections coerced through resolveSections.

export type { ExerciseTemplate } from "@/lib/exercise-templates-defaults";
export { defaultTemplateSeeds } from "@/lib/exercise-templates-defaults";

const COLS = "id, slug, name, description, type, sections, sort, created_at";

// ---------- reads ----------
export async function listTemplates(): Promise<ExerciseTemplate[]> {
  if (!supabaseConfigured()) return [];
  const rows = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("exercise_templates")
      .select(COLS)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as TemplateRow[];
  });
  return rows.map(fromRow);
}

export async function getTemplate(id: string): Promise<ExerciseTemplate | null> {
  if (!supabaseConfigured()) return null;
  const row = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("exercise_templates")
      .select(COLS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as TemplateRow | null;
  });
  return row ? fromRow(row) : null;
}

// ---------- writes ----------
export async function createTemplate(input: {
  name: string;
  description?: string;
  type?: string;
  sections?: WorksheetSection[];
  sort?: number;
  slug?: string | null;
}): Promise<ExerciseTemplate> {
  const row = await withRetry(async () => {
    const { data, error } = await supabaseAdmin()
      .from("exercise_templates")
      .insert({
        slug: input.slug ?? null,
        name: input.name.trim() || "Untitled template",
        description: (input.description ?? "").trim(),
        type: input.type ?? "worksheet",
        sections: resolveSections(input.sections),
        sort: input.sort ?? 0,
      })
      .select(COLS)
      .single();
    if (error) throw error;
    return data as TemplateRow;
  });
  return fromRow(row);
}

export interface UpdateTemplatePatch {
  name?: string;
  description?: string;
  type?: string;
  sections?: WorksheetSection[];
  sort?: number;
}

export async function updateTemplate(id: string, patch: UpdateTemplatePatch): Promise<void> {
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) fields.name = patch.name.trim() || "Untitled template";
  if (patch.description !== undefined) fields.description = patch.description.trim();
  if (patch.type !== undefined) fields.type = patch.type;
  if (patch.sections !== undefined) fields.sections = resolveSections(patch.sections);
  if (patch.sort !== undefined) fields.sort = patch.sort;
  await withRetry(async () => {
    const { error } = await supabaseAdmin().from("exercise_templates").update(fields).eq("id", id);
    if (error) throw error;
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  await withRetry(async () => {
    const { error } = await supabaseAdmin().from("exercise_templates").delete().eq("id", id);
    if (error) throw error;
  });
}

// Idempotent seed of the built-in library, keyed by slug. Inserts only the seeds whose slug
// isn't already present, so an admin's edits to a seeded template are never overwritten.
export async function ensureDefaultTemplates(): Promise<void> {
  if (!supabaseConfigured()) return;
  const existing = await withRetry(async () => {
    const { data, error } = await supabaseAdmin().from("exercise_templates").select("slug");
    if (error) throw error;
    return (data ?? []) as { slug: string | null }[];
  });
  const have = new Set(existing.map((r) => r.slug).filter(Boolean));
  const missing = defaultTemplateSeeds().filter((s) => !have.has(s.slug));
  if (missing.length === 0) return;
  await withRetry(async () => {
    const { error } = await supabaseAdmin()
      .from("exercise_templates")
      .insert(
        missing.map((s) => ({
          slug: s.slug,
          name: s.name,
          description: s.description,
          type: s.type,
          sections: resolveSections(s.sections),
          sort: s.sort,
        }))
      );
    if (error) throw error;
  });
}
