# Exercise Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A global, admin-authored library of reusable exercises (block sets) that an admin builds once and stamps into any design group — reaching parity with today's hardcoded defaults and letting Sessions 3 & 4 be built once and reused.

**Architecture:** A new `exercise_templates` table stores `{ name, description, type, sections }` using the exact `WorksheetSection[]` block shape design-group exercises already use. A server data layer + admin API mirror `lib/design-group-exercises.ts` and its routes. An `/admin/templates` page edits the library with the existing `ExerciseQuestionEditor`. The group weeks table lists templates in its "Add week from…" menu; picking one calls the existing snapshot-and-provision `addExercise` path. Applying is a **snapshot copy**, never a live link.

**Tech Stack:** Next.js 16 (App Router, `16.2.10`), React 19, TypeScript, Supabase (`supabaseAdmin()` service-role), Vitest 3, Tailwind v4.

**Spec:** [docs/superpowers/specs/2026-09-02-exercise-templates-design.md](../specs/2026-09-02-exercise-templates-design.md)

## Global Constraints

- **Next.js 16 App Router:** route `params` are `Promise`s and must be `await`ed (e.g. `const { id } = await params;`). All admin routes set `export const dynamic = "force-dynamic";`.
- **Admin gate:** `/admin/*` pages are auto-gated by `proxy.ts`; every `/api/admin/*` handler *additionally* rejects with 401 when `!(await getSessionUser())` and 503 when `!supabaseConfigured()`. No new permission tier.
- **Migrations apply to BOTH Supabase DBs:** dev `xpcmeskbqdapzmqcfnas` and prod `ratkqnumupciffxnsbhk`.
- **Snapshot, not link:** applying a template copies its `sections` onto the new exercise; template edits never mutate an already-applied week.
- **Coerce all section data through `resolveSections()`** on every DB read/write so hand-edited or drifted jsonb never crashes a worksheet.
- **Reuse, don't rebuild:** block authoring reuses `components/admin/ExerciseQuestionEditor.tsx`; the apply path reuses `AdminDesignGroups`' existing `addExercise` POST.
- **`server-only` taint:** any module importing `server-only` (or `@/lib/supabase`) cannot be imported in a vitest test. Pure, testable helpers live in a client-safe module with no server imports.
- **Global library:** `exercise_templates` has no `project_id` — one library serves every group in every project.

---

### Task 1: Migration — `exercise_templates` table

**Files:**
- Create: `supabase/migrations/0014_exercise_templates.sql`

**Interfaces:**
- Produces: table `public.exercise_templates` with columns `id uuid, slug text unique, name text, description text, type text, sections jsonb, sort int, created_at timestamptz, updated_at timestamptz`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0014_exercise_templates.sql`:

```sql
-- 0014 — Exercise templates: a global, admin-authored library of reusable exercises.
--
-- Every design group runs the same PROGRAM of exercises (weeks) — only the scenario
-- differs. Until now a new exercise (a Q/A set, a brainstorm) had to be re-authored in
-- every group; the only reuse was copying from the code registry or a sibling week. This
-- table persists a named, editable exercise ({type, sections}) an admin builds once and
-- stamps into any group. Applying a template SNAPSHOTS its sections onto the new
-- design_group_exercises row (section keys are permanent answer-card buckets), so editing
-- a template never disturbs a group that already ran it.
--
-- Read/written server-side through lib/exercise-templates.ts (service_role bypasses RLS);
-- like design_group_exercises it gets NO public policy and is NOT in the realtime
-- publication.

create table if not exists public.exercise_templates (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique,                          -- stable id for seeded built-ins; null for user-created
  name        text not null,
  description text not null default '',
  type        text not null default 'worksheet',    -- exercise-type id (lib/exercise-types.ts)
  sections    jsonb not null default '[]'::jsonb,    -- WorksheetSection[]; same shape as design_group_exercises.sections
  sort        int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists exercise_templates_sort_idx
  on public.exercise_templates (sort, created_at);

-- RLS on, no policy: anon denied, service_role bypasses. Matches design_group_exercises.
alter table public.exercise_templates enable row level security;
```

- [ ] **Step 2: Apply the migration to the DEV database**

Apply the SQL to dev project `xpcmeskbqdapzmqcfnas` — via the Supabase MCP `apply_migration` tool (name `0014_exercise_templates`, the SQL above) or by pasting into that project's SQL editor.

- [ ] **Step 3: Verify the table exists on DEV**

Run (MCP `list_tables` on `xpcmeskbqdapzmqcfnas`, or SQL editor):

```sql
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'exercise_templates'
order by ordinal_position;
```

Expected: 9 rows — `id, slug, name, description, type, sections, sort, created_at, updated_at`.

- [ ] **Step 4: Apply the same migration to the PROD database**

Apply the identical SQL to prod project `ratkqnumupciffxnsbhk`. Re-run the Step 3 query against prod; expect the same 9 columns.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0014_exercise_templates.sql
git commit -m "feat(templates): add exercise_templates table (0014)"
```

---

### Task 2: Data layer + pure seed/mapper helpers

**Files:**
- Create: `lib/exercise-templates-defaults.ts` (client-safe: types, `fromRow`, `defaultTemplateSeeds`)
- Test: `lib/exercise-templates-defaults.test.ts`
- Create: `lib/exercise-templates.ts` (server-only: DB CRUD + `ensureDefaultTemplates`)

**Interfaces:**
- Consumes: `resolveSections`, `getExerciseType`, `WorksheetSection` from `@/lib/exercise-types`; `supabaseAdmin`, `supabaseConfigured`, `withRetry` from `@/lib/supabase`.
- Produces:
  - `interface ExerciseTemplate { id: string; slug: string | null; name: string; description: string; type: string; sections: WorksheetSection[]; sort: number; createdTime: string }`
  - `interface TemplateRow { id; slug; name; description; type; sections; sort; created_at }`
  - `fromRow(r: TemplateRow): ExerciseTemplate`
  - `interface TemplateSeed { slug; name; description; type; sections; sort }`
  - `defaultTemplateSeeds(): TemplateSeed[]`
  - `listTemplates(): Promise<ExerciseTemplate[]>`, `getTemplate(id): Promise<ExerciseTemplate | null>`
  - `createTemplate(input): Promise<ExerciseTemplate>` where `input = { name: string; description?: string; type?: string; sections?: WorksheetSection[]; sort?: number; slug?: string | null }`
  - `updateTemplate(id, patch: UpdateTemplatePatch): Promise<void>` where `UpdateTemplatePatch = { name?; description?; type?; sections?; sort? }`
  - `deleteTemplate(id): Promise<void>`
  - `ensureDefaultTemplates(): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `lib/exercise-templates-defaults.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fromRow, defaultTemplateSeeds } from "./exercise-templates-defaults";
import { getExerciseType } from "./exercise-types";

describe("exercise-templates-defaults", () => {
  it("fromRow maps snake_case row and coerces bad sections to []", () => {
    const t = fromRow({
      id: "abc",
      slug: null,
      name: "My Template",
      description: null,
      type: "worksheet",
      sections: "not-an-array", // bad jsonb → resolveSections returns []
      sort: 3,
      created_at: "2026-09-02T00:00:00Z",
    });
    expect(t.id).toBe("abc");
    expect(t.slug).toBeNull();
    expect(t.name).toBe("My Template");
    expect(t.description).toBe(""); // null → ""
    expect(t.type).toBe("worksheet");
    expect(t.sections).toEqual([]);
    expect(t.sort).toBe(3);
    expect(t.createdTime).toBe("2026-09-02T00:00:00Z");
  });

  it("fromRow passes through valid sections via resolveSections", () => {
    const t = fromRow({
      id: "x",
      slug: "s",
      name: "n",
      description: "d",
      type: "worksheet",
      sections: [{ key: "k1", kind: "question", label: "Q?" }],
      sort: 0,
      created_at: "2026-09-02T00:00:00Z",
    });
    expect(t.sections).toEqual([{ key: "k1", kind: "question", label: "Q?" }]);
  });

  it("defaultTemplateSeeds has the three built-ins with stable slugs", () => {
    const slugs = defaultTemplateSeeds().map((s) => s.slug);
    expect(slugs).toEqual(["scenario-assessment", "implications", "blank-worksheet"]);
  });

  it("scenario-assessment seed carries the code registry's sections and is a worksheet", () => {
    const seed = defaultTemplateSeeds().find((s) => s.slug === "scenario-assessment")!;
    expect(seed.type).toBe("worksheet");
    expect(seed.sections).toEqual(getExerciseType("scenario-assessment")?.sections ?? []);
    expect(seed.sections.length).toBeGreaterThan(0);
  });

  it("implications seed is the implications type with no blocks", () => {
    const seed = defaultTemplateSeeds().find((s) => s.slug === "implications")!;
    expect(seed.type).toBe("implications");
    expect(seed.sections).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- exercise-templates-defaults`
Expected: FAIL — cannot resolve `./exercise-templates-defaults`.

- [ ] **Step 3: Write the client-safe defaults module**

Create `lib/exercise-templates-defaults.ts`:

```ts
// Client-safe helpers for the exercise-template library: the row type, its snake_case
// mapper, and the built-in seed set. NO server imports (no server-only, no @/lib/supabase)
// so this is unit-testable and safe anywhere — mirrors how lib/exercise-types.ts stays
// client-safe. The server data layer (lib/exercise-templates.ts) re-exports these.

import { resolveSections, getExerciseType, type WorksheetSection } from "@/lib/exercise-types";

export interface ExerciseTemplate {
  id: string;
  slug: string | null;
  name: string;
  description: string;
  type: string;
  sections: WorksheetSection[]; // [] for non-worksheet types (implications/placeholder)
  sort: number;
  createdTime: string;
}

export interface TemplateRow {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  type: string;
  sections: unknown; // jsonb
  sort: number;
  created_at: string;
}

export function fromRow(r: TemplateRow): ExerciseTemplate {
  return {
    id: r.id,
    slug: r.slug ?? null,
    name: r.name ?? "",
    description: r.description ?? "",
    type: r.type ?? "worksheet",
    sections: resolveSections(r.sections),
    sort: r.sort ?? 0,
    createdTime: r.created_at,
  };
}

export interface TemplateSeed {
  slug: string;
  name: string;
  description: string;
  type: string;
  sections: WorksheetSection[];
  sort: number;
}

// The built-in library, sourced from the code registry (lib/exercise-types.ts) via the
// exported getExerciseType() accessor — single source of truth, no JSON blob duplicated in
// SQL. Scenario Assessment is seeded as an EDITABLE `worksheet` carrying its section array
// (parity AND editability), not the code-fixed `scenario-assessment` type.
export function defaultTemplateSeeds(): TemplateSeed[] {
  return [
    {
      slug: "scenario-assessment",
      name: "Scenario Assessment",
      description: "First reactions, assessment questions, and stepping into the future.",
      type: "worksheet",
      sections: getExerciseType("scenario-assessment")?.sections ?? [],
      sort: 0,
    },
    {
      slug: "implications",
      name: "Implication Mapping",
      description: "The shared implication tree with a brainstorm above it.",
      type: "implications",
      sections: [],
      sort: 1,
    },
    {
      slug: "blank-worksheet",
      name: "Blank Worksheet",
      description: "An empty worksheet — build questions and brainstorm areas from scratch.",
      type: "worksheet",
      sections: [],
      sort: 2,
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- exercise-templates-defaults`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the server data layer**

Create `lib/exercise-templates.ts`:

```ts
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
```

- [ ] **Step 6: Verify types and the full test suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all tests pass (including the new 5).

- [ ] **Step 7: Commit**

```bash
git add lib/exercise-templates-defaults.ts lib/exercise-templates-defaults.test.ts lib/exercise-templates.ts
git commit -m "feat(templates): data layer + seed/mapper helpers for the template library"
```

---

### Task 3: Admin API routes

**Files:**
- Create: `app/api/admin/templates/route.ts` (GET list + seed, POST create)
- Create: `app/api/admin/templates/[id]/route.ts` (PATCH update, DELETE)

**Interfaces:**
- Consumes: `listTemplates`, `createTemplate`, `getTemplate`, `updateTemplate`, `deleteTemplate`, `ensureDefaultTemplates` from `@/lib/exercise-templates`; `getSessionUser` from `@/lib/supabase-auth`; `supabaseConfigured` from `@/lib/supabase`.
- Produces (HTTP):
  - `GET /api/admin/templates` → `{ templates: ExerciseTemplate[] }`
  - `POST /api/admin/templates` body `{ name, description?, type?, sections?, sort? }` → `{ template }` (400 on empty name)
  - `PATCH /api/admin/templates/:id` body `{ name?, description?, type?, sections?, sort? }` → `{ template }` (404 if missing)
  - `DELETE /api/admin/templates/:id` → `{ ok: true }`

- [ ] **Step 1: Write the collection route**

Create `app/api/admin/templates/route.ts`:

```ts
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
```

- [ ] **Step 2: Write the item route**

Create `app/api/admin/templates/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-auth";
import { getTemplate, updateTemplate, deleteTemplate } from "@/lib/exercise-templates";
import { type WorksheetSection } from "@/lib/exercise-types";

export const dynamic = "force-dynamic";

// Admin-only: edit a template (name/description/type/sections/sort).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const existing = await getTemplate(id);
  if (!existing) return NextResponse.json({ error: "Template not found." }, { status: 404 });

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

  try {
    await updateTemplate(id, {
      name: body.name,
      description: body.description,
      type: body.type,
      sections: body.sections,
      sort: body.sort,
    });
    return NextResponse.json({ template: await getTemplate(id) });
  } catch (err) {
    console.error("[PATCH template]", err);
    return NextResponse.json({ error: "Failed to update template." }, { status: 500 });
  }
}

// Admin-only: delete a template. Exercises already stamped from it are snapshots and are
// unaffected.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured())
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  try {
    await deleteTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE template]", err);
    return NextResponse.json({ error: "Failed to delete template." }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify types and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors in the two new route files.

- [ ] **Step 4: Manually verify the endpoints (dev server, logged in as admin)**

Start the app (`npm run dev`) and, in an authenticated admin browser session, run in the devtools console:

```js
// list (seeds the three built-ins on first call)
await (await fetch("/api/admin/templates")).json();
// → { templates: [{ name: "Scenario Assessment", ... }, ...] }  (length >= 3)

// create
const c = await (await fetch("/api/admin/templates", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Test T", type: "worksheet" }),
})).json();
// → { template: { id, name: "Test T", ... } }

// delete it
await (await fetch(`/api/admin/templates/${c.template.id}`, { method: "DELETE" })).json();
// → { ok: true }
```

Expected: list returns ≥3 seeded templates; create returns the new row; delete returns `{ ok: true }`.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/templates/route.ts "app/api/admin/templates/[id]/route.ts"
git commit -m "feat(templates): admin API routes for the template library"
```

---

### Task 4: Admin library page + editor component + nav link

**Files:**
- Create: `app/admin/templates/page.tsx`
- Create: `components/admin/AdminTemplates.tsx`
- Modify: `app/admin/page.tsx` (add a "Templates →" link in the Content section, near lines 76-94)

**Interfaces:**
- Consumes: `ensureDefaultTemplates`, `listTemplates` from `@/lib/exercise-templates`; `EXERCISE_TYPES`, `getExerciseType`, `WorksheetSection` from `@/lib/exercise-types`; `ExerciseQuestionEditor`, `ConfirmModal`; the API routes from Task 3.
- Produces: `interface AdminTemplate { id; slug: string | null; name; description; type; sections: WorksheetSection[]; sort }` (client shape) exported from `components/admin/AdminTemplates.tsx` for reuse in Task 5.

- [ ] **Step 1: Write the client editor component**

Create `components/admin/AdminTemplates.tsx`:

```tsx
"use client";

import { useState } from "react";
import { EXERCISE_TYPES, getExerciseType, type WorksheetSection } from "@/lib/exercise-types";
import { ExerciseQuestionEditor } from "@/components/admin/ExerciseQuestionEditor";
import { ConfirmModal } from "@/components/ConfirmModal";

// Client shape of an exercise_templates row (see lib/exercise-templates.ts). Also imported
// by AdminDesignGroups to type the templates it lists in the "Add week" menu.
export interface AdminTemplate {
  id: string;
  slug: string | null;
  name: string;
  description: string;
  type: string;
  sections: WorksheetSection[];
  sort: number;
}

const inputCls =
  "rounded-[2px] border border-[var(--rule)] bg-paper px-2 py-1.5 text-[13px] focus:border-ink focus:outline-none";
const btn =
  "rounded-[2px] border border-ink px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] disabled:opacity-40";

const TYPE_OPTIONS = Object.values(EXERCISE_TYPES).map((t) => ({ id: t.id, label: t.label }));
const isWorksheet = (type: string) => getExerciseType(type)?.render === "worksheet";

async function api(url: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ...(json as object), _status: res.status, _ok: res.ok };
}

export function AdminTemplates({ initialTemplates }: { initialTemplates: AdminTemplate[] }) {
  const [templates, setTemplates] = useState<AdminTemplate[]>(initialTemplates);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("worksheet");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); // template whose blocks are open
  const [pendingDelete, setPendingDelete] = useState<AdminTemplate | null>(null);
  const base = "/api/admin/templates";

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };
  const setT = (id: string, patch: Partial<AdminTemplate>) =>
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  async function addTemplate() {
    const name = newName.trim();
    if (!name) return;
    await run("new", async () => {
      const res = await api(base, "POST", { name, type: newType });
      if (!res._ok) throw new Error((res.error as string) || "Failed");
      setTemplates((prev) => [...prev, res.template as AdminTemplate]);
      setNewName("");
      setNewType("worksheet");
    });
  }

  // name/description/type are saved on blur/change; sections have their own Save button.
  async function saveMeta(t: AdminTemplate) {
    await run(t.id, async () => {
      const res = await api(`${base}/${t.id}`, "PATCH", {
        name: t.name,
        description: t.description,
        type: t.type,
      });
      if (!res._ok) throw new Error((res.error as string) || "Failed to save template");
    });
  }

  async function saveSections(t: AdminTemplate, sections: WorksheetSection[]) {
    await run(t.id, async () => {
      const res = await api(`${base}/${t.id}`, "PATCH", { sections });
      if (!res._ok) throw new Error((res.error as string) || "Failed to save blocks");
      setT(t.id, { sections });
      setEditingId(null);
    });
  }

  async function removeTemplate(t: AdminTemplate) {
    await run(t.id, async () => {
      const res = await api(`${base}/${t.id}`, "DELETE");
      if (!res._ok) throw new Error((res.error as string) || "Failed to delete template");
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    });
  }

  return (
    <div className="mt-6">
      {error && <p className="mb-3 text-[13px] font-semibold text-coral">{error}</p>}

      <div className="flex flex-col gap-4">
        {templates.map((t) => {
          const busy = busyId === t.id;
          return (
            <article key={t.id} className="rounded-[3px] border border-[var(--hairline)] bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={t.name}
                  onChange={(e) => setT(t.id, { name: e.target.value })}
                  onBlur={() => saveMeta(t)}
                  className={inputCls + " max-w-[240px] font-bold"}
                />
                <select
                  value={t.type}
                  disabled={busy}
                  onChange={(e) => {
                    setT(t.id, { type: e.target.value });
                    void api(`${base}/${t.id}`, "PATCH", { type: e.target.value });
                  }}
                  className={inputCls}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="text-[12px] text-muted">
                  {isWorksheet(t.type)
                    ? `${t.sections.length} block${t.sections.length === 1 ? "" : "s"}`
                    : "no blocks"}
                </span>
                {isWorksheet(t.type) && (
                  <button
                    onClick={() => setEditingId((v) => (v === t.id ? null : t.id))}
                    disabled={busy}
                    className={btn + (editingId === t.id ? " bg-lime" : " bg-paper")}
                  >
                    {editingId === t.id ? "Close" : "Edit blocks"}
                  </button>
                )}
                <button
                  onClick={() => setPendingDelete(t)}
                  disabled={busy}
                  aria-label="Delete template"
                  title="Delete template"
                  className={btn + " ml-auto border-coral text-coral"}
                >
                  🗑
                </button>
              </div>
              <textarea
                value={t.description}
                onChange={(e) => setT(t.id, { description: e.target.value })}
                onBlur={() => saveMeta(t)}
                placeholder="Description (optional)"
                rows={2}
                className={inputCls + " mt-2 w-full resize-none"}
              />
              {editingId === t.id && isWorksheet(t.type) && (
                <div className="mt-3">
                  <ExerciseQuestionEditor
                    initial={t.sections}
                    busy={busy}
                    onSave={(sections) => saveSections(t, sections)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTemplate()}
          placeholder="New template name (e.g. Session 3 · Synthesis)"
          className={inputCls + " max-w-[320px]"}
        />
        <select value={newType} onChange={(e) => setNewType(e.target.value)} className={inputCls}>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          onClick={addTemplate}
          disabled={busyId === "new" || !newName.trim()}
          className={btn + " bg-lime hover:bg-lime-deep"}
        >
          Add template
        </button>
      </div>

      <ConfirmModal
        open={pendingDelete !== null}
        busy={pendingDelete ? busyId === pendingDelete.id : false}
        title="Delete template"
        message={
          pendingDelete ? (
            <>
              Delete <strong>{pendingDelete.name}</strong>? Groups already built from it keep their
              copy — only the library entry is removed.
            </>
          ) : (
            ""
          )
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const t = pendingDelete;
          if (!t) return;
          await removeTemplate(t);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write the page**

Create `app/admin/templates/page.tsx`:

```tsx
import Link from "next/link";
import { supabaseConfigured } from "@/lib/supabase";
import { listTemplates, ensureDefaultTemplates } from "@/lib/exercise-templates";
import { AdminTemplates } from "@/components/admin/AdminTemplates";

export const dynamic = "force-dynamic";

// The global exercise-template library. Auto-gated for facilitators by proxy.ts (like the
// rest of /admin). Seeds the built-ins on first load, then hands the list to the editor.
export default async function AdminTemplatesPage() {
  if (!supabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-16">
        <h1 className="text-[26px] font-extrabold uppercase tracking-tight">Templates</h1>
        <p className="mt-3 text-[14px] text-muted">Database is not configured on the server.</p>
      </main>
    );
  }
  await ensureDefaultTemplates();
  const templates = await listTemplates();

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-10">
      <Link href="/admin" className="eyebrow blue">
        ← Admin
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow ink">Content</span>
          <h1 className="mt-2 text-[30px] font-extrabold uppercase leading-[1.05] tracking-tight">
            Exercise templates
          </h1>
        </div>
        <span className="text-[12px] text-muted">{templates.length} templates</span>
      </div>
      <p className="mt-4 max-w-[560px] text-[13px] leading-[1.5] text-muted">
        Build reusable exercises once — a set of question and brainstorm blocks — and stamp
        them into any design group from its weeks table. Editing a template here never
        changes a group that already ran it.
      </p>
      <AdminTemplates initialTemplates={templates} />
    </main>
  );
}
```

- [ ] **Step 3: Add the nav link on the admin dashboard**

In `app/admin/page.tsx`, inside the Content section's link row (after the "Manage projects →" `Link`, around line 93), add:

```tsx
          <Link
            href="/admin/templates"
            className="rounded-[3px] border border-[var(--rule)] bg-paper px-4 py-3 text-[13px] font-bold hover:border-ink hover:bg-card"
          >
            Exercise templates →
          </Link>
```

- [ ] **Step 4: Verify types and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors in the new/changed files.

- [ ] **Step 5: Manually verify the library UI (dev server)**

Visit `/admin/templates`. Expected:
1. Three seeded templates render (Scenario Assessment, Implication Mapping, Blank Worksheet).
2. "Edit blocks" on Scenario Assessment opens `ExerciseQuestionEditor` populated with its sections; adding a question + Save persists (reload → still there).
3. "Add template" with a name creates a new worksheet; deleting it (trash → confirm) removes it.
4. Implication Mapping shows "no blocks" and no "Edit blocks" button (non-worksheet).

- [ ] **Step 6: Commit**

```bash
git add app/admin/templates/page.tsx components/admin/AdminTemplates.tsx app/admin/page.tsx
git commit -m "feat(templates): admin library page, editor, and nav link"
```

---

### Task 5: Apply-from-template + Save-as-template in the group weeks table

**Files:**
- Modify: `components/admin/AdminDesignGroups.tsx`

**Interfaces:**
- Consumes: `AdminTemplate` type from `@/components/admin/AdminTemplates`; `GET /api/admin/templates` and `POST /api/admin/templates` from Task 3; the component's existing `api`, `run`, `refreshExercises`, `effectiveSections`, `isWorksheet`, `base`, `addingFor`/`setAddingFor` state.
- Produces: the "Add week from…" menu lists saved templates (picking one stamps it into the group); each worksheet week gains a "Save as tmpl" action.

- [ ] **Step 1: Import the template type**

At the top of `components/admin/AdminDesignGroups.tsx`, after the `ConfirmModal` import (line 14), add:

```tsx
import type { AdminTemplate } from "@/components/admin/AdminTemplates";
```

- [ ] **Step 2: Add template + notice state and a lazy loader**

Inside the `AdminDesignGroups` component, next to the other `useState` declarations (after `addingFor`, around line 99), add:

```tsx
  const [templates, setTemplates] = useState<AdminTemplate[] | null>(null); // lazy: null = not yet loaded
  const [notice, setNotice] = useState<string | null>(null);

  // Open the "add week" menu, fetching the template library once (on first open).
  async function openAddMenu(groupId: string) {
    setAddingFor(groupId);
    if (templates === null) {
      const res = await api(`/api/admin/templates`, "GET");
      setTemplates(res._ok ? ((res.templates as AdminTemplate[]) ?? []) : []);
    }
  }
```

- [ ] **Step 3: Clear the notice when any action starts**

In the existing `run` helper, add `setNotice(null);` alongside `setError(null);`:

```tsx
  const run = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };
```

- [ ] **Step 4: Let `addExercise` take an optional title, and add `saveAsTemplate`**

Replace the existing `addExercise` function (lines ~169-180) with:

```tsx
  async function addExercise(
    g: AdminDesignGroup,
    tpl: { type: string; sections: WorksheetSection[]; title?: string }
  ) {
    setAddingFor(null);
    await run(g.id, async () => {
      const res = await api(`${base}/${g.id}/exercises`, "POST", {
        title: tpl.title || `Week ${g.exercises.length + 1}`,
        type: tpl.type,
        sections: tpl.sections,
      });
      if (!res._ok) throw new Error((res.error as string) || "Failed");
      await refreshExercises(g.id);
    });
  }

  // Capture a week's current blocks into the global template library.
  async function saveAsTemplate(ex: AdminExercise) {
    const name = window.prompt("Save this week to the template library as…", ex.title)?.trim();
    if (!name) return;
    await run(ex.id, async () => {
      const res = await api(`/api/admin/templates`, "POST", {
        name,
        type: ex.type,
        sections: effectiveSections(ex),
      });
      if (!res._ok) throw new Error((res.error as string) || "Failed to save template");
      setTemplates((prev) => (prev ? [...prev, res.template as AdminTemplate] : prev));
      setNotice(`Saved “${name}” to the template library.`);
    });
  }
```

- [ ] **Step 5: Render the notice banner**

Right after the existing error banner (`{error && ...}`, around line 223), add:

```tsx
      {notice && <p className="mb-3 text-[13px] font-semibold text-lime-deep">{notice}</p>}
```

- [ ] **Step 6: Add the "Save as tmpl" action to worksheet weeks**

In the per-week action group, right after the existing `isWorksheet(ex.type) && (...)` "Edit Qs" button block (ends ~line 377), add a sibling:

```tsx
                                {isWorksheet(ex.type) && (
                                  <button
                                    onClick={() => saveAsTemplate(ex)}
                                    disabled={exBusy}
                                    title="Save this week's blocks to the template library"
                                    className={btn + " bg-paper"}
                                  >
                                    Save as tmpl
                                  </button>
                                )}
```

- [ ] **Step 7: Replace the "Add week from…" menu with the template list**

Replace the whole `{addingFor === g.id ? (...) : (...)}` block (lines ~416-469) with:

```tsx
                  {addingFor === g.id ? (
                    <div className="mt-2 rounded-[2px] border border-[var(--hairline)] bg-paper p-2">
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                        Start new week from…
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          className={btn + " bg-paper"}
                          disabled={busy}
                          onClick={() => addExercise(g, { type: "worksheet", sections: [] })}
                        >
                          Blank worksheet
                        </button>
                        {templates === null ? (
                          <span className="text-[11px] italic text-muted">Loading templates…</span>
                        ) : (
                          templates.map((t) => (
                            <button
                              key={t.id}
                              className={btn + " bg-paper"}
                              disabled={busy}
                              title={t.description || undefined}
                              onClick={() =>
                                addExercise(g, { type: t.type, sections: t.sections, title: t.name })
                              }
                            >
                              {t.name}
                            </button>
                          ))
                        )}
                        <button
                          className={btn + " bg-paper"}
                          disabled={busy}
                          onClick={() => addExercise(g, { type: "placeholder", sections: [] })}
                        >
                          Placeholder
                        </button>
                        <button
                          className={btn + " ml-auto border-coral text-coral"}
                          onClick={() => setAddingFor(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => openAddMenu(g.id)} disabled={busy} className={btn + " mt-2 bg-paper"}>
                      + Add week
                    </button>
                  )}
```

Note: this removes the old "Copy: {code label}" and "Copy: {sibling week}" buttons — those defaults are now seeded templates, and "Save as tmpl" covers reusing a tuned week durably. `getExerciseType` may become an unused import after this edit; if `npx tsc --noEmit`/lint flags it, keep it only if still referenced by `effectiveSections`/`isWorksheet` (it is), so no import change is needed.

- [ ] **Step 8: Verify types and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors (no unused vars) in `AdminDesignGroups.tsx`.

- [ ] **Step 9: Manually verify the end-to-end flow (dev server)**

On a project admin page (`/admin/projects/<slug>`) with a design group that has a scenario:
1. Click **+ Add week** → menu shows "Loading templates…" then Blank worksheet, the seeded templates, and Placeholder.
2. Pick **Scenario Assessment** → a new week is added titled "Scenario Assessment", board provisions (its "Board →" link appears), and "Edit Qs" shows the snapshotted blocks.
3. On that week, edit a question and click **Save as tmpl**, name it "Session 3 · Synthesis" → green notice appears; reload `/admin/templates` → the new template is listed.
4. Add it to a *second* group from that group's Add-week menu → the same blocks stamp in.
5. Edit "Session 3 · Synthesis" in `/admin/templates` (change a question) → the already-applied weeks are **unchanged** (snapshot semantics).

- [ ] **Step 10: Commit**

```bash
git add components/admin/AdminDesignGroups.tsx
git commit -m "feat(templates): apply-from-template and save-as-template in group weeks"
```

---

## Self-Review

**Spec coverage:**
- Data model (`exercise_templates`) → Task 1. ✓
- Data layer `lib/exercise-templates.ts` + `resolveSections`, `fromRow`, `ensureDefaultTemplates` → Task 2. ✓ (pure helpers split into `-defaults.ts` for testability)
- API routes (GET/POST, PATCH/DELETE, admin-gated) → Task 3. ✓
- Admin library page + editor reusing `ExerciseQuestionEditor` + nav link → Task 4. ✓
- Group integration: apply-from-template menu + "Save this week as a template" → Task 5. ✓
- Seeding built-ins from the code registry → Task 2 (`defaultTemplateSeeds`) invoked in Task 3 GET / Task 4 page. ✓
- Snapshot semantics → enforced by reusing `addExercise` copy path (Task 5) and asserted in Task 5 Step 9.5. ✓
- Non-goals (no new module types, no bulk apply, no live link, no new permission tier) → nothing in any task violates them. ✓

**Placeholder scan:** No TBD/TODO; every code step has full source; every verify step has an exact command and expected result.

**Type consistency:** `ExerciseTemplate` / `TemplateRow` / `TemplateSeed` / `AdminTemplate` used consistently; `fromRow`, `defaultTemplateSeeds`, `listTemplates`, `getTemplate`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `ensureDefaultTemplates` names match across Tasks 2-4; `addExercise(g, { type, sections, title? })` signature updated in Task 5 and every call site in the replaced menu passes that shape. API payload keys (`name/description/type/sections/sort`) match between routes (Task 3) and clients (Tasks 4-5).
