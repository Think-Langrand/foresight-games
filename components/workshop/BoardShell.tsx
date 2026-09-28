"use client";

import { PHASE_LABELS, type RippleArtImage, type RipplePhase } from "@/lib/ripples-types";
import { RippleArtBand } from "@/components/workshop/RippleArt";

// The chrome every shared board wears: the page shell, the phase header band, a card
// panel, the error toast, and a centred one-liner. Extracted from RipplesTeamView so the
// Week 3 synthesis board wears exactly the same chrome instead of a near-copy.

export function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={"mx-auto min-h-screen px-5 py-6 " + (wide ? "max-w-[1100px]" : "max-w-[820px]")}>
      {children}
    </main>
  );
}

export function PhaseHeader({
  phase,
  title,
  team,
  teamColor,
  art,
  solo,
  right,
  // What kind of board this is, shown in the eyebrow and used as the fallback title.
  // Implication mapping is the default so existing callers read unchanged.
  kindLabel = "Implication mapping",
}: {
  phase: RipplePhase;
  title: string;
  team?: string;
  teamColor?: string;
  art?: RippleArtImage;
  solo?: boolean;
  right?: React.ReactNode;
  kindLabel?: string;
}) {
  return (
    <div className="relative mb-5 overflow-hidden border-b border-[var(--rule)]">
      <RippleArtBand image={art} />
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 pt-1">
        <div>
          <span className="eyebrow blue">
            {solo ? `${kindLabel} · solo` : kindLabel} · {PHASE_LABELS[phase]}
          </span>
          <h1 className="mt-1 text-[22px] font-extrabold uppercase leading-[1.05] tracking-tight">
            {title || kindLabel}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {team && (
            <span className="inline-flex items-center gap-2 text-[13px] font-bold">
              <span
                className="inline-block h-3.5 w-3.5 rounded-[2px] border border-ink"
                style={{ background: teamColor }}
              />
              {team}
            </span>
          )}
          {right}
        </div>
      </div>
    </div>
  );
}

export function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[3px] border border-[var(--hairline)] bg-card p-5">{children}</div>;
}

export function Flash({ msg }: { msg: string }) {
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-[3px] border border-coral bg-card px-4 py-2 text-[13px] font-semibold text-coral shadow">
      {msg}
    </div>
  );
}

export function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-[15px] text-muted">
      {children}
    </main>
  );
}

// A numbered step heading, used by the board's own sections.
export function SectionHead({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-[18px] font-extrabold uppercase tracking-tight">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink bg-lime text-[13px]">
          {n}
        </span>
        {title}
      </h2>
      {children && <p className="mt-1 text-[13px] leading-[1.5] text-muted">{children}</p>}
    </div>
  );
}
