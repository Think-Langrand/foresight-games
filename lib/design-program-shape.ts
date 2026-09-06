// Client-safe SHAPE of the project-level program: the DTO types + the pure builder that
// folds each group's exercises into one canonical program. No server imports (type-only),
// so it's safe in client components, tests, and the server orchestrator alike. The
// server-only side (loads + fan-out writes) lives in lib/design-program.ts.

import type { DesignGroup } from "@/lib/design-groups";
import type { DesignGroupExercise } from "@/lib/design-group-exercises";
import { resolveSections, type CanonicalWeek } from "@/lib/exercise-types";

// One program week, resolved for the editor. `slots` maps each group to the row that
// backs this week in that group (row identity — the key to a board-safe reorder).
export interface ProgramWeekDTO extends CanonicalWeek {
  slots: Record<string, string>; // groupId -> design_group_exercises.id
  cardsByGroup: Record<string, number>; // groupId -> ripple_cards count (display only)
  sessionByGroup: Record<string, string | null>; // groupId -> session_code (Board links)
}

export interface ProgramGroupDTO {
  id: string;
  name: string;
  color: string | null;
  sort: number;
  scenarioRef: string | null;
  scenarioTitle: string | null;
}

export interface ProgramDTO {
  weeks: ProgramWeekDTO[];
  groups: ProgramGroupDTO[];
  divergent: boolean; // groups weren't already in lockstep at load (saving will align them)
}

// A week submitted by the editor. `slots` carries the existing row id per group so the
// reconcile edits that exact row (never re-keying a board); omit/{} for a newly-added week.
// `force` opts this week past the started-week guard: the admin has confirmed that changing
// its questions/type may orphan answers already collected under a removed/renamed question.
export interface ProgramWeekInput extends CanonicalWeek {
  slots?: Record<string, string>;
  force?: boolean;
}

// Would applying `next` over `current` orphan any already-collected answers? Answer cards
// are keyed to an immutable `section.key`, so only a TYPE change or the REMOVAL of an
// existing key (a delete, or a rename that mints a new key) loses answers. Benign edits —
// relabelling a question, editing help text, reordering, or ADDING new questions — keep
// every existing key and are NOT destructive, so a started week isn't blocked from them.
export function weekEditIsDestructive(
  current: { type: string; sections: unknown },
  next: { type: string; sections: unknown }
): boolean {
  if (current.type !== next.type) return true;
  const nextKeys = new Set(resolveSections(next.sections).map((s) => s.key));
  return resolveSections(current.sections).some((s) => !nextKeys.has(s.key));
}

function sortGroups(groups: DesignGroup[]): DesignGroup[] {
  return [...groups].sort(
    (a, b) => a.sort - b.sort || a.createdTime.localeCompare(b.createdTime)
  );
}

// Pure: zip already-loaded per-group exercises into the canonical program the editor
// renders. Canonical length = the longest group's program; canonical CONTENT for index i
// is taken from the "most complete" group (most weeks, then cleanest sort sequence, then
// most boards) so a first-save normalization preserves the richest, tidiest set.
// `divergent` flags any structural mismatch across groups.
export function toProgramDTO(
  groups: DesignGroup[],
  exercisesByGroup: Record<string, DesignGroupExercise[]>,
  cardCounts: Map<string, number>
): ProgramDTO {
  const sorted = sortGroups(groups);
  const lists = sorted.map((g) => exercisesByGroup[g.id] ?? []);
  const maxLen = lists.reduce((m, l) => Math.max(m, l.length), 0);

  // Canonical content group: most exercises, then the cleanest sort sequence (distinct,
  // non-colliding), then most session-backed rows. Picking the tidiest group as the default
  // means a first-save normalization aligns everyone to a sane program, not a messy one.
  let canonicalIdx = 0;
  let best = -1;
  lists.forEach((list, gi) => {
    const distinctSorts = new Set(list.map((e) => e.sort)).size;
    const boards = list.filter((e) => e.sessionCode).length;
    const score = list.length * 1000 + distinctSorts * 10 + boards;
    if (score > best) {
      best = score;
      canonicalIdx = gi;
    }
  });

  let divergent = lists.some((l) => l.length !== maxLen);

  const weeks: ProgramWeekDTO[] = [];
  for (let i = 0; i < maxLen; i++) {
    let content: DesignGroupExercise | undefined = lists[canonicalIdx]?.[i];
    if (!content) content = lists.find((l) => l[i])?.[i];
    if (!content) continue;

    const slots: Record<string, string> = {};
    const cardsByGroup: Record<string, number> = {};
    const sessionByGroup: Record<string, string | null> = {};
    sorted.forEach((g, gi) => {
      const row = lists[gi][i];
      if (!row) return;
      slots[g.id] = row.id;
      sessionByGroup[g.id] = row.sessionCode;
      cardsByGroup[g.id] = row.sessionCode
        ? cardCounts.get(row.sessionCode.toUpperCase()) ?? 0
        : 0;
      if (row.type !== content!.type || row.title !== content!.title) divergent = true;
    });

    weeks.push({
      title: content.title,
      type: content.type,
      opensAt: content.opensAt,
      locked: content.locked,
      sections: content.sections, // raw: [] means "fall back to the type's template"
      slots,
      cardsByGroup,
      sessionByGroup,
    });
  }

  return {
    weeks,
    groups: sorted.map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      sort: g.sort,
      scenarioRef: g.scenarioRef,
      scenarioTitle: g.scenarioTitle,
    })),
    divergent,
  };
}
