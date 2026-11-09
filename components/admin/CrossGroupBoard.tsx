"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { csvCell, download } from "@/components/admin/exportUtils";
import type { CrossGroupCell, CrossGroupColumn, CrossGroupField } from "@/lib/cross-group-shape";
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
}

const CHIP =
  "rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.05em] transition-colors";
const BTN =
  "rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime disabled:opacity-40";

// Long answers truncate to roughly four lines; the whole text is one click away. A board
// that clipped without saying so would be the quiet-omission failure in miniature.
const CLAMP = 4;

function warningCopy(w: string): string {
  if (w === "programDivergent") {
    return "These groups are NOT running the same program — they differ in week count, type, title or question keys. Weeks line up by position here, so two columns under one chip may be two different sessions. Check before reading across.";
  }
  const week = w.startsWith("unknownWeek:") ? w.slice("unknownWeek:".length) : "?";
  return `Week ${Number(week) + 1} has a type this board does not know, so it offers no chips. Its answers are still on the group's own page.`;
}

function Cell({ cell }: { cell: CrossGroupCell }) {
  const [open, setOpen] = useState(false);
  const long = cell.text.length > 180;
  return (
    <div className="mb-1.5 rounded-[3px] border-l-2 bg-card px-2 py-1.5" style={{ borderColor: "inherit" }}>
      {cell.tag && (
        <span className="mb-1 inline-block rounded-[2px] bg-[var(--rule)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-muted">
          {cell.tag}
        </span>
      )}
      <p
        className="text-[12px] leading-[1.4]"
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
    <div className="min-w-0" style={{ color }}>
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
        column.cells.map((c) => <Cell key={c.id} cell={c} />)
      )}
    </div>
  );
}

export function CrossGroupBoard(props: CrossGroupBoardProps) {
  const { slug, projectName, exportedAt, fields, columns, groups, grid, gridReason, warnings } = props;
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

  // The CSV is built from the same columns on screen, so the sheet and the page cannot
  // disagree. It is a record of what this page loaded — stamped with the export's own
  // timestamp rather than "now", since that is what it actually shows.
  const stamp = exportedAt.slice(0, 10);
  const exportField = (field: CrossGroupField) => {
    const rows = (columns[field.id] ?? []).flatMap((col) =>
      col.cells.map((c) => [col.groupName, field.label, field.weekTitle ?? "", c.tag ?? "", c.text, c.author, c.createdAt])
    );
    return rows;
  };
  const HEADER = ["Group", "Field", "Week", "Tag", "Content", "Author", "Created"];
  const writeCsv = (rows: string[][], name: string) => {
    const lines = [HEADER.map(csvCell).join(",")];
    for (const r of rows) lines.push(r.map(csvCell).join(","));
    download("﻿" + lines.join("\n"), name, "text/csv;charset=utf-8");
  };

  const downloadThisField = () => {
    if (!active) return;
    if (active.id === UNCERTAINTIES_FIELD_ID && grid) {
      const header = ["Uncertainty", "Question", ...groups.map((g) => g.groupName)];
      const lines = [header.map(csvCell).join(",")];
      for (const r of grid.rows) {
        lines.push(
          [r.title, r.question, ...groups.map((g) => r.cells[g.groupId]?.resolution ?? "not resolved")]
            .map(csvCell)
            .join(",")
        );
      }
      download("﻿" + lines.join("\n"), `${slug}-uncertainties-${stamp}.csv`, "text/csv;charset=utf-8");
      return;
    }
    writeCsv(exportField(active), `${slug}-${active.fieldKey.replace(/[^a-z0-9]+/gi, "-")}-${stamp}.csv`);
  };

  const downloadAllFields = () => {
    const rows = fields.filter((f) => f.id !== UNCERTAINTIES_FIELD_ID).flatMap(exportField);
    writeCsv(rows, `${slug}-all-fields-${stamp}.csv`);
  };

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
              <button onClick={downloadThisField} className={BTN}>
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
                {active.label} · {active.weekTitle}
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

          <p className="mt-8 border-t border-[var(--rule)] pt-3 text-[11px] text-muted">
            Read from the project&rsquo;s boards at {new Date(exportedAt).toLocaleString()}. Reload
            for a fresher read.
          </p>
        </>
      )}
    </main>
  );
}
