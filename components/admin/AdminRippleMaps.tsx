import Link from "next/link";
import { PHASE_LABELS } from "@/lib/ripples-types";
import type { RippleMapSummary } from "@/lib/ripples";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Project admin: one card per started/submitted implication map (a Ripples session),
// linking to the existing /admin/s/[code] detail (which renders the full tree +
// reflection answers). Server-safe — no interactivity.
export function AdminRippleMaps({ maps }: { maps: RippleMapSummary[] }) {
  if (maps.length === 0) {
    return <p className="mt-3 text-[14px] text-muted">No implication maps started yet.</p>;
  }
  return (
    <div className="mt-3 grid gap-4 md:grid-cols-2">
      {maps.map((m) => (
        <article
          key={m.code}
          className="flex flex-col rounded-[3px] border border-[var(--hairline)] bg-card p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[16px] font-extrabold uppercase leading-[1.12] tracking-tight">
              {m.title || "Implication map"}
            </h3>
            <span className="shrink-0 rounded-[2px] bg-[var(--hairline)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
              {PHASE_LABELS[m.phase] ?? m.phase}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-muted">
            <span>
              {m.players} player{m.players === 1 ? "" : "s"} · {m.implications} implication
              {m.implications === 1 ? "" : "s"}
            </span>
            {m.submitted > 0 ? (
              <span className="rounded-[2px] bg-lime px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-ink">
                {m.submitted} submitted
              </span>
            ) : (
              <span className="text-muted">· 0 submitted</span>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-[var(--hairline)] pt-3">
            <span className="text-[11px] tracking-[0.06em] text-muted">
              {m.code} · {fmtDate(m.createdTime)}
            </span>
            <Link
              href={`/admin/s/${m.code}`}
              className="text-[12px] font-bold uppercase tracking-[0.06em] text-blue underline hover:text-ink"
            >
              View map + answers →
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
