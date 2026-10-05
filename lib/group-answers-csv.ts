import type { SynthesisExercise } from "@/components/design-groups/AnswerPanels";

// The synthesis week's rows for the facilitator's CSV export, as raw cells.
//
// Pure and separate from the export button because this is the one consumer of
// ExerciseAnswers with no safety net at all: it pushes untyped string arrays, so adding a
// card kind neither fails to compile nor fails a test — it just silently drops that kind
// from the export the facilitator takes into the next workshop. Four kinds went missing
// this way before it was extracted.
//
// Columns match the sheet's header: Week, Section, Kind, Content, Author, Created.

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
      rows.push([ex.title, section, "concerns", `${arrow}↳ ${c.concerns}`, c.author, c.createdAt]);
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
