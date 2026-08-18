import type { DriverSource } from "@/lib/foresight/types";

// A driver's "signals" — the source articles behind it, evidence it's already
// showing up in the world. Shows up to `max` (default 3). Renders nothing when the
// driver has no sources. Shared, dependency-free: used on the /drivers page (server)
// and in the scenario Drivers tab (client).
export function DriverSignals({ sources, max = 3 }: { sources?: DriverSource[]; max?: number }) {
  const shown = (sources ?? []).slice(0, max);
  if (shown.length === 0) return null;
  return (
    <div className="mt-3 border-t border-[var(--hairline)] pt-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">Signals</div>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {shown.map((s) => (
          <li key={s.id} className="text-[12px] leading-[1.4]">
            {s.url ? (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue hover:underline"
              >
                {s.title}
              </a>
            ) : (
              <span className="font-medium">{s.title}</span>
            )}
            {s.publisher && <span className="text-muted"> · {s.publisher}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
