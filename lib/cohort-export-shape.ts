// Client-safe SHAPE of the whole-project export: every design group's every week in one
// payload, plus the cross-group CSV. No server imports (type-only), so it is safe in client
// components and tests. The server-only side -- the loads -- lives in lib/cohort-export.ts.
//
// Why this exists: the per-group export (components/admin/AdminGroupAnswers.tsx) has always
// produced one file per group, so comparing four groups meant opening four files and
// trusting that week 3 in one is week 3 in another. It is not safe to assume that: groups
// own their own exercise rows and a facilitator can rename one. This payload resolves the
// alignment once, from the canonical program, and records both titles so a reader can see
// where a group diverged instead of being silently re-filed.
//
// Two shapes of absence are kept distinct throughout, because they are different findings:
//   exerciseId === null  -- this group has no row at this week at all
//   sessionCode === null -- the row exists but was never given a board
// Neither is ever expressed by leaving the week out. A group with a short program still
// reports every canonical week, so "Group 2 skipped session 3" can be read off the export
// rather than inferred from a missing key. Same reasoning as GroupState in
// lib/analysis/cohort-cluster-shape.ts.

import type { ExerciseAnswers } from "@/components/design-groups/AnswerPanels";
import type { DesignGroup } from "@/lib/design-groups";
import type { DesignGroupExercise } from "@/lib/design-group-exercises";
import type { ProgramDTO } from "@/lib/design-program-shape";
import type { CanvasLayout } from "@/lib/ripples";
import type { SynthesisSummary } from "@/lib/synthesis-summary-shape";
import type { ThemeIdea } from "@/lib/theme-ideas-shape";
import { CROSS_GROUP_CSV_HEADER, exerciseCsvRows } from "@/lib/group-answers-csv";

// One participant device on one board. `displayName` is self-asserted and is very often
// "You": design-group boards auto-join with whatever nickname is in localStorage and never
// prompt, so this is a participation record, not a roster of people. There is no email or
// account anywhere in this data.
export interface RosterEntry {
  playerId: string;
  displayName: string | null;
  submittedAt: string | null;
}

// Everything about a board that is not in its shaped answers. Loaded per session code.
export interface BoardExtras {
  // Devices that joined this board, NOT people. A participant who refreshes with cleared
  // storage, or joins from a second device, is a second player: dev boards show up to 106
  // "players" on a board a handful of people used. Read it as an upper bound on reach.
  players: number;
  // Players who pressed submit. Effectively always 0 on a design-group board, because the
  // shared-board flow has no submit step -- RipplesTeamView posts an empty answer set. Kept
  // for the standalone Ripples game, which does use it. A reader must not take 0/93 here to
  // mean nobody finished; it means the question was never asked.
  submitted: number;
  roster: RosterEntry[];
  // Session 3 only: where each implication and theme region sits on the clustering canvas.
  // Nothing read this for an export before, so a board's spatial arrangement -- which is
  // itself part of what the group decided -- was not recoverable.
  canvas: CanvasLayout | null;
  themeIdeas: ThemeIdea[];
  summary: SynthesisSummary | null;
}

export interface ExportedWeek {
  weekSort: number; // position in the canonical program -- the cross-group key
  weekTitle: string; // canonical title for this week, across the project
  exerciseId: string | null; // null = this group has no row at this week
  exerciseTitle: string | null; // this group's own title, which may have drifted
  // What the ROW itself calls its position, which is not always `weekSort`: toProgramDTO
  // aligns by array index, so a group missing a row shifts everything after it up one.
  // Carried so a reader can check the alignment rather than trust it. See programDivergent.
  exerciseSort: number | null;
  type: string | null;
  sessionCode: string | null; // null = the row exists but has no board
  answers: ExerciseAnswers | null;
  participation: { players: number; submitted: number } | null;
  roster: RosterEntry[] | null;
  canvas: CanvasLayout | null;
  themeIdeas: ThemeIdea[];
  summary: SynthesisSummary | null;
}

export interface ExportedGroup {
  groupId: string;
  groupName: string;
  sort: number;
  color: string | null;
  scenarioRef: string | null;
  // The scenario this group worked. Load-bearing for every cross-group reading: the groups
  // explored DIFFERENT futures, so a concern that appears in all of them is robust to which
  // future arrives, and one that appears in a single group is contingent on its scenario.
  scenarioTitle: string | null;
  weeks: ExportedWeek[];
}

export interface ProjectExport {
  project: { slug: string; name: string };
  exportedAt: string;
  weeks: { sort: number; title: string; type: string }[];
  groups: ExportedGroup[];
  // The groups were NOT in lockstep when this was read: they differ in week count, type,
  // title, schedule or question keys. Week alignment is positional, so a divergent program
  // means two groups' week 2 may not be the same session -- and `exerciseSort` on each week
  // is how a consumer checks. Reported rather than resolved: the export's job is to record
  // what is there, and silently comparing across a divergent program is the one thing a
  // reader of this file must not do unknowingly.
  programDivergent: boolean;
}

export interface ExportInput {
  project: { slug: string; name: string };
  exportedAt: string;
  program: ProgramDTO;
  groups: DesignGroup[];
  exercisesByGroup: Record<string, DesignGroupExercise[]>;
  answersByExerciseId: Record<string, ExerciseAnswers>;
  extrasByCode: Record<string, BoardExtras>;
}

const up = (code: string) => code.trim().toUpperCase();

// The label for a week, taken from what the GROUPS call it rather than from the program.
//
// toProgramDTO picks its canonical content group by exercise count ("most exercises, then
// the cleanest sort sequence"), which is the right default for the program editor -- a save
// normalizes everyone onto the tidiest group -- and the wrong one for an export. A leftover
// test group with six exercises beat all four real groups on the dev database, so every
// canonical week title read "ZZ TEST · Session 3 synthesis" and Group 1's Session 1 answers
// came out labelled with a test group's week. The alignment was still correct (it comes
// from `slots`, which is per group); only the label was a lie, which is the worse failure
// of the two because nothing about it looks wrong.
//
// Most-used wins, ties alphabetically so the same data labels the same way twice. Exactly
// what cohortWeeks() in lib/analysis/cohort-cluster-shape.ts does, for the same reason.
function modal<T extends string>(values: T[], fallback: T): T {
  if (values.length === 0) return fallback;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

export function buildExportPayload(input: ExportInput): ProjectExport {
  const { program } = input;

  // Groups in program order. Sorted here rather than trusted from the loader so the JSON
  // and the CSV read in the same order as the admin UI, whatever order the rows arrived in.
  const groups = [...input.groups].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

  // Each week's rows across every group, which both the week labels and the per-group
  // weeks below are read from.
  const rowsAt = program.weeks.map((w) =>
    groups
      .map((g) => (input.exercisesByGroup[g.id] ?? []).find((e) => e.id === w.slots[g.id]))
      .filter((e): e is NonNullable<typeof e> => Boolean(e))
  );

  const weekLabels = program.weeks.map((w, sort) => ({
    sort,
    title: modal(
      rowsAt[sort].map((e) => e.title),
      w.title
    ),
    type: modal(
      rowsAt[sort].map((e) => e.type),
      w.type
    ),
  }));

  return {
    project: input.project,
    exportedAt: input.exportedAt,
    programDivergent: program.divergent,
    weeks: weekLabels,
    groups: groups.map((g): ExportedGroup => {
      const byId = new Map((input.exercisesByGroup[g.id] ?? []).map((e) => [e.id, e]));
      return {
        groupId: g.id,
        groupName: g.name,
        sort: g.sort,
        color: g.color,
        scenarioRef: g.scenarioRef,
        scenarioTitle: g.scenarioTitle,
        weeks: program.weeks.map((w, sort): ExportedWeek => {
          const ex = byId.get(w.slots[g.id] ?? "") ?? null;
          const code = ex?.sessionCode ? up(ex.sessionCode) : null;
          const extras = code ? (input.extrasByCode[code] ?? null) : null;
          return {
            weekSort: sort,
            weekTitle: weekLabels[sort].title,
            exerciseId: ex?.id ?? null,
            exerciseTitle: ex?.title ?? null,
            exerciseSort: ex?.sort ?? null,
            type: ex?.type ?? null,
            sessionCode: code,
            answers: ex ? (input.answersByExerciseId[ex.id] ?? null) : null,
            participation: extras ? { players: extras.players, submitted: extras.submitted } : null,
            roster: extras?.roster ?? null,
            canvas: extras?.canvas ?? null,
            themeIdeas: extras?.themeIdeas ?? [],
            summary: extras?.summary ?? null,
          };
        }),
      };
    }),
  };
}

// The whole project as one sheet: the per-group rows with the group in front.
//
// The Week column carries the group's OWN exercise title, not the canonical one, so a row
// reads as the room that produced it saw it. The canonical alignment is in the JSON; a
// spreadsheet that quietly relabelled a renamed week would be the more confusing of the two.
export function crossGroupCsvRows(payload: ProjectExport): string[][] {
  const rows: string[][] = [];
  for (const g of payload.groups) {
    for (const w of g.weeks) {
      if (!w.answers) continue; // a gap week has nothing to say; it is recorded in the JSON
      for (const row of exerciseCsvRows(w.answers)) rows.push([g.groupName, ...row]);
    }
  }
  return rows;
}

export { CROSS_GROUP_CSV_HEADER };
