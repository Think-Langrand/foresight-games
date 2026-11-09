import { COMMITMENTS_KEY_VISION, getExerciseType } from "@/lib/exercise-types";
import type { ExportedWeek, ProjectExport } from "@/lib/cohort-export-shape";
import type { ExerciseAnswers, QuestionBlock } from "@/components/design-groups/AnswerPanels";
import type { RippleCard } from "@/lib/ripples-types";

// Which fields the cross-group board can show, and the cells under each one per group.
//
// PURE, AND DELIBERATELY NOT server-only: vitest's include is lib/**/*.test.ts and
// `server-only` is not aliased there, so every tested module in this directory has to stay
// free of it. The page does the I/O and hands the payload in.
//
// IT READS `ProjectExport`, WHICH ALREADY EXISTS. buildProjectExport() returns every group,
// every week, shaped `ExerciseAnswers`, plus each group's colour and sort order — exactly
// this page's payload, and already covered by lib/cohort-export-shape.test.ts. Writing a
// second loader beside it would be a second thing to keep true.
//
// A FIELD IS ADDRESSED BY (week index, field key), NEVER BY EXERCISE ID. Each group owns its
// own exercise rows, so ids differ per group and a chip addressed by one could not travel
// across the four columns. This is the same reason the per-group answers viewer deep-links
// with `?week=<n>`.

export type FieldTier = "primary" | "overflow";

export interface CrossGroupField {
  id: string; // `${weekSort}:${fieldKey}`
  fieldKey: string;
  label: string; // chip text, disambiguated by week title on collision
  weekSort: number | null;
  weekTitle: string | null;
  tier: FieldTier;
  counts: Record<string, number>; // groupId -> number of cells
}

export interface CrossGroupCell {
  id: string;
  text: string;
  author: string;
  createdAt: string;
  // The parent this cell hangs off, in the parent's own words — a theme for a risk, a
  // priority for an outcome, an outcome for a response, a card's parent on the map. The
  // spec's decision: flat lists with a tag, never nesting.
  tag: string | null;
  // One extra word the cell carries in its own right: a priority's confirmed/suggested
  // status, or whether a chain row is a hope or a fear.
  note: string | null;
}

// --- the field catalogue ----------------------------------------------------------------

// Every structural field, in the order its chips appear within a week. `extract` is the ONE
// source of truth for what a field shows: a chip's count is `extract(...).length`, and the
// column under it is `extract(...)`. They cannot disagree, which is the whole point —
// a count that promised cards the column then failed to show would be the silent-omission
// failure this board exists not to commit.
interface FieldDef {
  fieldKey: string;
  label: string;
  tier: FieldTier;
  extract: (a: ExerciseAnswers) => CrossGroupCell[];
}

const cell = (
  row: { id: string; text: string; author?: string; createdAt?: string },
  tag: string | null = null,
  note: string | null = null
): CrossGroupCell => ({
  id: row.id,
  text: row.text,
  author: row.author ?? "",
  createdAt: row.createdAt ?? "",
  tag,
  note,
});

const questionAnswers = (questions: QuestionBlock[], key: string): CrossGroupCell[] =>
  (questions.find((q) => q.key === key)?.answers ?? []).map((a) => cell(a));

// A response's parent outcome, by response id. The response pool is flat on purpose (see
// CommitmentsExercise.responses), so the nesting has to be read back from the slots.
const outcomeByResponseId = (a: Extract<ExerciseAnswers, { kind: "commitments" }>) => {
  const parents = new Map<string, string>();
  for (const slot of a.prioritySlots) {
    for (const o of slot.outcomes) {
      for (const r of o.responses) parents.set(r.id, o.outcome.text);
    }
  }
  return parents;
};

// Depth-first from the roots, parents before children, each card tagged with its parent's
// words. Cards unreachable from any root are SKIPPED, matching lib/group-answers-shape.ts:
// a card whose parent is gone is drawn by no view, so showing it here would put a card on
// this board that exists on no other screen.
const flattenTree = (cards: RippleCard[]): CrossGroupCell[] => {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const kids = new Map<string, RippleCard[]>();
  const roots: RippleCard[] = [];
  for (const c of cards) {
    if (c.parentId && byId.has(c.parentId)) {
      const arr = kids.get(c.parentId);
      if (arr) arr.push(c);
      else kids.set(c.parentId, [c]);
    } else if (!c.parentId) {
      roots.push(c);
    }
  }
  const bySort = (x: RippleCard, y: RippleCard) => x.sort - y.sort;
  const out: CrossGroupCell[] = [];
  const walk = (c: RippleCard, parent: RippleCard | null) => {
    // `author` is empty because these are RAW cards: RippleCard carries authorPlayerId, an
    // id, and the player-name map lives in the view this export shaped away. Every other
    // field reads an already-shaped AnswerRow and does carry the name.
    out.push(cell({ id: c.id, text: c.text, createdAt: c.createdTime }, parent?.text ?? null));
    for (const k of (kids.get(c.id) ?? []).sort(bySort)) walk(k, c);
  };
  for (const r of roots.sort(bySort)) walk(r, null);
  return out;
};

const COMMITMENTS_FIELDS: FieldDef[] = [
  {
    fieldKey: "vision",
    label: "Our vision",
    tier: "primary",
    // By KEY, never by label: the label is an authored worksheet section an admin can
    // rename, and `CommitmentsExercise` says outright that there is no `vision` field
    // because that wording is the facilitator's, not code's.
    extract: (a) =>
      a.kind === "commitments" ? questionAnswers(a.questions, COMMITMENTS_KEY_VISION) : [],
  },
  {
    fieldKey: "bold-moves",
    label: "Bold moves",
    tier: "primary",
    // `directions[].move`, NOT `boldMoves`. The latter is looseResponses.filter(shortlisted)
    // — a retired path that is structurally empty on every current board, so a chip built
    // from it would report four groups having written nothing.
    extract: (a) => (a.kind === "commitments" ? a.directions.map((d) => cell(d.move)) : []),
  },
  {
    fieldKey: "priorities",
    label: "The three priorities",
    tier: "primary",
    extract: (a) =>
      a.kind === "commitments"
        ? a.prioritySlots.map((s) => cell(s.pick, null, s.status))
        : [],
  },
  {
    fieldKey: "outcomes",
    label: "Outcomes",
    tier: "primary",
    extract: (a) =>
      a.kind === "commitments"
        ? a.prioritySlots.flatMap((s) =>
            s.outcomes.map((o) => cell(o.outcome, s.pick.text))
          )
        : [],
  },
  {
    fieldKey: "responses",
    label: "Responses",
    tier: "primary",
    extract: (a) => {
      if (a.kind !== "commitments") return [];
      const parents = outcomeByResponseId(a);
      return a.responses.map((r) => cell(r, parents.get(r.id) ?? null));
    },
  },
];

const SYNTHESIS_FIELDS: FieldDef[] = [
  {
    fieldKey: "themes",
    label: "Themes",
    tier: "primary",
    // A theme has no author or time of its own — it is the group's heading over other
    // cards, and SynthesisTheme carries neither field. Empty rather than invented.
    extract: (a) => (a.kind === "synthesis" ? a.themes.map((t) => cell(t)) : []),
  },
  {
    fieldKey: "risks",
    label: "Risks",
    tier: "primary",
    extract: (a) =>
      a.kind === "synthesis"
        ? a.themes.flatMap((t) => t.risks.map((r) => cell(r, t.text)))
        : [],
  },
  {
    fieldKey: "opportunities",
    label: "Opportunities",
    tier: "primary",
    extract: (a) =>
      a.kind === "synthesis"
        ? a.themes.flatMap((t) => t.opportunities.map((o) => cell(o, t.text)))
        : [],
  },
  {
    fieldKey: "hopes-fears",
    label: "Hopes & fears",
    tier: "primary",
    extract: (a) =>
      a.kind === "synthesis" ? a.hopesFears.map((c) => cell(c, null, c.cardKind)) : [],
  },
  {
    fieldKey: "implications",
    label: "Implications (clustered)",
    tier: "overflow",
    extract: (a) =>
      a.kind === "synthesis"
        ? a.themes.flatMap((t) => t.implications.map((i) => cell(i, t.text)))
        : [],
  },
];

const IMPLICATIONS_FIELDS: FieldDef[] = [
  {
    fieldKey: "map",
    label: "Implication map",
    tier: "overflow",
    extract: (a) => (a.kind === "implications" ? flattenTree(a.cards) : []),
  },
  {
    fieldKey: "brainstorm",
    label: "Brainstorm pad",
    tier: "overflow",
    extract: (a) => (a.kind === "implications" ? a.brainstorm.map((r) => cell(r)) : []),
  },
];

// The structural fields a week offers, by the kind of its shaped answers. The `default`
// branch is typed `never`, so a new member of the ExerciseAnswers union cannot be added
// without this file failing to compile — the same guard, for the same reason, as
// exerciseCsvRows in lib/group-answers-csv.ts, which exists because four card kinds once
// went missing from an export in silence.
function structuralFields(a: ExerciseAnswers): FieldDef[] {
  switch (a.kind) {
    case "commitments":
      return COMMITMENTS_FIELDS;
    case "synthesis":
      return SYNTHESIS_FIELDS;
    case "implications":
      return IMPLICATIONS_FIELDS;
    case "worksheet":
      return []; // a worksheet is nothing but authored questions
    case "placeholder":
      return []; // not built yet, or its board failed to load
    default: {
      const never: never = a;
      throw new Error(`cross-group board: unhandled exercise kind ${JSON.stringify(never)}`);
    }
  }
}

// Structural field keys that are ALSO authored sections, so they must not appear twice — but
// only on the week kind that owns them. Excluding `w4-role` everywhere made a worksheet
// section that happened to carry that key vanish with no chip and no note, which is the one
// failure this board names as fatal.
const CLAIMED_SECTION_KEYS: Partial<Record<ExerciseAnswers["kind"], Set<string>>> = {
  commitments: new Set([COMMITMENTS_KEY_VISION]),
};

// Authored question blocks a week carries, excluding the ones a structural field already
// owns. Read across every group, because a question one group answered and another never
// opened is still a question this project asked.
function authoredFields(weeks: (ExerciseAnswers | null)[]): FieldDef[] {
  const out = new Map<string, FieldDef>();
  for (const a of weeks) {
    if (!a || !("questions" in a)) continue;
    const claimed = CLAIMED_SECTION_KEYS[a.kind];
    for (const q of a.questions) {
      if (claimed?.has(q.key) || out.has(q.key)) continue;
      out.set(q.key, {
        fieldKey: `q:${q.key}`,
        // The label is the only human-readable name an authored section has — admin-added
        // ones get generated keys like `sec_cf8bc585` — so it is what the chip shows, and
        // never what the field id is built from.
        label: q.label || q.key,
        tier: "overflow",
        extract: (x) => ("questions" in x ? questionAnswers(x.questions, q.key) : []),
      });
    }
  }
  return [...out.values()];
}

// The spec's primary chip order, project-wide. Fields not named here keep week order after
// them. "uncertainties" leads but is not produced by this module — it comes from the
// platform, not from a board — so the page prepends it.
const PRIMARY_ORDER = [
  "vision",
  "bold-moves",
  "priorities",
  "risks",
  "opportunities",
  "outcomes",
  "responses",
  "themes",
  "hopes-fears",
];

// Each group's shaped answers for one week of the canonical program, in group sort order.
// `null` means that group has no board there — either no row at all, or a row with no
// session. Which of those it is, is `columnState`'s business.
function answersForWeek(payload: ProjectExport, weekSort: number): (ExerciseAnswers | null)[] {
  return payload.groups.map(
    (g) => g.weeks.find((w) => w.weekSort === weekSort)?.answers ?? null
  );
}

// The fields one week offers, UNIONED ACROSS EVERY GROUP. Both the chip registry and the
// column builder go through here, so a chip can never exist without the column behind it
// resolving to the same field.
//
// THE UNION IS THE WHOLE POINT, not tidiness. An earlier version read the week's structural
// fields from the first non-null answers — and a group whose row exists but whose board was
// never opened shapes to a `placeholder`, which is truthy and offers no structural fields.
// So the lowest-sorted group not having started Session 4 yet deleted Our vision, Bold
// moves, the priorities, Outcomes and Responses from the chip row for ALL FOUR groups, while
// three groups' finished work sat in the payload. A half-finished week is named in the
// spec's goals, and that was both anti-goals at once.
function defsForWeek(payload: ProjectExport, weekSort: number): FieldDef[] {
  const answers = answersForWeek(payload, weekSort);
  const structural = new Map<string, FieldDef>();
  for (const a of answers) {
    if (!a) continue;
    for (const def of structuralFields(a)) {
      if (!structural.has(def.fieldKey)) structural.set(def.fieldKey, def);
    }
  }
  return [...structural.values(), ...authoredFields(answers)];
}

/** Every field the board can show, primary chips first, then overflow in week order. */
export function listCrossGroupFields(payload: ProjectExport): CrossGroupField[] {
  if (payload.groups.length === 0) return [];

  const fields: CrossGroupField[] = [];
  for (const week of payload.weeks) {
    const defs = defsForWeek(payload, week.sort);
    if (defs.length === 0) continue; // no group has a board for this week: no chips to offer
    const answers = answersForWeek(payload, week.sort);
    const rows = payload.groups.map((g, i) => ({ groupId: g.groupId, answers: answers[i] }));

    for (const def of defs) {
      const counts: Record<string, number> = {};
      for (const r of rows) counts[r.groupId] = r.answers ? def.extract(r.answers).length : 0;
      fields.push({
        id: `${week.sort}:${def.fieldKey}`,
        fieldKey: def.fieldKey,
        label: def.label,
        weekSort: week.sort,
        weekTitle: week.title,
        tier: def.tier,
        counts,
      });
    }
  }

  // A program with two weeks of the same kind offers the same field twice. Both chips stay
  // — they are different sessions — so the week title disambiguates them.
  const seen = new Map<string, number>();
  for (const f of fields) seen.set(f.label, (seen.get(f.label) ?? 0) + 1);
  for (const f of fields) {
    if ((seen.get(f.label) ?? 0) > 1 && f.weekTitle) f.label = `${f.label} · ${f.weekTitle}`;
  }

  const rank = (f: CrossGroupField) => {
    const i = PRIMARY_ORDER.indexOf(f.fieldKey);
    return i === -1 ? PRIMARY_ORDER.length : i;
  };
  return fields.sort(
    (a, b) =>
      (a.tier === b.tier ? 0 : a.tier === "primary" ? -1 : 1) ||
      rank(a) - rank(b) ||
      (a.weekSort ?? 0) - (b.weekSort ?? 0)
  );
}

export interface CrossGroupColumn {
  groupId: string;
  groupName: string;
  color: string | null;
  scenarioTitle: string | null;
  // `no-week` — the program has this week but this group has no row for it.
  // `no-board` — the row exists but was never backed by a session.
  // Told apart on purpose: both render as zero cards, and a reader who cannot tell them
  // from "they wrote nothing" is being misled about what the group did.
  state: "ok" | "no-week" | "no-board";
  cells: CrossGroupCell[];
}

/**
 * One column per group for a single field, in the project's group order so Group 1 is
 * always leftmost. Every group gets a column, including the ones with nothing to show.
 *
 * `fieldId` is `${weekSort}:${fieldKey}` — and an authored section's key contains its own
 * colon (`q:sec_cf8bc585`), so only the FIRST colon separates the week.
 */
export function columnsFor(payload: ProjectExport, fieldId: string): CrossGroupColumn[] {
  if (payload.groups.length === 0) return [];

  const split = fieldId.indexOf(":");
  if (split === -1) throw new Error(`cross-group board: malformed field id ${fieldId}`);
  const weekSort = Number(fieldId.slice(0, split));
  const fieldKey = fieldId.slice(split + 1);
  if (!Number.isInteger(weekSort)) {
    throw new Error(`cross-group board: malformed field id ${fieldId}`);
  }

  const def = defsForWeek(payload, weekSort).find((d) => d.fieldKey === fieldKey);
  // Throwing rather than returning empty columns: an unknown field id means a caller built
  // a chip this module cannot answer, and showing four empty columns would present that
  // bug as four groups having written nothing.
  if (!def) throw new Error(`cross-group board: no field ${fieldKey} at week ${weekSort}`);

  return payload.groups.map((g) => {
    const week = g.weeks.find((w) => w.weekSort === weekSort);
    // `no-board` is read off `sessionCode` and the placeholder shape, NOT off
    // `answers === null`. buildExportPayload shapes every slotted exercise, so a row that
    // exists but was never backed by a session arrives as a `placeholder` object, not null —
    // and an earlier version checking for null made that case fall through to "ok" with zero
    // cells, rendering a group that never opened its board as a group that wrote nothing.
    const unopened =
      !week ||
      week.sessionCode === null ||
      week.answers === null ||
      week.answers.kind === "placeholder";
    const state: CrossGroupColumn["state"] =
      !week || week.exerciseId === null ? "no-week" : unopened ? "no-board" : "ok";
    return {
      groupId: g.groupId,
      groupName: g.groupName,
      color: g.color,
      scenarioTitle: g.scenarioTitle,
      state,
      cells: week?.answers ? def.extract(week.answers) : [],
    };
  });
}

/**
 * Weeks whose `type` this module does not know, so a reader is told rather than left to
 * infer it from a chip row that quietly lacks a session.
 */
export function unknownWeeks(payload: ProjectExport): { weekSort: number; type: string | null }[] {
  const out: { weekSort: number; type: string | null }[] = [];
  const seen = new Set<number>();
  for (const g of payload.groups) {
    for (const w of g.weeks as ExportedWeek[]) {
      // ASK THE REGISTRY, do not compare against a list of render names. `ExportedWeek.type`
      // is an exercise TYPE ID; an earlier version tested it against the four RENDER names,
      // which made `scenario-assessment` — a registered type that renders as a worksheet,
      // and the first default template seed — read as unknown. That printed a false "type
      // this board does not know" banner over seventeen working Session 1 chips on the live
      // project, in the same coral slot as the divergent-program warning. Teaching a reader
      // to ignore that slot is the real cost.
      if (!w.type || getExerciseType(w.type) || seen.has(w.weekSort)) continue;
      seen.add(w.weekSort);
      out.push({ weekSort: w.weekSort, type: w.type });
    }
  }
  return out.sort((a, b) => a.weekSort - b.weekSort);
}

/**
 * Machine-readable reasons the board should warn before anyone reads across its columns.
 * The copy lives in the component; the conditions live here so they can be tested.
 *
 * `programDivergent` is the load-bearing one. Week alignment across groups is POSITIONAL,
 * so when the groups are not in lockstep two columns under the same chip may be two
 * different sessions. The export reports that rather than resolving it, and comparing them
 * silently is the one thing a reader of that payload must not do unknowingly.
 */
export function crossGroupWarnings(payload: ProjectExport): string[] {
  const out: string[] = [];
  if (payload.programDivergent) out.push("programDivergent");
  for (const w of unknownWeeks(payload)) out.push(`unknownWeek:${w.weekSort}`);
  // A week the program declares but no group has opened offers no chips. Said out loud
  // rather than skipped: a week that simply vanishes from the chip row is indistinguishable
  // from a week that was never in the program.
  for (const w of payload.weeks) {
    if (defsForWeek(payload, w.sort).length === 0) out.push(`noBoards:${w.sort}`);
  }
  return out;
}

// Material the week shapes deliberately preserve but no chip on this board reaches. The
// shapes keep these precisely so nothing is ever lost — see the orphan contract in
// lib/commitments-shape.ts — and a board that simply did not mention them would be
// re-committing the omission those lists exist to prevent. Counted here, named on screen.
export const NOT_SHOWN_BUCKETS = [
  "parked", // set aside by the group, kept for the record
  "unclustered", // implications never sorted into a theme
  "chain", // LEGACY: hopes and fears written on a theme by an older board
  "orphans", // cards the board could not place
  "strayOutcomes", // outcomes under a priority the group later replaced
  "strandedMilestones", // milestones under a response since un-ticked
  "looseResponses", // roots from the untagged wall Session 4 used to have
] as const;

export type NotShownBucket = (typeof NOT_SHOWN_BUCKETS)[number];

/** groupId -> bucket -> how many cards sit there, summed across the group's weeks. */
export function notShownCounts(
  payload: ProjectExport
): Record<string, Record<NotShownBucket, number>> {
  const out: Record<string, Record<NotShownBucket, number>> = {};
  for (const g of payload.groups) {
    const counts = Object.fromEntries(NOT_SHOWN_BUCKETS.map((b) => [b, 0])) as Record<
      NotShownBucket,
      number
    >;
    for (const w of g.weeks) {
      const a = w.answers;
      if (!a) continue;
      if (a.kind === "synthesis") {
        counts.parked += a.parked.length;
        counts.unclustered += a.unclustered.length;
        counts.orphans += a.orphans.length;
        for (const t of a.themes) counts.chain += t.chain.length;
      } else if (a.kind === "commitments") {
        counts.orphans += a.orphans.length;
        counts.strayOutcomes += a.strayOutcomes.length;
        counts.strandedMilestones += a.stranded.length;
        counts.looseResponses += a.looseResponses.length;
      }
    }
    out[g.groupId] = counts;
  }
  return out;
}
