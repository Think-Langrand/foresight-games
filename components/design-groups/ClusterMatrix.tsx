// How a group's implications regrouped: themes down, the key changes they came from across.
//
// WHY A MATRIX AND NOT A SANKEY. A flow diagram was the first instinct and it is the wrong
// form at this density. Group 1 sends 146 implications from 3 key changes into 7 themes along
// 20 ribbons — 95% of the possible pairs — so nearly every source feeds nearly every target
// and the ribbons become spaghetti that says "everything connects to everything" while being
// unreadable. A matrix states the same thing exactly: every cell carries its count, the shade
// gives the row's shape at a glance, and it stays legible from 3x3 to 6x7. It is also the
// form this codebase already uses for "themes down, sources across" (RobustnessSpine).
//
// THE SPREAD COLUMN IS THE POINT. A theme fed by one key change is that key change
// relabelled; a theme fed by four is a synthesis the room actually built. That number is
// what a reader should take away, so it gets its own column rather than being left implicit
// in the shading.
//
// Themes keep their board order and lettering, so this slide and the themes slide agree
// about which theme is which — RobustnessSpine sorts by spread because ordering is its
// argument; here it would desync two slides.

import type { ClusterFlow } from "@/lib/group-summary";
import { CONVERGENCE_STEPS, shadeFor } from "@/lib/analysis/cohort-palette";

const trunc = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};

export default function ClusterMatrix({ flow }: { flow: ClusterFlow }) {
  const { keyChanges, themes, links } = flow;
  if (!keyChanges.length || !themes.length) return null;

  const at = new Map(links.map((l) => [`${l.sourceId}:${l.themeIndex}`, l.count]));
  const cell = (kcId: string, ti: number) => at.get(`${kcId}:${ti}`) ?? 0;
  const rowMax = (ti: number) => Math.max(0, ...keyChanges.map((k) => cell(k.id, ti)));
  const spread = (ti: number) => keyChanges.filter((k) => cell(k.id, ti) > 0).length;

  // A theme nothing was filed into is a label with no marks, so it gets no row — the same
  // reason a key change with no flow gets no column. The letter stays the one the themes
  // slide gave it, so dropping a row skips a letter rather than renaming the rest.
  const hasFlow = (ti: number) => keyChanges.some((k) => cell(k.id, ti) > 0);
  const rows = themes
    .map((t, ti) => ({ t, ti, letter: String.fromCharCode(65 + ti) }))
    .filter(({ ti }) => hasFlow(ti));
  if (!rows.length) return null;

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">
          Implications per theme by the key change they came from, with how many key changes
          each theme drew on.
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 border-b border-ink bg-paper px-2 py-2 text-left align-bottom font-mono text-[9.5px] font-normal uppercase tracking-[0.12em] text-muted"
            >
              Theme
            </th>
            {keyChanges.map((k) => (
              <th
                key={k.id}
                scope="col"
                title={k.label}
                className="border-b border-ink px-2 py-2 align-bottom text-left text-[11px] font-bold leading-[1.25]"
              >
                {trunc(k.label, 22)}
                <span className="mt-1 block font-mono text-[9.5px] font-normal tabular-nums text-muted">
                  {k.total}
                </span>
              </th>
            ))}
            <th
              scope="col"
              className="border-b border-ink px-2 py-2 align-bottom text-right font-mono text-[9.5px] font-normal uppercase tracking-[0.12em] text-muted"
            >
              Drew on
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ t, ti, letter }) => {
            const max = rowMax(ti);
            const sp = spread(ti);
            return (
              <tr key={t.id}>
                <th
                  scope="row"
                  title={t.label}
                  className="sticky left-0 z-10 max-w-[30ch] border-b border-[var(--hairline)] bg-paper px-2 py-2 text-left align-middle text-[13px] font-normal leading-[1.3]"
                >
                  <span className="mr-2 font-mono text-[10px] font-bold text-blue">
                    {letter}
                  </span>
                  {trunc(t.label, 48)}
                </th>
                {keyChanges.map((k) => {
                  const n = cell(k.id, ti);
                  const fill = shadeFor(n, max);
                  const step = CONVERGENCE_STEPS.indexOf(fill as (typeof CONVERGENCE_STEPS)[number]);
                  return (
                    <td
                      key={k.id}
                      title={`${n} ${n === 1 ? "implication" : "implications"} — ${trunc(k.label, 40)} → ${trunc(t.label, 40)}`}
                      className="border-b border-[var(--hairline)] p-[3px] text-center align-middle"
                    >
                      {/* A 2px gap between fills, so adjacent cells read as separate marks
                          rather than one band. */}
                      <span
                        className="flex h-8 items-center justify-center rounded-[2px] font-mono text-[12px] tabular-nums"
                        style={{
                          background: fill,
                          // Text wears an ink token on the pale steps and paper on the dark
                          // ones; never the series colour.
                          color: step >= 3 ? "var(--paper)" : n > 0 ? "var(--ink)" : "var(--muted)",
                        }}
                      >
                        {n > 0 ? n : "·"}
                      </span>
                    </td>
                  );
                })}
                <td className="border-b border-[var(--hairline)] px-2 py-2 text-right">
                  <span className="font-mono text-[12px] tabular-nums">
                    {sp}
                    <span className="text-muted"> / {keyChanges.length}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
          Fewer
          {CONVERGENCE_STEPS.slice(1).map((c) => (
            <span
              key={c}
              className="inline-block h-3 w-5 rounded-[2px] border border-[var(--hairline)]"
              style={{ background: c }}
            />
          ))}
          More, within a row
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
          · = none
        </span>
        {flow.untraced > 0 && (
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-coral">
            {flow.untraced} filed without a traceable source
          </span>
        )}
      </div>
    </div>
  );
}
