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
