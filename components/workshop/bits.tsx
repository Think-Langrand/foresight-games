"use client";

// Small presentational bits for workshop result displays.

export function Avg({ value, max = 5 }: { value: number | null; max?: number }) {
  if (value === null) return <span className="text-muted">—</span>;
  const pct = Math.max(0, Math.min(1, (value - 1) / (max - 1)));
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative h-2 w-24 overflow-hidden rounded-full bg-[rgba(36,36,34,0.1)]">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-lime-deep"
          style={{ width: `${pct * 100}%` }}
        />
      </span>
      <span className="text-[13px] font-bold tabular-nums">{value.toFixed(1)}</span>
    </span>
  );
}

// 1..max distribution as a row of proportional cells.
export function Dist({
  dist,
  max = 5,
  color = "var(--blue)",
}: {
  dist: Record<number, number>;
  max?: number;
  color?: string;
}) {
  const counts = Array.from({ length: max }, (_, i) => dist[i + 1] ?? 0);
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <div className="flex items-end gap-1" title={`${total} votes`}>
      {counts.map((c, i) => {
        const h = total ? 6 + (c / Math.max(...counts, 1)) * 26 : 6;
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <div
              className="w-4 rounded-[1px]"
              style={{ height: h, background: c ? color : "rgba(36,36,34,0.12)" }}
            />
            <span className="text-[9px] font-bold text-muted">{i + 1}</span>
          </div>
        );
      })}
    </div>
  );
}

// Pole A <-> B stacked bar for the pole-lean poll.
export function PoleBar({
  a,
  neither,
  b,
  labelA,
  labelB,
}: {
  a: number;
  neither: number;
  b: number;
  labelA: string;
  labelB: string;
}) {
  const total = a + neither + b || 1;
  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden rounded-[2px] border border-[var(--hairline)]">
        <Seg n={a} total={total} color="var(--green)" />
        <Seg n={neither} total={total} color="var(--gray)" />
        <Seg n={b} total={total} color="var(--coral)" />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
        <span>
          {labelA} · {a}
        </span>
        <span>neither · {neither}</span>
        <span>
          {b} · {labelB}
        </span>
      </div>
    </div>
  );
}

function Seg({ n, total, color }: { n: number; total: number; color: string }) {
  const pct = (n / total) * 100;
  if (pct === 0) return null;
  return (
    <div
      className="flex items-center justify-center text-[11px] font-bold text-white"
      style={{ width: `${pct}%`, background: color }}
    >
      {pct > 8 ? n : ""}
    </div>
  );
}
