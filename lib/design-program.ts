import "server-only";

import { getProjectById } from "@/lib/projects";
import { listDesignGroups, implicationCountsByCode } from "@/lib/design-groups";
import {
  listExercises,
  getExercise,
  createExercise,
  updateExercise,
  deleteExercise,
  provisionExerciseBoard,
  lockExercise,
  unlockExercise,
  type DesignGroupExercise,
  type BoardScenarioCtx,
} from "@/lib/design-group-exercises";
import { defaultProgramWeeks, isBoardBacked, type CanonicalWeek } from "@/lib/exercise-types";
import {
  toProgramDTO,
  weekEditIsDestructive,
  programVersion,
  type ProgramDTO,
  type ProgramWeekInput,
} from "@/lib/design-program-shape";

// Thrown when a save would change the QUESTIONS or TYPE of a week that has already
// collected answers, without the admin opting in per-week (`force`). Those answer cards
// are tagged to a question's section key, so removing/renaming a question orphans them —
// a deliberate, destructive act. The route turns this into a 409 the admin can confirm past.
export class StartedWeekEditError extends Error {
  constructor(readonly weeks: string[]) {
    super("STARTED_WEEK_EDIT");
    this.name = "StartedWeekEditError";
  }
}

// Thrown when the program changed in the DB since the client loaded it (another admin saved,
// or a scenario assignment reshaped a group). Optimistic concurrency: the route turns this
// into a 409 so the client reloads the latest instead of silently clobbering the other edit.
export class ProgramConflictError extends Error {
  constructor() {
    super("PROGRAM_CONFLICT");
    this.name = "ProgramConflictError";
  }
}

// Server-only orchestrator for the PROJECT-LEVEL program. Every design group runs the
// SAME program of weeks — only the scenario differs — but each group physically owns its
// own design_group_exercises rows (with their own boards + cards). This module lets the
// admin edit ONE canonical program and fans it out to every group, keeping them in
// lockstep. It sits above both data layers (imports lib/design-groups and
// lib/design-group-exercises); neither imports back, so there is no cycle. The pure DTO
// builder + its types live in the client-safe lib/design-program-shape.ts (re-exported here).

export {
  toProgramDTO,
  type ProgramDTO,
  type ProgramWeekDTO,
  type ProgramGroupDTO,
  type ProgramWeekInput,
} from "@/lib/design-program-shape";

// Load + build the canonical program for a project (route GET + post-save re-read).
export async function getCanonicalProgram(projectId: string): Promise<ProgramDTO> {
  const groups = await listDesignGroups(projectId);
  const lists = await Promise.all(groups.map((g) => listExercises(g.id)));
  const exercisesByGroup: Record<string, DesignGroupExercise[]> = {};
  groups.forEach((g, i) => {
    exercisesByGroup[g.id] = lists[i];
  });
  const codes = lists.flat().map((e) => e.sessionCode ?? "").filter(Boolean);
  const cardCounts = await implicationCountsByCode(codes);
  return toProgramDTO(groups, exercisesByGroup, cardCounts);
}

// The canonical program as plain CanonicalWeek[] (no slots) — used to seed a brand-new
// group so it lands identical to its peers. Falls back to DEFAULT_PROGRAM when the
// project has no exercises anywhere yet (the very first group).
export async function getCanonicalProgramWeeks(projectId: string): Promise<CanonicalWeek[]> {
  // Seeding only needs week CONTENT, not card counts — build the DTO with an empty tally so
  // we skip the ripple_cards aggregate query.
  const groups = await listDesignGroups(projectId);
  const lists = await Promise.all(groups.map((g) => listExercises(g.id)));
  const exercisesByGroup: Record<string, DesignGroupExercise[]> = {};
  groups.forEach((g, i) => {
    exercisesByGroup[g.id] = lists[i];
  });
  const dto = toProgramDTO(groups, exercisesByGroup, new Map());
  if (dto.weeks.length === 0) return defaultProgramWeeks();
  return dto.weeks.map((w) => ({
    title: w.title,
    type: w.type,
    opensAt: w.opensAt,
    locked: w.locked,
    closed: w.closed,
    sections: w.sections,
  }));
}

// THE fan-out. Reconcile every group's design_group_exercises rows to match `weeks`.
// Board-safe by construction: an existing row is identified by its id (weeks[i].slots[g.id])
// and only its sort/content is written — never session_code — so boards + ripple_cards stay
// bolted to the same row through any reorder. New weeks are created (+ board provisioned if
// board-backed and the group has a scenario); removed weeks delete the row per group but
// LEAVE the backing session + cards intact (deleting a week is a registry action, not a
// data purge — mirrors DELETE .../exercises/[exerciseId]). Idempotent (slot-id keyed), so a
// re-submit after a partial failure converges.
export async function reconcileGroupsToProgram(
  projectId: string,
  weeks: ProgramWeekInput[],
  opts: { expectedVersion?: string } = {}
): Promise<{ perGroup: Record<string, { created: number; updated: number; deleted: number }> }> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const groups = await listDesignGroups(projectId);
  const perGroup: Record<string, { created: number; updated: number; deleted: number }> = {};

  // Load every group's rows once (in parallel — the reads are independent), then tally answer
  // cards per backing board.
  const lists = await Promise.all(groups.map((g) => listExercises(g.id)));
  const existingByGroup: Record<string, DesignGroupExercise[]> = {};
  const allCodes: string[] = [];
  groups.forEach((g, idx) => {
    existingByGroup[g.id] = lists[idx];
    for (const e of lists[idx]) if (e.sessionCode) allCodes.push(e.sessionCode);
  });

  // Optimistic concurrency: bail before any write if the program changed since the client
  // loaded it (another admin saved in between). Prevents lost updates and stale-slot
  // corruption (e.g. resurrecting a week the other admin just deleted).
  if (opts.expectedVersion && opts.expectedVersion !== programVersion(groups, existingByGroup)) {
    throw new ProgramConflictError();
  }

  // Every provided slot must reference a real row IN THAT GROUP. A provided-but-missing slot
  // (stale client, bug, or tampering) would otherwise be treated as "create new" here AND
  // delete the original row below — silently orphaning its board + cards. Abort before any
  // write; the client reloads the latest. (An absent slot is fine — that's a genuinely new week.)
  for (const g of groups) {
    const ids = new Set(existingByGroup[g.id].map((e) => e.id));
    for (const w of weeks) {
      const rowId = w.slots?.[g.id];
      if (rowId && !ids.has(rowId)) throw new ProgramConflictError();
    }
  }

  const cardCounts = await implicationCountsByCode(allCodes);
  const cardsFor = (row: DesignGroupExercise) =>
    row.sessionCode ? cardCounts.get(row.sessionCode.toUpperCase()) ?? 0 : 0;

  // Validation pre-pass (no writes yet): refuse to change the QUESTIONS or TYPE of any
  // week that already has answers, unless that week is force-confirmed. Collect every
  // offending week first so a blocked save aborts cleanly instead of writing some groups.
  const blocked = new Set<string>();
  groups.forEach((g) => {
    const byId = new Map(existingByGroup[g.id].map((e) => [e.id, e]));
    weeks.forEach((w, i) => {
      if (w.force) return;
      const rowId = w.slots?.[g.id];
      const row = rowId ? byId.get(rowId) : undefined;
      if (!row || cardsFor(row) === 0) return;
      if (weekEditIsDestructive(row, w)) blocked.add(w.title || `Week ${i + 1}`);
    });
  });
  if (blocked.size > 0) throw new StartedWeekEditError([...blocked]);

  for (const g of groups) {
    const existing = existingByGroup[g.id];
    const byId = new Map(existing.map((e) => [e.id, e]));
    const kept = new Set<string>();
    const stats = { created: 0, updated: 0, deleted: 0 };
    const ctx: BoardScenarioCtx | null = g.scenarioRef
      ? {
          projectId,
          scenarioRef: g.scenarioRef,
          carmelitaProjectRef: project.carmelitaProjectRef,
          color: g.color,
        }
      : null;

    for (let i = 0; i < weeks.length; i++) {
      const w = weeks[i];
      const rowId = w.slots?.[g.id];
      const row = rowId ? byId.get(rowId) : undefined;

      if (row) {
        // Content + order only — session_code is never touched here.
        await updateExercise(row.id, {
          sort: i,
          title: w.title,
          type: w.type,
          opensAt: w.opensAt,
          closed: w.closed,
          sections: w.sections,
        });
        kept.add(row.id);
        stats.updated++;
        if (isBoardBacked(w.type) && !row.sessionCode && ctx) {
          const fresh = await getExercise(row.id);
          if (fresh) await provisionExerciseBoard(fresh, ctx);
        }
        // Shared schedule: flip the lock only when it actually changes.
        if (w.locked && !row.locked) await lockExercise(row.id);
        else if (!w.locked && row.locked) await unlockExercise(row.id);
      } else {
        const created = await createExercise({
          groupId: g.id,
          sort: i,
          title: w.title,
          type: w.type,
          opensAt: w.opensAt,
          closed: w.closed,
          sections: w.sections,
        });
        kept.add(created.id);
        stats.created++;
        if (isBoardBacked(w.type) && ctx) await provisionExerciseBoard(created, ctx);
        if (w.locked) await lockExercise(created.id);
      }
    }

    for (const row of existing) {
      if (!kept.has(row.id)) {
        await deleteExercise(row.id); // ORPHAN policy: session + cards preserved
        stats.deleted++;
      }
    }
    perGroup[g.id] = stats;
  }

  return { perGroup };
}

// Route-facing alias.
export const saveProgram = reconcileGroupsToProgram;
