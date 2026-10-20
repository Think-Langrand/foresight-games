import type {
  ExerciseAnswers,
  ImplicationsExercise,
  SynthesisExercise,
  WorksheetExercise,
  CommitmentsExercise,
} from "@/components/design-groups/AnswerPanels";
import { enumerateChains } from "@/lib/ripples-types";

// Every design-group week's rows for a CSV export, as raw cells. One builder per exercise
// kind, plus exerciseCsvRows to dispatch across the ExerciseAnswers union.
//
// Pure and separate from the export buttons because this is the one consumer of
// ExerciseAnswers with no safety net at all: it pushes untyped string arrays, so adding a
// card kind neither fails to compile nor fails a test — it just silently drops that kind
// from the export the facilitator takes into the next workshop. Four kinds went missing
// this way before synthesisCsvRows was extracted; the worksheet and implications builders
// joined it here when the cross-group export needed them too, rather than being copied.
//
// exerciseCsvRows is the structural fix for that whole class of bug: its default branch is
// typed `never`, so a new member of the ExerciseAnswers union cannot be added without this
// file failing to compile. It throws at runtime as well, because a cast upstream can
// defeat the compiler but should not be able to drop a week from an export in silence.

// Columns every builder below emits, in order. The sheet's header.
export const GROUP_ANSWERS_CSV_HEADER = [
  "Week",
  "Section",
  "Kind",
  "Content",
  "Author",
  "Created",
] as const;

// The cross-group export's header: the same columns with the group in front, so four
// groups' weeks can sit in one sheet and still be told apart.
export const CROSS_GROUP_CSV_HEADER = ["Group", ...GROUP_ANSWERS_CSV_HEADER] as const;

export function synthesisCsvRows(ex: SynthesisExercise): string[][] {
  const rows: string[][] = [];
  const at = (theme: string) => `Theme: ${theme}`;

  // The facilitator's summary first, as the panel shows it. No author: the model wrote it.
  if (ex.summary) {
    const s = ex.summary;
    const line = (content: string) => rows.push([ex.title, "Summary", "summary", content, "", s.generatedAt]);
    line(s.overview);
    for (const t of s.themes) {
      if (t.about) line(`${t.title} — ${t.about}`);
      if (t.atStake) line(`${t.title} — at stake: ${t.atStake}`);
      for (const r of t.risks) line(`${t.title} — risk: ${r}`);
      for (const o of t.opportunities) line(`${t.title} — opportunity: ${o}`);
    }
    for (const x of s.tensions) line(`Tension: ${x}`);
  }

  // A hope or fear, its "why" on the same row, indented by depth — then whatever rode on
  // it (who it concerns, older boards' assumptions) as rows of their own.
  const chainRows = (section: string, c: SynthesisExercise["hopesFears"][number]) => {
    const arrow = "→ ".repeat(Math.max(0, c.depth - 1));
    const body = c.value ? `${arrow}${c.text} — ${c.value}` : `${arrow}${c.text}`;
    rows.push([ex.title, section, c.cardKind, body, c.author, c.createdAt]);
    if (c.concerns) {
      // The concern is its own card, so its own author and time.
      rows.push([
        ex.title,
        section,
        "concerns",
        `${arrow}↳ ${c.concerns}`,
        c.concernsBy?.author ?? c.author,
        c.concernsBy?.createdAt ?? c.createdAt,
      ]);
    }
    for (const a of c.assumptions) {
      rows.push([ex.title, section, "assumption", `${arrow}◆ ${a.text}`, a.author, a.createdAt]);
    }
  };

  for (const t of ex.themes) {
    rows.push([ex.title, "Theme", "theme", t.text, "", ""]);
    if (t.description) {
      rows.push([ex.title, at(t.text), "theme description", t.description, "", ""]);
    }
    for (const a of t.implications) {
      rows.push([ex.title, at(t.text), "implication", a.text, a.author, a.createdAt]);
    }
    // One row per answered question, Kind = the card kind, Content = "Question — answer"
    // so the sheet reads without the app.
    for (const a of t.answers) {
      rows.push([ex.title, at(t.text), a.kind, `${a.label} — ${a.text}`, a.author, a.createdAt]);
    }
    // Step 2's two walls. A shortlist star and a mechanism are older boards' marks, kept.
    const stakeRow = (kind: string, r: (typeof t.risks)[number]) => {
      const mark = r.shortlisted ? "★ " : "";
      const body = r.mechanism ? `${mark}${r.text} — ${r.mechanism}` : `${mark}${r.text}`;
      rows.push([ex.title, at(t.text), kind, body, r.author, r.createdAt]);
    };
    for (const r of t.risks) stakeRow("risk", r);
    for (const r of t.opportunities) stakeRow("opportunity", r);
    // LEGACY: an older board's hopes and fears written on the theme.
    for (const c of t.chain) chainRows(at(t.text), c);
    // Older boards' sandbox notes.
    for (const r of t.tensions) stakeRow("tension", r);
  }

  // Step 3's hopes and fears, with each flip (step 4) indented under the fear it answers.
  for (const c of ex.hopesFears) chainRows("Hopes & fears", c);

  // LEGACY: the retired role step — one set of answers for the board, its own section.
  for (const a of ex.role) {
    rows.push([ex.title, "Public health's role", a.kind, `${a.label} — ${a.text}`, a.author, a.createdAt]);
  }
  for (const a of ex.unclustered) {
    rows.push([ex.title, "Not in a theme", "implication", a.text, a.author, a.createdAt]);
  }
  for (const q of ex.questions) {
    for (const a of q.answers) {
      rows.push([ex.title, q.label || q.key, q.kind, a.text, a.author, a.createdAt]);
    }
  }
  for (const a of ex.parked) {
    rows.push([ex.title, "Parked", "parked", a.text, a.author, a.createdAt]);
  }
  // Unplaceable cards still export: the point of surfacing them is that they are not lost.
  for (const a of ex.orphans) {
    rows.push([ex.title, "Unplaceable", "orphan", a.text, a.author, a.createdAt]);
  }
  return rows;
}

// A worksheet week: one row per answer, under the question as the group saw it. Answers
// under a retired section key are kept — the section left the spec, the group's work did
// not — and arrive here already marked `removed` by the shaping layer.
export function worksheetCsvRows(ex: WorksheetExercise): string[][] {
  const rows: string[][] = [];
  for (const q of ex.questions) {
    for (const a of q.answers) {
      rows.push([ex.title, q.label || q.key, q.kind, a.text, a.author, a.createdAt]);
    }
  }
  return rows;
}

// An implications week: every root-to-leaf causal chain as one arrow-joined row, then the
// sandbox notes and any question answers.
//
// A chain has no single author or time — it is several people's cards read end to end — so
// those two cells are deliberately blank rather than filled with the root's. The per-card
// authorship is in the JSON export; inventing one here would misattribute the chain.
export function implicationsCsvRows(ex: ImplicationsExercise): string[][] {
  const rows: string[][] = [];
  const teamId = ex.cards[0]?.teamId ?? "";
  for (const c of enumerateChains(ex.cards, [], teamId)) {
    rows.push([ex.title, "Implication chain", "implications", c.chain.join(" → "), "", ""]);
  }
  for (const n of ex.brainstorm) {
    rows.push([ex.title, "Brainstorm", "brainstorm", n.text, n.author, n.createdAt]);
  }
  for (const q of ex.questions) {
    for (const a of q.answers) {
      rows.push([ex.title, q.label || q.key, q.kind, a.text, a.author, a.createdAt]);
    }
  }
  return rows;
}

// A commitments week: the aspiration prompts, the response wall with its bold moves
// starred, then each move's timeline a period at a time.
//
// A bold move is NOT given a row of its own. It is a response carrying `shortlisted`, and
// emitting it twice would double every picked move in a count. The star in the Kind cell
// is how the sheet says which three were chosen, the same way synthesisCsvRows marks a
// shortlisted risk.
//
// Empty period cells emit nothing, because a CSV row per empty cell is noise — but the
// period's label rides every milestone row, so where a lane clustered and where it left a
// gap is still readable from the sheet alone.
export function commitmentsCsvRows(ex: CommitmentsExercise): string[][] {
  const rows: string[][] = [];
  for (const q of ex.questions) {
    for (const a of q.answers) {
      rows.push([ex.title, q.label || q.key, q.kind, a.text, a.author, a.createdAt]);
    }
  }
  for (const r of ex.responses) {
    rows.push([
      ex.title,
      "Strategic responses",
      r.shortlisted ? "response ★" : "response",
      r.text,
      r.author,
      r.createdAt,
    ]);
  }
  for (const lane of ex.lanes) {
    for (const cell of lane.periods) {
      for (const m of cell.milestones) {
        // The move's text rides each row: a milestone read on its own says when something
        // happens but not what it is a step towards.
        rows.push([
          ex.title,
          `Timeline · ${cell.label}`,
          "milestone",
          `${lane.move.text} — ${m.text}`,
          m.author,
          m.createdAt,
        ]);
      }
    }
  }
  // Work the group has not lost but cannot currently see, and work the board could not
  // place. Both belong in the export: a facilitator reading the sheet should find out here
  // rather than discovering a gap later.
  for (const m of ex.stranded) {
    rows.push([ex.title, "Timeline · move not picked", "milestone", m.text, m.author, m.createdAt]);
  }
  for (const o of ex.orphans) {
    rows.push([ex.title, "Unplaced", "orphan", o.text, o.author, o.createdAt]);
  }
  return rows;
}

// One week, whichever kind it is. See the header comment for why the exhaustive default
// matters more than it looks.
export function exerciseCsvRows(ex: ExerciseAnswers): string[][] {
  switch (ex.kind) {
    case "worksheet":
      return worksheetCsvRows(ex);
    case "implications":
      return implicationsCsvRows(ex);
    case "synthesis":
      return synthesisCsvRows(ex);
    case "commitments":
      return commitmentsCsvRows(ex);
    // A week with no board has nothing to export. Not an error: a facilitator can set any
    // week to "To be designed", and a group's later weeks sit there until they are built.
    case "placeholder":
      return [];
    default: {
      const never: never = ex;
      throw new Error(
        `exerciseCsvRows: unhandled exercise kind ${JSON.stringify((never as { kind?: unknown }).kind)}`
      );
    }
  }
}
