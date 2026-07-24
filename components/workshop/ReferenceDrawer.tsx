"use client";

import { useEffect, useState } from "react";
import type { DriverLite } from "@/lib/drivers-shared";
import { DOMAIN_ORDER } from "@/lib/workshop-types";

// Minimal shape the drawer needs — both play surfaces map their own data to this.
export interface RefUncertainty {
  id: string;
  title: string;
  domain: string;
  question: string;
}

type Panel = "uncertainties" | "drivers";

/**
 * A read-only reference drawer for the live participant screens. Two tab handles
 * hang off the right edge; tapping one slides its panel in from the right. It
 * never navigates, so a participant keeps their exact place in the game — the
 * whole point of the feature. Non-modal on desktop (the game stays interactive
 * behind it); a light backdrop appears on mobile, where the panel is near-full.
 */
export function ReferenceDrawer({
  uncertainties,
  drivers,
}: {
  uncertainties: RefUncertainty[];
  drivers: DriverLite[];
}) {
  const [open, setOpen] = useState<Panel | null>(null);

  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = (p: Panel) => setOpen((cur) => (cur === p ? null : p));

  return (
    // Full-screen layer, click-through except on the tabs, backdrop, and panel.
    <div className="pointer-events-none fixed inset-0 z-40">
      {/* Mobile-only backdrop; desktop stays non-modal so the game is usable. */}
      {open && (
        <div
          className="pointer-events-auto absolute inset-0 bg-[rgba(20,20,18,0.4)] sm:hidden"
          onClick={() => setOpen(null)}
          aria-hidden
        />
      )}

      {/* Panel + its attached tab rail slide together. Tabs hang off the panel's
          left edge, so they ride out to the screen edge when closed. */}
      <div
        className={
          "absolute inset-y-0 right-0 transition-transform duration-300 ease-out " +
          (open ? "translate-x-0" : "translate-x-full")
        }
      >
        <div className="pointer-events-auto absolute right-full top-1/2 flex -translate-y-1/2 flex-col gap-2">
          <TabHandle label="Uncertainties" active={open === "uncertainties"} onClick={() => toggle("uncertainties")} />
          <TabHandle label="Drivers" active={open === "drivers"} onClick={() => toggle("drivers")} />
        </div>

        <aside
          className="pointer-events-auto h-full w-[86vw] max-w-[420px] overflow-y-auto border-l border-ink bg-paper"
          role="dialog"
          aria-label={open === "drivers" ? "Drivers reference" : "Uncertainties reference"}
          aria-hidden={!open}
          inert={!open}
        >
          <div className="sticky top-0 flex items-center justify-between border-b border-[var(--hairline)] bg-paper px-5 py-3">
            <span className="eyebrow ink">
              {open === "drivers" ? "The 14 drivers" : "The uncertainties"}
            </span>
            <button
              onClick={() => setOpen(null)}
              className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted hover:text-ink"
            >
              Close ✕
            </button>
          </div>

          <div className="px-5 py-4">
            {open === "drivers" ? (
              <DriverList drivers={drivers} />
            ) : (
              <UncertaintyList uncertainties={uncertainties} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function TabHandle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-expanded={active}
      className={
        "rounded-l-[6px] border border-r-0 border-ink py-3 pl-2 pr-1.5 text-[11px] font-bold uppercase tracking-[0.12em] shadow-sm transition-colors " +
        (active ? "bg-lime" : "bg-card hover:bg-lime")
      }
      style={{ writingMode: "vertical-rl" }}
    >
      {label}
    </button>
  );
}

function UncertaintyList({ uncertainties }: { uncertainties: RefUncertainty[] }) {
  const domains = DOMAIN_ORDER.filter((d) => uncertainties.some((u) => u.domain === d));
  // Anything with an unexpected/empty domain still gets shown, at the end.
  const rest = uncertainties.filter((u) => !DOMAIN_ORDER.includes(u.domain));
  const groups = [
    ...domains.map((d) => ({ domain: d, items: uncertainties.filter((u) => u.domain === d) })),
    ...(rest.length ? [{ domain: "Other", items: rest }] : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      {groups.map(({ domain, items }) => (
        <div key={domain}>
          <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-blue">{domain}</div>
          <div className="mt-2 flex flex-col gap-2.5">
            {items.map((u) => (
              <div key={u.id} className="rounded-[2px] border border-[var(--hairline)] bg-card px-3 py-2.5">
                <div className="text-[14px] font-bold leading-[1.15]">{u.title}</div>
                <p className="serif mt-1 text-[13.5px] italic leading-[1.3] text-muted">{u.question}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DriverList({ drivers }: { drivers: DriverLite[] }) {
  return (
    <div className="flex flex-col gap-3">
      {drivers.map((d) => (
        <div key={d.slug} className="rounded-[2px] border border-[var(--hairline)] bg-card px-3 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-bold tabular-nums text-muted">{d.number}</span>
            <span className="text-[14px] font-bold leading-[1.15]">{d.name}</span>
          </div>
          {d.headline && (
            <p className="serif mt-1 text-[13.5px] italic leading-[1.3]">{d.headline}</p>
          )}
          {d.body && <p className="mt-1.5 text-[12.5px] leading-[1.5] text-muted">{d.body}</p>}
        </div>
      ))}
    </div>
  );
}
