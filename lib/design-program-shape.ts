// Client-safe SHAPE of the project-level program: the DTO types + the pure builder that
// folds each group's exercises into one canonical program. No server imports (type-only),
// so it's safe in client components, tests, and the server orchestrator alike. The
// server-only side (loads + fan-out writes) lives in lib/design-program.ts.

import type { DesignGroup } from "@/lib/design-groups";
import type { DesignGroupExercise } from "@/lib/design-group-exercises";
import { resolveEffectiveSections, type CanonicalWeek } from "@/lib/exercise-types";

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
  version: string; // fingerprint of the loaded rows — the client echoes it on save so a
  // concurrent edit by another admin is detected (optimistic concurrency, see programVersion)
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
  // Compare EFFECTIVE sections: a started week with sections=[] falls back to its type
  // template, whose keys the answers are tagged with — so [] must resolve to those keys,
  // not the empty set, or a template-backed week would look keyless and skip the guard.
  const nextKeys = new Set(resolveEffectiveSections(next.type, next.sections).map((s) => s.key));
  return resolveEffectiveSections(current.type, current.sections).some((s) => !nextKeys.has(s.key));
}

function sortGroups(groups: DesignGroup[]): DesignGroup[] {
  return [...groups].sort(
    (a, b) => a.sort - b.sort || a.createdTime.localeCompare(b.createdTime)
  );
}

const effectiveKeyList = (type: string, sections: unknown): string[] =>
  resolveEffectiveSections(type, sections)
    .map((s) => s.key)
    .sort();

// Do two rows carry the same content the fan-out keeps in lockstep? Beyond type/title, the
// contract also covers schedule (opensAt), lock state, and the effective question keyset —
// so groups differing in any of those are NOT "in sync" (a save would overwrite them).
function rowsInLockstep(
  a: { type: string; title: string; opensAt: string | null; locked: boolean; sections: unknown },
  b: { type: string; title: string; opensAt: string | null; locked: boolean; sections: unknown }
): boolean {
  if (a.type !== b.type || a.title !== b.title) return false;
  if ((a.opensAt ?? null) !== (b.opensAt ?? null) || Boolean(a.locked) !== Boolean(b.locked)) return false;
  const ak = effectiveKeyList(a.type, a.sections);
  const bk = effectiveKeyList(b.type, b.sections);
  return ak.length === bk.length && ak.every((k, i) => k === bk[i]);
}

// djb2 string hash → short token. Deterministic (no Date/Math.random), so it's stable and
// safe to run server- and client-side.
function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// A fingerprint of every exercise row that a save would touch (id, order, schedule, lock,
// board, effective questions). The editor loads it and echoes it on save; if the DB has
// changed since (another admin edited), the reconcile rejects the save — optimistic
// concurrency so concurrent editors can't silently clobber each other or resurrect a row
// the other just deleted. Card activity lives in ripple_cards (not here), so participants
// building boards never trips this.
export function programVersion(
  groups: DesignGroup[],
  exercisesByGroup: Record<string, DesignGroupExercise[]>
): string {
  // Fields are joined with U+0001 and rows with U+0002 — explicit separators so adjacent
  // values can't concatenate into a colliding fingerprint (type "ab" + title "" vs "a" + "b").
  const parts: string[] = [];
  for (const g of sortGroups(groups)) {
    for (const e of exercisesByGroup[g.id] ?? []) {
      parts.push(
        [
          g.id,
          e.id,
          e.sort,
          e.type,
          e.title,
          e.opensAt ?? "",
          e.locked ? 1 : 0,
          e.sessionCode ?? "",
          JSON.stringify(resolveEffectiveSections(e.type, e.sections)),
        ].join("\u0001")
      );
    }
  }
  return hashStr(parts.join("\u0002"));
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
      // Lockstep covers type/title AND schedule/lock/question-keys — a save fans all of
      // those out, so any difference means the groups aren't actually in sync.
      if (!rowsInLockstep(row, content!)) divergent = true;
    });

    weeks.push({
      title: content.title,
      type: content.type,
      opensAt: content.opensAt,
      locked: content.locked,
      // Materialize the EFFECTIVE sections (snapshot, else the type template) so the editor
      // and every save carry stable section keys — the program no longer depends on the code
      // template implicitly, and the started-week guard always sees the real key set.
      sections: resolveEffectiveSections(content.type, content.sections),
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
    version: programVersion(groups, exercisesByGroup),
  };
}
