import "server-only";

import Link from "next/link";
import {
  describeForesightFailure,
  foresightConfigured,
  getForesightDrivers,
  getForesightUncertainties,
} from "@/lib/foresight/client";
import type {
  PublicDriverCard,
  PublicUncertainty,
} from "@/lib/foresight/types";
import {
  ForesightNotConfigured,
  ForesightUnavailable,
} from "@/components/foresight/notice";
import { SignedImage } from "@/components/foresight/SignedImage";

// Per-project driver + uncertainty views, pulled live from the Carmelita model
// endpoints for the project's `carmelita_project_ref`. Styled to match the global
// /drivers and /uncertainties pages, but rendering the platform (PublicDriver /
// PublicUncertainty) shapes rather than the internal Supabase model. Parametrized
// by { projectRef, homeHref } so each project resolves its own data.

interface ModelCtx {
  projectRef?: string;
  homeHref?: string;
}

// Match the deck's role accents (Core / Edge / Wildcard).
function roleColor(role: string): string {
  return role === "Wildcard"
    ? "var(--coral)"
    : role === "Edge"
      ? "var(--amber)"
      : "var(--lime-deep)";
}

// --- Drivers ---------------------------------------------------------------

export async function ProjectDriversView({
  projectRef,
  homeHref = "/",
}: ModelCtx) {
  return (
    <main className="mx-auto min-h-screen max-w-[980px] px-6 py-12 md:py-16">
      <Link href={homeHref} className="eyebrow blue">
        ← Home
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <h1 className="text-[34px] font-extrabold uppercase leading-[1.03] tracking-tight md:text-[44px]">
          Drivers
        </h1>
      </div>
      <p className="serif mt-4 max-w-[680px] text-[19px] leading-[1.35] text-ink">
        The biggest forces reshaping this project&rsquo;s future, pulled from the
        foresight platform.
      </p>

      {!foresightConfigured() ? (
        <ForesightNotConfigured />
      ) : (
        <DriversGrid projectRef={projectRef} />
      )}
    </main>
  );
}

async function DriversGrid({ projectRef }: { projectRef?: string }) {
  let drivers: PublicDriverCard[];
  try {
    drivers = await getForesightDrivers(projectRef);
  } catch (err) {
    return <ForesightUnavailable detail={describeForesightFailure(err)} />;
  }

  if (drivers.length === 0) {
    return <p className="mt-12 text-[15px] text-muted">No drivers published yet.</p>;
  }

  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      {drivers.map((d) => (
        <article
          key={d.id}
          className="flex flex-col overflow-hidden rounded-[3px] border border-[var(--hairline)] bg-card"
        >
          {d.imageUrl && (
            <div className="aspect-[16/9] w-full overflow-hidden bg-[var(--hairline)]">
              <SignedImage
                src={d.imageUrl}
                alt={d.name}
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div className="p-5">
            <h2 className="text-[18px] font-extrabold uppercase leading-[1.1] tracking-tight">
              {d.name}
            </h2>
            {d.shortDescription && (
              <p className="mt-2 text-[13.5px] leading-[1.55] text-muted">
                {d.shortDescription}
              </p>
            )}
            {d.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.tags.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-[2px] bg-[var(--hairline)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

// --- Uncertainties ---------------------------------------------------------

export async function ProjectUncertaintiesView({
  projectRef,
  homeHref = "/",
}: ModelCtx) {
  return (
    <main className="mx-auto min-h-screen max-w-[1000px] px-6 py-12 md:py-16">
      <Link href={homeHref} className="eyebrow blue">
        ← Home
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <h1 className="text-[34px] font-extrabold uppercase leading-[1.03] tracking-tight md:text-[44px]">
          Uncertainties
        </h1>
      </div>
      <p className="serif mt-4 max-w-[720px] text-[19px] leading-[1.35] text-ink">
        The sharpest open questions cutting across the drivers. Each resolves in
        several ways — the outcome cards a game would be dealt from.
      </p>

      {!foresightConfigured() ? (
        <ForesightNotConfigured />
      ) : (
        <UncertaintiesList projectRef={projectRef} />
      )}
    </main>
  );
}

async function UncertaintiesList({ projectRef }: { projectRef?: string }) {
  let rows: PublicUncertainty[];
  try {
    rows = await getForesightUncertainties(projectRef);
  } catch (err) {
    return <ForesightUnavailable detail={describeForesightFailure(err)} />;
  }

  if (rows.length === 0) {
    return (
      <p className="mt-12 text-[15px] text-muted">No uncertainties published yet.</p>
    );
  }

  // Group by domain, preserving first-seen domain order and number order.
  const byDomain = new Map<string, PublicUncertainty[]>();
  for (const u of [...rows].sort((a, b) => a.number - b.number)) {
    const group = byDomain.get(u.domain) ?? [];
    group.push(u);
    byDomain.set(u.domain, group);
  }

  return (
    <>
      {[...byDomain.entries()].map(([domain, group]) => (
        <section key={domain} className="mt-12">
          <span className="eyebrow ink">{domain || "Uncategorized"}</span>
          <div className="mt-4 flex flex-col gap-6">
            {group.map((u) => (
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
                  {u.sharpest && (
                    <span className="rounded-[2px] bg-[var(--lime)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-ink">
                      Sharpest
                    </span>
                  )}
                </div>
                {u.question && (
                  <p className="serif mt-2 text-[16px] italic leading-[1.35] text-ink">
                    {u.question}
                  </p>
                )}

                {u.linkedDrivers.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {u.linkedDrivers.map((d) => (
                      <span
                        key={d.driverId}
                        className="rounded-[2px] border border-[var(--hairline)] bg-paper px-2 py-0.5 text-[11px] font-semibold text-muted"
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
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
