"use client";

import { useState } from "react";
import type { UncertaintyGrid, UncertaintyRow } from "@/lib/cross-group-uncertainties-shape";

// The uncertainty grid: a real grid, not four columns of cards.
//
// WHY IT LOOKS DIFFERENT FROM EVERY OTHER FIELD. Here the four scenarios answer the SAME
// question, so a ROW is the unit of meaning — who agrees, who diverges, who has taken no
// position. Rendering it as four independent lists would throw away the only alignment this
// board has.

export interface CrossGroupUncertaintiesProps {
  grid: UncertaintyGrid | null;
  groups: { groupId: string; groupName: string; color: string | null }[];
  reason: string | null;
}

function Row({
  row,
  groups,
}: {
  row: UncertaintyRow;
  groups: CrossGroupUncertaintiesProps["groups"];
}) {
  const [open, setOpen] = useState(false);
  // Options are the same for every group on a row, so take them from whichever cell has
  // them — an unresolved cell carries them too, which is why the row expands identically
  // whoever's cell you opened it from.
  const options = groups.map((g) => row.cells[g.groupId]?.options ?? []).find((o) => o.length > 0) ?? [];

  return (
    <>
      <tr
        className={
          "border-t border-[var(--rule)] align-top " +
          (row.agreed ? "shadow-[inset_3px_0_0_var(--ink)]" : "")
        }
      >
        <th scope="row" className="py-2 pl-2 pr-3 text-left font-bold">
          {/* Only a button when there is something to expand: an unmatched row has no
              catalogue entry and therefore no options, and a control that toggles nothing is
              worse than plain text. */}
          <button
            onClick={() => setOpen(!open)}
            className="text-left text-[12px] font-bold leading-[1.3] hover:text-blue disabled:cursor-default disabled:hover:text-ink"
            aria-expanded={options.length > 0 ? open : undefined}
            disabled={options.length === 0}
          >
            {row.title}
            {row.unmatched && (
              <span className="ml-1.5 rounded-[2px] border border-coral px-1 text-[8.5px] font-bold uppercase tracking-[0.04em] text-coral">
                no catalogue row
              </span>
            )}
          </button>
          {row.question && (
            <span className="mt-0.5 block text-[10px] font-normal leading-[1.3] text-muted">
              {row.question}
            </span>
          )}
        </th>
        {groups.map((g) => {
          const cell = row.cells[g.groupId];
          // A resolution the catalogue does not offer as an option. The join between the two
          // payloads is a title string (see the shape module), so this is the shape a failed
          // match takes — and the spec is explicit that a failed match must be said out loud
          // in the cell rather than printed as though it were normal.
          const offMenu = Boolean(cell?.resolution) && cell?.chosen === null && !row.unmatched;
          return (
            <td key={g.groupId} className="py-2 pr-3 text-[11.5px] leading-[1.35]">
              {cell?.resolution ? (
                <>
                  <span>{cell.resolution}</span>
                  {offMenu && (
                    <span
                      className="ml-1 cursor-help border-b border-dotted border-coral text-[9px] font-bold uppercase tracking-[0.04em] text-coral"
                      title="This wording matches none of the options the uncertainty offers, so it could not be tied to one. It is shown exactly as the platform published it."
                    >
                      off-menu
                    </span>
                  )}
                </>
              ) : (
                <span className="italic text-muted opacity-50">not resolved</span>
              )}
            </td>
          );
        })}
      </tr>
      {open && options.length > 0 && (
        <tr className="bg-card">
          <td colSpan={groups.length + 1} className="px-2 pb-3 pt-1">
            <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-muted">
              Every option this uncertainty offers
            </p>
            <ul className="space-y-1">
              {options.map((o) => {
                const chosenBy = groups.filter((g) => row.cells[g.groupId]?.chosen === o.title);
                return (
                  <li key={o.code} className="text-[11px] leading-[1.35]">
                    <span className="font-bold">{o.title}</span>
                    <span className="ml-1.5 text-[9px] uppercase tracking-[0.04em] text-muted">
                      {o.code} · {o.role}
                    </span>
                    {chosenBy.length > 0 && (
                      <span className="ml-1.5 text-[9.5px] font-bold uppercase tracking-[0.04em]">
                        {chosenBy.map((g) => g.groupName).join(", ")}
                      </span>
                    )}
                    {o.description && (
                      <span className="block text-[10.5px] text-muted">{o.description}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

export function CrossGroupUncertainties({ grid, groups, reason }: CrossGroupUncertaintiesProps) {
  if (!grid) {
    return (
      <p className="text-[13px] italic text-muted">
        The uncertainty grid could not be loaded. {reason ?? ""} Every other field on this page
        is unaffected.
      </p>
    );
  }
  if (grid.rows.length === 0) {
    return (
      <p className="text-[13px] italic text-muted">
        No scenario has resolved any of this project&rsquo;s uncertainties yet, so there is
        nothing to compare. The grid fills itself once resolutions are published.
      </p>
    );
  }

  return (
    <>
      {/* One column-level note per group with no position anywhere, rather than the same
          "not resolved" repeated down every row — which reads as a data fault instead of
          the single fact it is. */}
      {grid.emptyGroups.length > 0 && (
        <p className="mb-3 rounded-[3px] border border-[var(--rule)] bg-paper px-3 py-2 text-[12px] text-muted">
          No resolutions published for{" "}
          <strong>
            {grid.emptyGroups
              .map((id) => groups.find((g) => g.groupId === id)?.groupName ?? id)
              .join(", ")}
          </strong>
          . Their scenarios may have uncertainties linked with no outcome chosen yet, which
          reads the same here as none linked at all.
        </p>
      )}
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b-2 border-ink">
            <th scope="col" className="w-[26%] py-2 pl-2 pr-3 text-[10px] font-bold uppercase tracking-[0.05em]">
              Uncertainty
            </th>
            {groups.map((g) => (
              <th
                key={g.groupId}
                scope="col"
                className="py-2 pr-3 text-[10px] font-bold uppercase tracking-[0.05em]"
              >
                <span className="mr-1.5 inline-block h-2 w-2 rounded-[2px]" style={{ background: g.color ?? "var(--rule)" }} />
                {g.groupName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((r) => (
            <Row key={r.id} row={r} groups={groups} />
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-muted">
        A bar on the left edge marks a row where two or more groups landed on the same
        resolution. Click an uncertainty to see every option it offers.
      </p>
    </>
  );
}
