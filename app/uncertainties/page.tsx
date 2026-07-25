import Link from "next/link";
import { getUncertaintyRows, type UncertaintyRow } from "@/lib/cards";
import { getDrivers } from "@/lib/drivers";
import { resolveDrivers } from "@/lib/drivers-shared";

export const dynamic = "force-dynamic";

// Match the deck's role accents (Core / Edge / Wildcard).
function roleColor(role: string): string {
  return role === "Wildcard"
    ? "var(--coral)"
    : role === "Edge"
      ? "var(--amber)"
      : "var(--lime-deep)";
}

export default async function UncertaintiesPage() {
  const [rows, drivers] = await Promise.all([getUncertaintyRows(), getDrivers()]);
  const bySlug = new Map(drivers.map((d) => [d.slug, d]));

  // Group by domain, preserving first-seen domain order and number order.
  const byDomain = new Map<string, UncertaintyRow[]>();
  for (const u of [...rows].sort((a, b) => a.number - b.number)) {
    const group = byDomain.get(u.domain) ?? [];
    group.push(u);
    byDomain.set(u.domain, group);
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1000px] px-6 py-12 md:py-16">
      <Link href="/" className="eyebrow blue">
        ← Home
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <h1 className="text-[34px] font-extrabold uppercase leading-[1.03] tracking-tight md:text-[44px]">
          Uncertainties
        </h1>
        <span className="text-[12px] text-muted">{rows.length} uncertainties</span>
      </div>
      <p className="serif mt-4 max-w-[720px] text-[19px] leading-[1.35] text-ink">
        The sharpest open questions cutting across the drivers. Each resolves in four ways — the
        outcome cards the game is dealt from.
      </p>

      {[...byDomain.entries()].map(([domain, group]) => (
        <section key={domain} className="mt-12">
          <span className="eyebrow ink">{domain}</span>
          <div className="mt-4 flex flex-col gap-6">
            {group.map((u) => {
              const sources = resolveDrivers(u.sourceDriverIds, bySlug);
              return (
                <article
                  key={u.id}
                  className="rounded-[3px] border border-[var(--hairline)] bg-card p-5"
                >
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-[12px] font-bold text-muted tabular-nums">
                      U{String(u.number).padStart(2, "0")}
                    </span>
                    <h2 className="text-[19px] font-extrabold uppercase leading-[1.1] tracking-tight">
                      {u.title}
                    </h2>
                  </div>
                  {u.question && (
                    <p className="serif mt-2 text-[16px] italic leading-[1.35] text-ink">
                      {u.question}
                    </p>
                  )}

                  {sources.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                        Drivers
                      </span>
                      {sources.map((d) => (
                        <span
                          key={d.slug}
                          className="rounded-[2px] border border-[var(--hairline)] bg-paper px-2 py-0.5 text-[10.5px] font-semibold"
                        >
                          {d.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                    {u.outcomes.map((o) => (
                      <div
                        key={o.code}
                        className="rounded-[3px] border border-[var(--hairline)] bg-paper p-3"
                        style={{ borderLeft: `3px solid ${roleColor(o.role)}` }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-extrabold leading-[1.15]">
                            {o.title}
                          </span>
                          <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.08em] text-muted">
                            {o.role}
                          </span>
                        </div>
                        {o.description && (
                          <p className="mt-1 text-[12px] leading-[1.45] text-muted">
                            {o.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
