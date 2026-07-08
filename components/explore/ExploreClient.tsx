"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Driver, Model, Uncertainty } from "@/lib/types";
import { MarkText } from "@/components/Mark";
import { Poles } from "@/components/Poles";
import { OutcomeBlock } from "@/components/OutcomeBlock";
import { ALIGN } from "@/lib/ui";

export function ExploreClient({ model }: { model: Model }) {
  const drivers = model.drivers;
  const keystone = drivers.find((d) => d.name === "The Receding Public") ?? drivers[0];
  const [activeId, setActiveId] = useState(keystone.id);
  const [search, setSearch] = useState("");
  const [topOnly, setTopOnly] = useState(false);
  const [neutral, setNeutral] = useState(false);
  const [openUnc, setOpenUnc] = useState<Record<string, boolean>>({});
  const mainRef = useRef<HTMLElement>(null);

  const active = drivers.find((d) => d.id === activeId) ?? keystone;

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const order: string[] = [];
    drivers.forEach((d) => {
      if (topOnly && !d.topRight) return;
      if (q && !d.name.toLowerCase().includes(q)) return;
      if (!order.includes(d.theme)) order.push(d.theme);
    });
    return order.map((theme) => ({
      theme,
      rows: drivers.filter(
        (d) =>
          d.theme === theme &&
          (!topOnly || d.topRight) &&
          (!q || d.name.toLowerCase().includes(q))
      ),
    }));
  }, [drivers, search, topOnly]);

  function selectDriver(id: string) {
    setActiveId(id);
    setOpenUnc({});
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }

  const driverName = neutral && active.neutralName ? active.neutralName : active.name;
  const driverHeadline =
    neutral && active.neutralHeadline ? active.neutralHeadline : active.headline;
  const driverShort = neutral && active.neutralReading ? active.neutralReading : active.short;

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
              Driver Explorer
            </span>
          </MarkText>
        </div>
        <div className="mt-2 eyebrow">to 2035</div>

        <input
          className="mt-4 w-full rounded-[2px] border border-[var(--hairline)] bg-card px-[11px] py-[9px] text-[13px] outline-none focus:border-ink"
          placeholder="Filter drivers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filter drivers"
        />

        <div className="mt-3.5 flex items-center gap-2.5">
          <button
            className={"sq-toggle" + (topOnly ? " on" : "")}
            onClick={() => setTopOnly((t) => !t)}
            role="switch"
            aria-checked={topOnly}
            aria-label="Top-ranked only"
          >
            <span className="knob" />
          </button>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]">
            Top-ranked only
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-2.5">
          <button
            className={"sq-toggle" + (neutral ? " on" : "")}
            onClick={() => setNeutral((t) => !t)}
            role="switch"
            aria-checked={neutral}
            aria-label="Neutral framing"
          >
            <span className="knob" />
          </button>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]">
            Neutral framing
          </span>
        </div>

        {groups.map((g) => (
          <div key={g.theme} className="mt-6">
            <div className="mb-1.5 border-b border-[var(--hairline)] pb-[7px]">
              <span className="eyebrow">{g.theme}</span>
            </div>
            {g.rows.map((d) => (
              <SidebarRow
                key={d.id}
                d={d}
                neutral={neutral}
                active={d.id === activeId}
                onClick={() => selectDriver(d.id)}
              />
            ))}
          </div>
        ))}
        {groups.length === 0 && (
          <div className="mt-6 text-[13px] text-muted">No drivers match.</div>
        )}
      </aside>

      {/* Main */}
      <main ref={mainRef} className="h-screen flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 border-b border-[var(--rule)] bg-paper px-11 pb-5 pt-6">
          <span className="eyebrow blue">{active.theme}</span>
          <h1 className="mt-2 text-[32px] font-extrabold uppercase leading-[1.02] tracking-tight">
            <MarkText>{driverName}</MarkText>
          </h1>
          <div className="serif mt-3.5 text-[24px] font-medium leading-[1.28] text-ink">
            {driverHeadline}
          </div>
          <div className="mt-2.5 max-w-[760px] text-[14.5px] text-muted">{driverShort}</div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {active.impact && <MiniTag>Impact: {active.impact}</MiniTag>}
            {active.uncertainty && <MiniTag>Uncertainty: {active.uncertainty}</MiniTag>}
            <AlignTally driver={active} />
          </div>
        </div>

        <div className="px-11 pb-16 pt-6">
          <div className="mb-4 inline-block">
            <span className="text-[12px] font-bold uppercase tracking-[0.14em]">
              Key Uncertainties
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
            {active.uncertainties.map((u) => (
              <UncertaintyCard
                key={u.id}
                u={u}
                open={!!openUnc[u.id]}
                onToggle={() => setOpenUnc((s) => ({ ...s, [u.id]: !s[u.id] }))}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function SidebarRow({
  d,
  neutral,
  active,
  onClick,
}: {
  d: Driver;
  neutral: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const name = neutral && d.neutralName ? d.neutralName : d.name;
  return (
    <button
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className="relative flex w-full items-start gap-2 rounded-[2px] px-2 py-[7px] text-left leading-[1.25] hover:bg-[rgba(36,36,34,0.045)]"
    >
      <span
        className="mt-[5px] h-2 w-2 flex-none rotate-45 bg-lime-deep"
        style={{ visibility: d.topRight ? "visible" : "hidden" }}
      />
      {active && (
        <span
          className="pointer-events-none absolute left-6 right-2 top-1.5 bottom-1.5 z-0 rounded-[1px] bg-lime"
          style={{ mixBlendMode: "multiply" }}
        />
      )}
      <span
        className={
          "relative z-[1] text-[13.5px] " + (active ? "font-bold" : "font-medium")
        }
      >
        {name}
      </span>
    </button>
  );
}

function MiniTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[2px] border border-[var(--hairline)] bg-card px-[7px] py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
      {children}
    </span>
  );
}

function AlignTally({ driver }: { driver: Driver }) {
  const t: Record<string, number> = {
    "Self-aligned": 0,
    "Engineered alignment": 0,
    "Needs collective action": 0,
    "Mixed / depends": 0,
  };
  driver.uncertainties.forEach((u) =>
    u.outcomes.forEach((o) => {
      if (t[o.alignment] !== undefined) t[o.alignment]++;
    })
  );
  return (
    <span className="ml-1 flex items-center gap-2.5">
      {(Object.keys(t) as (keyof typeof ALIGN)[]).map((k) => (
        <span key={k} className="flex items-center gap-1" title={k}>
          <span
            className="h-2.5 w-2.5 flex-none rounded-[1px]"
            style={{ background: ALIGN[k].c }}
          />
          <span className="text-[11px] font-bold">{t[k]}</span>
        </span>
      ))}
    </span>
  );
}

function UncertaintyCard({
  u,
  open,
  onToggle,
}: {
  u: Uncertainty;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[2px] border border-[var(--hairline)] bg-card">
      <div className="flex items-start gap-3 p-[18px]">
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="flex flex-1 items-start gap-3 text-left"
        >
          <span className="mt-[3px] w-3 flex-none text-[12px] text-muted">
            {open ? "▾" : "▸"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-[16px] font-bold leading-[1.2] text-ink">
              {u.label}
              {u.sharpest && (
                <span className="ml-2.5 inline-block rounded-[2px] bg-lime px-1.5 py-[3px] align-middle text-[9px] font-bold uppercase tracking-[0.1em] text-ink">
                  Sharpest Axis
                </span>
              )}
            </span>
            <div className="serif mt-1.5 text-[16px] italic leading-[1.35] text-muted">
              {u.question}
            </div>
            <div className="mt-3">
              <Poles a={u.poleA} b={u.poleB} />
            </div>
          </span>
        </button>
        <div className="flex flex-none flex-col items-end gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">
            {u.outcomes.length} outcomes
          </span>
          <Link
            href={`/workshop/new?u=${u.id}`}
            className="whitespace-nowrap rounded-[2px] border border-ink bg-lime px-[10px] py-[6px] text-[10px] font-bold uppercase tracking-[0.09em] text-ink hover:bg-lime-deep"
          >
            Run workshop →
          </Link>
        </div>
      </div>
      {open && (
        <div className="flex flex-col gap-3 px-[18px] pb-4">
          {u.outcomes.map((o) => (
            <OutcomeBlock key={o.id} o={o} />
          ))}
        </div>
      )}
    </div>
  );
}
