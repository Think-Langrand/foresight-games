"use client";

import { buildGrid, type CohortClusterResponse } from "@/lib/analysis/cohort-cluster-shape";

// Themes down, groups across. The centrepiece of a cohort run, and the one view that
// answers all three questions a facilitator brings to it:
//
//   a row lit across every column  → the theme to open the plenary with
//   a row lit in one column        → the room that stood alone, which is a finding
//   a dark cell                    → that group never went there
//
// The last reading is why a cell carries the group's STATE as well as its count. A zero
// from a group that worked the board means "they never raised this"; a zero from a group
// with no board means the run simply could not see them. Printing both as "0" would
// manufacture a finding out of a gap in the data.

export function CohortGrid({
  run,
  onPickTheme,
}: {
  run: CohortClusterResponse;
  onPickTheme?: (themeIndex: number) => void;
}) {
  const grid = buildGrid(run.themes, run.groups);
  if (grid.length === 0) return null;

  const contributing = run.groups.filter((g) => g.state === "ok").length;
  // Scenario titles only earn a line in the header when they actually differ — and when
  // they do, convergence across them is a materially stronger finding than within one.
  const scenarios = new Set(run.groups.map((g) => g.scenarioTitle ?? ""));
  const showScenario = scenarios.size > 1;
  const busiest = Math.max(1, ...run.themes.flatMap((t) => t.byGroup.map((b) => b.count)));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left align-bottom text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
              Theme
            </th>
            {run.groups.map((g) => (
              <th
                key={g.id}
                className="px-1.5 py-1.5 align-bottom text-left text-[11px] font-bold leading-[1.25]"
                style={{ minWidth: "5.5rem" }}
              >
                <span className={g.state === "ok" ? "" : "text-muted line-through"}>{g.name}</span>
                {showScenario && g.scenarioTitle && (
                  <span className="mt-0.5 block text-[10px] font-normal uppercase tracking-[0.05em] text-muted">
                    {g.scenarioTitle}
                  </span>
                )}
                <span className="mt-0.5 block text-[10px] font-normal normal-case text-muted">
                  {g.state === "ok"
                    ? `${g.itemCount} impl.`
                    : g.state === "empty"
                      ? "board empty"
                      : "no board"}
                </span>
              </th>
            ))}
            <th className="px-1.5 py-1.5 align-bottom text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
              Rooms
            </th>
          </tr>
        </thead>
        <tbody>
          {grid.map((row) => {
            const theme = run.themes[row.themeIndex];
            const everyone = contributing > 1 && theme.groupCount === contributing;
            const alone = theme.groupCount === 1;
            return (
              <tr key={row.themeIndex} className="border-t border-[var(--hairline)]">
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-[26rem] bg-card px-2 py-2 text-left align-top font-normal"
                >
                  <button
                    type="button"
                    onClick={() => onPickTheme?.(row.themeIndex)}
                    className="text-left text-[12.5px] font-bold leading-[1.35] hover:underline"
                  >
                    {theme.label}
                  </button>
                </th>
                {row.cells.map((c) => (
                  <td
                    key={c.groupId}
                    title={
                      c.state === "missing"
                        ? "This group had no board at this week — not in the run."
                        : c.state === "empty"
                          ? "This group's board had no implications."
                          : c.count === 0
                            ? "This group never raised this theme."
                            : `${c.count} implication${c.count === 1 ? "" : "s"}`
                    }
                    className="px-1.5 py-2 text-center align-middle"
                  >
                    {c.state !== "ok" ? (
                      <span className="text-[13px] text-muted opacity-40">·</span>
                    ) : c.count === 0 ? (
                      <span className="text-[13px] text-muted opacity-30">—</span>
                    ) : (
                      <span
                        className="inline-block min-w-[1.6rem] rounded-[2px] px-1 py-0.5 text-[12px] font-bold"
                        style={{
                          backgroundColor: `color-mix(in srgb, var(--lime) ${Math.round(
                            25 + (75 * c.count) / busiest
                          )}%, transparent)`,
                        }}
                      >
                        {c.count}
                      </span>
                    )}
                  </td>
                ))}
                <td className="whitespace-nowrap px-1.5 py-2 text-center text-[11px] font-bold">
                  <span
                    className={
                      everyone
                        ? "rounded-[2px] bg-ink px-1.5 py-0.5 text-paper"
                        : alone
                          ? "rounded-[2px] border border-coral px-1.5 py-0.5 text-coral"
                          : "text-muted"
                    }
                  >
                    {theme.groupCount}/{contributing}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11px] italic text-muted">
        <span className="font-bold not-italic">—</span> this group never raised the theme ·{" "}
        <span className="font-bold not-italic">·</span> this group was not in the run ·{" "}
        a boxed ratio means every contributing room raised it, an outlined one means a single room did.
      </p>
    </div>
  );
}
