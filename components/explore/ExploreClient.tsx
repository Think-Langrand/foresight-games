"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Model, ScenarioUncertainty } from "@/lib/types";
import { MarkText } from "@/components/Mark";
import { Poles } from "@/components/Poles";

// Curated capability-domain order (matches the Airtable single-select order).
const DOMAIN_ORDER = [
  "Permission to Act",
  "Capacity to Act",
  "Ability to See",
  "Ability to Speak & Be Believed",
  "Ability to Adapt",
];

function domainRank(name: string): number {
  const i = DOMAIN_ORDER.indexOf(name);
  return i === -1 ? 999 : i;
}

export function ExploreClient({ model }: { model: Model }) {
  const scenarios = model.scenarioUncertainties;
  const driverNameById = useMemo(
    () => new Map(model.drivers.map((d) => [d.id, d.name])),
    [model.drivers]
  );

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const mainRef = useRef<HTMLElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Group scenarios by capability domain, in curated order.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byDomain = new Map<string, ScenarioUncertainty[]>();
    for (const s of scenarios) {
      if (
        q &&
        !s.label.toLowerCase().includes(q) &&
        !s.question.toLowerCase().includes(q)
      )
        continue;
      const key = s.capabilityDomain || "Other";
      if (!byDomain.has(key)) byDomain.set(key, []);
      byDomain.get(key)!.push(s);
    }
    return [...byDomain.entries()]
      .map(([domain, rows]) => ({
        domain,
        rows: rows.sort((a, b) => a.workshopId.localeCompare(b.workshopId)),
      }))
      .sort((a, b) => domainRank(a.domain) - domainRank(b.domain));
  }, [scenarios, search]);

  function jumpTo(domain: string) {
    sectionRefs.current[domain]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex h-screen w-full bg-paper">
      {/* Sidebar */}
      <aside className="h-screen w-[300px] min-w-[300px] overflow-y-auto border-r border-[var(--hairline)] px-5 pb-10 pt-6">
        <Link href="/" className="eyebrow blue block">
          ← Home
        </Link>
        <div className="mt-3">
          <MarkText>
            <span className="text-[19px] font-extrabold uppercase leading-[1.05] tracking-tight">
              Scenario Explorer
            </span>
          </MarkText>
        </div>
        <div className="mt-2 eyebrow">to 2035</div>

        <input
          className="mt-4 w-full rounded-[2px] border border-[var(--hairline)] bg-card px-[11px] py-[9px] text-[13px] outline-none focus:border-ink"
          placeholder="Filter uncertainties…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter scenario uncertainties"
        />

        <div className="mt-6 mb-1.5 border-b border-[var(--hairline)] pb-[7px]">
          <span className="eyebrow">Capability domains</span>
        </div>
        {groups.map((g) => (
          <button
            key={g.domain}
            onClick={() => jumpTo(g.domain)}
            className="flex w-full items-center justify-between gap-2 rounded-[2px] px-2 py-[9px] text-left hover:bg-[rgba(36,36,34,0.045)]"
          >
            <span className="text-[13.5px] font-medium leading-[1.2]">{g.domain}</span>
            <span className="flex-none rounded-[2px] border border-[var(--hairline)] bg-card px-[6px] py-[2px] text-[10px] font-bold text-muted">
              {g.rows.length}
            </span>
          </button>
        ))}
        {groups.length === 0 && (
          <div className="mt-6 text-[13px] text-muted">No uncertainties match.</div>
        )}
      </aside>

      {/* Main */}
      <main ref={mainRef} className="h-screen flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 border-b border-[var(--rule)] bg-paper px-11 pb-5 pt-6">
          <span className="eyebrow blue">NNPHI · Foresight for Public Health</span>
          <h1 className="mt-2 text-[32px] font-extrabold uppercase leading-[1.02] tracking-tight">
            <MarkText>Scenario Uncertainties</MarkText>
          </h1>
          <div className="mt-2.5 max-w-[760px] text-[14.5px] text-muted">
            The genuinely open questions whose resolution shapes the scenarios, grouped by the
            capability each one tests. Hit{" "}
            <span className="font-semibold text-ink">Run workshop</span> on any of them to open
            a live session.
          </div>
        </div>

        <div className="px-11 pb-16 pt-6">
          {groups.map((g) => (
            <section
              key={g.domain}
              ref={(el) => {
                sectionRefs.current[g.domain] = el;
              }}
              className="mb-10 scroll-mt-[150px]"
            >
              <div className="mb-4 inline-block">
                <span className="text-[12px] font-bold uppercase tracking-[0.14em]">
                  {g.domain}
                </span>
                <svg
                  className="mt-0.5 block h-[9px] w-16"
                  viewBox="0 0 64 12"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 8 C 16 4, 32 9, 48 6 S 60 5, 62 8"
                    stroke="var(--lime)"
                    strokeWidth="6"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <div className="flex flex-col gap-3.5">
                {g.rows.map((s) => (
                  <ScenarioCard
                    key={s.id}
                    s={s}
                    driverNameById={driverNameById}
                    open={!!open[s.id]}
                    onToggle={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}
                  />
                ))}
              </div>
            </section>
          ))}
          {groups.length === 0 && (
            <div className="text-[13px] text-muted">No scenario uncertainties match.</div>
          )}
        </div>
      </main>
    </div>
  );
}

function ScenarioCard({
  s,
  driverNameById,
  open,
  onToggle,
}: {
  s: ScenarioUncertainty;
  driverNameById: Map<string, string>;
  open: boolean;
  onToggle: () => void;
}) {
  const hasBody = Boolean(s.whyItMatters || s.identityImplication);
  const driverNames = s.sourceDriverIds
    .map((id) => driverNameById.get(id))
    .filter((n): n is string => Boolean(n));
  return (
    <div className="overflow-hidden rounded-[2px] border border-[var(--hairline)] bg-card">
      <div className="flex items-start gap-3 p-[18px]">
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="flex flex-1 items-start gap-3 text-left"
        >
          <span className="mt-[3px] w-3 flex-none text-[12px] text-muted">
            {hasBody ? (open ? "▾" : "▸") : ""}
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-[16px] font-bold leading-[1.2] text-ink">
              {s.label}
              {s.workshopId && (
                <span className="ml-2.5 inline-block rounded-[2px] bg-lime px-1.5 py-[3px] align-middle text-[9px] font-bold uppercase tracking-[0.1em] text-ink">
                  {s.workshopId}
                </span>
              )}
            </span>
            <div className="serif mt-1.5 text-[16px] italic leading-[1.35] text-muted">
              {s.question}
            </div>
            <div className="mt-3">
              <Poles a={s.poleA} b={s.poleB} />
            </div>
            {driverNames.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  Drivers
                </span>
                {driverNames.map((n) => (
                  <span
                    key={n}
                    className="rounded-[2px] border border-[var(--hairline)] bg-paper px-[7px] py-[3px] text-[10px] font-semibold text-muted"
                  >
                    {n}
                  </span>
                ))}
              </div>
            )}
          </span>
        </button>
        <div className="flex flex-none flex-col items-end gap-2">
          <Link
            href={`/workshop/new?u=${s.id}`}
            className="whitespace-nowrap rounded-[2px] border border-ink bg-lime px-[10px] py-[6px] text-[10px] font-bold uppercase tracking-[0.09em] text-ink hover:bg-lime-deep"
          >
            Run workshop →
          </Link>
        </div>
      </div>
      {open && hasBody && (
        <div className="flex flex-col gap-4 border-t border-[var(--hairline)] px-[18px] py-4">
          {s.whyItMatters && (
            <Field label="Why it matters for scenarios">{s.whyItMatters}</Field>
          )}
          {s.identityImplication && (
            <Field label="Identity implication">{s.identityImplication}</Field>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
        {label}
      </div>
      <div className="mt-1 text-[14px] leading-[1.5] text-ink">{children}</div>
    </div>
  );
}
