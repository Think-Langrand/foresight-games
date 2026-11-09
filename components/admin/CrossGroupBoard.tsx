"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { csvCell, download } from "@/components/admin/exportUtils";
import {
  CROSS_GROUP_FIELD_CSV_HEADER,
  allFieldsCsvRows,
  fieldCsvRows,
  uncertaintyCsvRows,
} from "@/lib/cross-group-csv";
import type {
  CrossGroupCell,
  CrossGroupColumn,
  CrossGroupField,
  NotShownBucket,
} from "@/lib/cross-group-shape";
import type { UncertaintyGrid } from "@/lib/cross-group-uncertainties-shape";
import { CrossGroupUncertainties } from "@/components/admin/CrossGroupUncertainties";

// Every design group's answers to ONE field, side by side. A chip row picks the field; the
// groups fill the screen as equal columns in the project's own order, so Group 1 is always
// leftmost.
//
// READ-ONLY. Nothing here writes a card. The per-group answers viewer is where answers get
// edited; this page is for reading across.
//
// The selected chip lives in the URL so a view can be shared, but every field's columns are
// already in props — switching chips is a filter, not a fetch.

export const UNCERTAINTIES_FIELD_ID = "uncertainties";

export interface CrossGroupBoardProps {
  slug: string;
  projectName: string;
  exportedAt: string;
  fields: CrossGroupField[];
  columns: Record<string, CrossGroupColumn[]>;
  groups: { groupId: string; groupName: string; color: string | null; scenarioTitle: string | null }[];
  grid: UncertaintyGrid | null;
  gridReason: string | null;
  warnings: string[];
  notShown: Record<string, Record<NotShownBucket, number>>;
}

const CHIP =
  "rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.05em] transition-colors";
const BTN =
  "rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime disabled:opacity-40";

// Long answers truncate to roughly four lines; the whole text is one click away. A board
// that clipped without saying so would be the quiet-omission failure in miniature.
const CLAMP = 4;

// Plain words for the buckets no chip reaches, so the note reads as a sentence rather than
// as field names from a shape module. Singular and plural, because "1 outcomes" is the kind
// of seam that makes a page look unfinished.
const BUCKET_LABELS: Record<string, [one: string, many: string]> = {
  parked: ["card parked", "cards parked"],
  unclustered: ["unclustered implication", "unclustered implications"],
  chain: ["hope or fear on a theme (older boards)", "hopes & fears on themes (older boards)"],
  orphans: ["unplaceable card", "unplaceable cards"],
  strayOutcomes: [
    "outcome under a replaced priority",
    "outcomes under a replaced priority",
  ],
  strandedMilestones: ["stranded milestone", "stranded milestones"],
  looseResponses: [
    "response from the old untagged wall",
    "responses from the old untagged wall",
  ],
};

const bucketLabel = (key: string, n: number): string => {
  const pair = BUCKET_LABELS[key];
  return pair ? (n === 1 ? pair[0] : pair[1]) : key;
};

function warningCopy(w: string): string {
  if (w === "programDivergent") {
    return "These groups are NOT running the same program — they differ in week count, type, title or question keys. Weeks line up by position here, so two columns under one chip may be two different sessions. Check before reading across.";
  }
  if (w.startsWith("noBoards:")) {
    const n = Number(w.slice("noBoards:".length)) + 1;
    return `Week ${n} is in the program but no group has opened a board for it yet, so it offers no chips. Said out loud because a week that simply vanished from the row would look like a week that was never scheduled.`;
  }
  const week = Number(w.slice("unknownWeek:".length)) + 1;
  return `Week ${week} has a type this board does not know, so it offers no chips. Its answers are still on the group's own page.`;
}

// The group's colour is passed in and used ONLY on the 2px edge. It used to be set as
// `color` on the column and inherited down, which put 12px body prose in the group colour:
// amber measured 1.95:1 and teal 2.94:1 against --card, where WCAG AA wants 4.5:1. Half the
// board was a pale wash. The spec's "cards in the group's colour" is carried by the edge and
// the column header; it was never a reason to tint the answers themselves.
function Cell({ cell, color }: { cell: CrossGroupCell; color: string }) {
  const [open, setOpen] = useState(false);
  const long = cell.text.length > 180;
  return (
    <div className="mb-1.5 rounded-[3px] border-l-2 bg-card px-2 py-1.5" style={{ borderColor: color }}>
      {cell.tag && (
        <span className="mb-1 inline-block rounded-[2px] bg-[var(--rule)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-muted">
          {cell.tag}
        </span>
      )}
      <p
        className="text-[12px] leading-[1.4] text-ink"
        style={open || !long ? undefined : { display: "-webkit-box", WebkitLineClamp: CLAMP, WebkitBoxOrient: "vertical", overflow: "hidden" }}
      >
        {cell.text}
      </p>
      {long && (
        <button onClick={() => setOpen(!open)} className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-blue">
          {open ? "Less" : "More"}
        </button>
      )}
      {(cell.note || cell.author) && (
        <p className="mt-1 text-[9.5px] uppercase tracking-[0.04em] text-muted">
          {[cell.note, cell.author].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

function Column({ column }: { column: CrossGroupColumn }) {
  const color = column.color ?? "var(--rule)";
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2 border-b-2 pb-1" style={{ borderColor: color }}>
        <span className="h-2 w-2 flex-none rounded-[2px]" style={{ background: color }} />
        <span className="truncate text-[11px] font-bold uppercase tracking-[0.04em] text-ink">
          {column.groupName}
        </span>
        <span className="ml-auto flex-none text-[10px] text-muted">{column.cells.length}</span>
      </div>
      {column.state === "no-week" ? (
        <p className="text-[11px] italic text-muted">No such week for this group.</p>
      ) : column.state === "no-board" ? (
        <p className="text-[11px] italic text-muted">This week has no board for this group.</p>
      ) : column.cells.length === 0 ? (
        <p className="text-[11px] italic text-muted">Nothing written here.</p>
      ) : (
        column.cells.map((c) => <Cell key={c.id} cell={c} color={color} />)
      )}
    </div>
  );
}

export function CrossGroupBoard(props: CrossGroupBoardProps) {
  const { slug, projectName, exportedAt, fields, columns, groups, grid, gridReason, warnings, notShown } =
    props;
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const requested = search.get("field");
  const active = fields.find((f) => f.id === requested) ?? fields[0] ?? null;

  const primary = fields.filter((f) => f.tier === "primary");
  const overflow = fields.filter((f) => f.tier === "overflow");

  const select = (id: string) => {
    const next = new URLSearchParams(search.toString());
    next.set("field", id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const activeColumns = useMemo(
    () => (active && active.id !== UNCERTAINTIES_FIELD_ID ? columns[active.id] ?? [] : []),
    [active, columns]
  );

  // One line per group that has material outside every field, naming the buckets.
  const notShownTotals = useMemo(
    () =>
      groups
        .map((g) => {
          const buckets = notShown[g.groupId] ?? {};
          const present = Object.entries(buckets).filter(([, n]) => n > 0);
          return {
            groupId: g.groupId,
            groupName: g.groupName,
            total: present.reduce((a, [, n]) => a + n, 0),
            detail: present.map(([k, n]) => `${n} ${bucketLabel(k, n)}`).join(", "),
          };
        })
        .filter((g) => g.total > 0),
    [groups, notShown]
  );

  // Rows come from lib/cross-group-csv, built out of the very columns on screen, so the
  // sheet and the page cannot disagree. The file is stamped with the export's own timestamp
  // rather than "now", because that is the moment it actually shows.
  const stamp = exportedAt.slice(0, 10);
  const write = (header: readonly string[], rows: string[][], name: string) => {
    const lines = [header.map(csvCell).join(",")];
    for (const r of rows) lines.push(r.map(csvCell).join(","));
    // Leading BOM so Excel reads it as UTF-8, matching the other admin exports.
    download("﻿" + lines.join("\n"), name, "text/csv;charset=utf-8");
  };

  const downloadThisField = () => {
    if (!active) return;
    if (active.id === UNCERTAINTIES_FIELD_ID) {
      if (!grid) return;
      const { header, rows } = uncertaintyCsvRows(grid, groups);
      write(header, rows, `${slug}-uncertainties-${stamp}.csv`);
      return;
    }
    const slugged = active.fieldKey.replace(/[^a-z0-9]+/gi, "-");
    write(
      CROSS_GROUP_FIELD_CSV_HEADER,
      fieldCsvRows(active, columns[active.id] ?? []),
      `${slug}-${slugged}-${stamp}.csv`
    );
  };

  const downloadAllFields = () =>
    write(
      CROSS_GROUP_FIELD_CSV_HEADER,
      allFieldsCsvRows(fields, columns),
      `${slug}-all-fields-${stamp}.csv`
    );

  return (
    <main className="mx-auto max-w-[1600px] px-6 py-10">
      <Link href={`/admin/projects/${slug}`} className="eyebrow blue">
        ← {projectName}
      </Link>
      <h1 className="mt-2 text-[26px] font-extrabold uppercase tracking-tight">Cross-group board</h1>
      <p className="mt-1 text-[13px] text-muted">
        One field at a time, every design group side by side. Read-only.
      </p>

      {warnings.map((w) => (
        <p key={w} className="mt-3 rounded-[3px] border border-coral bg-paper px-3 py-2 text-[12px] text-coral">
          {warningCopy(w)}
        </p>
      ))}

      {fields.length === 0 ? (
        <p className="mt-8 text-[14px] italic text-muted">
          This project has no design groups with boards yet, so there is nothing to compare.
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-[var(--rule)] pb-4">
            {primary.map((f) => {
              const on = f.id === active?.id;
              const total = Object.values(f.counts).reduce((a, b) => a + b, 0);
              return (
                <button
                  key={f.id}
                  onClick={() => select(f.id)}
                  aria-pressed={on}
                  className={
                    CHIP +
                    (on
                      ? " border-ink bg-ink text-paper"
                      : " border-[var(--rule)] text-muted hover:border-ink hover:text-ink")
                  }
                >
                  {f.label}
                  <span className={"ml-1.5 font-normal " + (on ? "opacity-70" : "opacity-50")}>{total}</span>
                </button>
              );
            })}
            <div className="ml-auto flex gap-2">
              <button
                onClick={downloadThisField}
                className={BTN}
                // Nothing to write when the grid failed to load, and a button that does
                // nothing on click is worse than one that is visibly unavailable.
                disabled={active?.id === UNCERTAINTIES_FIELD_ID && !grid}
              >
                This field · CSV
              </button>
              <button onClick={downloadAllFields} className={BTN}>
                All fields · CSV
              </button>
            </div>
          </div>

          {overflow.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.05em] text-blue">
                More fields ({overflow.length})
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {overflow.map((f) => {
                  const on = f.id === active?.id;
                  const total = Object.values(f.counts).reduce((a, b) => a + b, 0);
                  return (
                    <button
                      key={f.id}
                      onClick={() => select(f.id)}
                      aria-pressed={on}
                      className={
                        CHIP +
                        (on
                          ? " border-ink bg-ink text-paper"
                          : " border-[var(--rule)] text-muted hover:border-ink hover:text-ink")
                      }
                    >
                      {f.label}
                      <span className={"ml-1.5 font-normal " + (on ? "opacity-70" : "opacity-50")}>{total}</span>
                    </button>
                  );
                })}
              </div>
            </details>
          )}

          <div className="mt-5">
            {active?.weekTitle && (
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                {/* The label already ends with the week title when two weeks collided on it,
                    so appending it again printed the session name twice in a row. */}
                {active.label.endsWith(active.weekTitle)
                  ? active.label
                  : `${active.label} · ${active.weekTitle}`}
              </p>
            )}
            {active?.id === UNCERTAINTIES_FIELD_ID ? (
              <CrossGroupUncertainties grid={grid} groups={groups} reason={gridReason} />
            ) : (
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: `repeat(${Math.max(activeColumns.length, 1)}, minmax(0, 1fr))` }}
              >
                {activeColumns.map((col) => (
                  <Column key={col.groupId} column={col} />
                ))}
              </div>
            )}
          </div>

          {/* The spec's first anti-goal applies to what this board does NOT show. These
              cards are preserved by the week shapes precisely so nothing is lost; a board
              that failed to mention them would re-commit the omission those lists exist to
              prevent. Named here, with where to go for them. */}
          {notShownTotals.length > 0 && (
            <details className="mt-6 rounded-[3px] border border-[var(--rule)] bg-paper px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.05em] text-blue">
                Not shown on this page ({notShownTotals.reduce((a, b) => a + b.total, 0)} cards)
              </summary>
              <p className="mt-2 text-[11.5px] text-muted">
                These sit outside every field above — a group&rsquo;s parked tray, cards the
                board could not place, work under a priority that was later replaced. They
                are on each group&rsquo;s own answers page, not lost.
              </p>
              <ul className="mt-2 space-y-0.5">
                {notShownTotals.map((g) => (
                  <li key={g.groupId} className="text-[11px]">
                    <Link
                      href={`/admin/projects/${slug}/design-groups/${g.groupId}/answers`}
                      className="font-bold text-blue hover:underline"
                    >
                      {g.groupName}
                    </Link>
                    <span className="text-muted"> — {g.detail}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="mt-8 border-t border-[var(--rule)] pt-3 text-[11px] text-muted">
            Read from the project&rsquo;s boards at {new Date(exportedAt).toLocaleString()}. Reload
            for a fresher read.
          </p>
        </>
      )}
    </main>
  );
}
