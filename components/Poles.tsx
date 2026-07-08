// The A <-> B axis line with arrowheads used for an uncertainty's poles.
export function Poles({ a, b }: { a: string; b: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="max-w-[44%] overflow-hidden text-ellipsis whitespace-nowrap text-[9.5px] font-bold uppercase leading-[1.25] tracking-[0.08em] text-muted">
        {a}
      </span>
      <span className="pole-line relative h-px flex-1 bg-ink" />
      <span className="max-w-[44%] overflow-hidden text-ellipsis whitespace-nowrap text-right text-[9.5px] font-bold uppercase leading-[1.25] tracking-[0.08em] text-muted">
        {b}
      </span>
    </div>
  );
}
