import type { PublicOutcome, PublicUncertainty, Scenario } from "@/lib/foresight/types";

// The uncertainty grid: the one field on the cross-group board where the columns line up
// row for row.
//
// WHY THIS ONE IS A GRID AND NOTHING ELSE IS. Every other field is four independent lists —
// four groups' own risks, their own themes, their own moves — and a row across them means
// nothing. Here the four scenarios answer the SAME uncertainty, so a row is a real
// comparison: who agrees, who diverges, who has taken no position.
//
// IT IS NOT GROUP ANSWER DATA. A scenario resolves the project's uncertainties, and each
// group worked exactly one scenario, so this maps 1:1 onto the columns without anyone
// having written anything on a board.
//
// THE JOIN IS A TITLE STRING, DELIBERATELY. `Scenario.linkedUncertainties[].uncertaintyId`
// is a UUID; `PublicUncertainty.id` is the code/slug and carries no UUID at all. The only
// key the two payloads share is the human title, and marking the chosen option needs a
// second string match of `resolution` against `PublicOutcome.title`. Both hold in live data
// today (checked 2026-11-09: zero unmatched across all four scenarios). Asking the platform
// to return the code on `linkedUncertainties` is the right long-term fix and is out of
// scope here — so when a match fails, the row says so rather than disappearing.

export interface UncertaintyCell {
  // null = this group has taken no position. An ABSENT link and a link whose resolution is
  // the empty string are both "not resolved": the second is a real live state (an
  // uncertainty attached in Lanscan with the outcome never chosen) and it is
  // indistinguishable from the first for a reader of this grid.
  resolution: string | null;
  options: PublicOutcome[]; // the full option set, for the expanded row
  chosen: string | null; // the matched PublicOutcome.title, null if nothing matched
}

export interface UncertaintyRow {
  id: string;
  title: string;
  question: string;
  unmatched: boolean; // a published resolution with no catalogue row behind it
  agreed: boolean; // two or more groups landed on the same resolution
  cells: Record<string, UncertaintyCell>; // groupId -> cell
}

export interface UncertaintyGrid {
  rows: UncertaintyRow[];
  // Groups with no usable resolution anywhere. They get ONE column-level note rather than
  // the same "not resolved" repeated down every row, which reads as a data problem instead
  // of the one fact it is.
  emptyGroups: string[];
}

export interface UncertaintyGridInput {
  catalogue: PublicUncertainty[];
  scenarios: { groupId: string; scenario: Scenario | null }[];
}

/** A resolution that actually says something, or null. */
function resolved(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  return text === "" ? null : text;
}

export function buildUncertaintyGrid(input: UncertaintyGridInput): UncertaintyGrid {
  const { catalogue, scenarios } = input;
  const groupIds = scenarios.map((s) => s.groupId);

  // title -> groupId -> resolution, for every resolution that says something.
  const byTitle = new Map<string, Map<string, string>>();
  for (const { groupId, scenario } of scenarios) {
    for (const link of scenario?.linkedUncertainties ?? []) {
      const text = resolved(link.resolution);
      if (!text) continue;
      const row = byTitle.get(link.title);
      if (row) row.set(groupId, text);
      else byTitle.set(link.title, new Map([[groupId, text]]));
    }
  }

  const cellsFor = (title: string, options: PublicOutcome[]): Record<string, UncertaintyCell> => {
    const positions = byTitle.get(title);
    const cells: Record<string, UncertaintyCell> = {};
    for (const groupId of groupIds) {
      const resolution = positions?.get(groupId) ?? null;
      cells[groupId] = {
        resolution,
        // Carried even on an unresolved cell, so expanding a row shows the same options
        // whichever group's cell you opened it from.
        options,
        chosen: options.find((o) => o.title === resolution)?.title ?? null,
      };
    }
    return cells;
  };

  // Two or more groups on the same resolution — the thing the grid exists to show.
  const agreedOn = (title: string): boolean => {
    const values = [...(byTitle.get(title)?.values() ?? [])];
    return new Set(values).size < values.length;
  };

  // Catalogue rows, in the project's own order, filtered to the ones SOMEBODY resolved.
  // Tom's call, after seeing that four of the thirteen carry no position from any group:
  // this is a reading surface, not a completeness audit, and dead rows are noise.
  const rows: UncertaintyRow[] = catalogue
    .filter((u) => byTitle.has(u.title))
    .sort((a, b) => a.number - b.number)
    .map((u) => ({
      id: u.id,
      title: u.title,
      question: u.question,
      unmatched: false,
      agreed: agreedOn(u.title),
      cells: cellsFor(u.title, u.outcomes),
    }));

  // A resolution the groups published that no catalogue row explains. Appended rather than
  // dropped: the title join is a string match, and silently swallowing a position the
  // groups took is the one thing this board must never do.
  const known = new Set(catalogue.map((u) => u.title));
  for (const title of byTitle.keys()) {
    if (known.has(title)) continue;
    rows.push({
      id: title,
      title,
      question: "",
      unmatched: true,
      agreed: agreedOn(title),
      cells: cellsFor(title, []),
    });
  }

  const emptyGroups = groupIds.filter((groupId) =>
    rows.every((r) => r.cells[groupId]?.resolution === null)
  );

  return { rows, emptyGroups };
}
