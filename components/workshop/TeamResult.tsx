"use client";

import { CardArtBand, DriverChips, roleHex } from "@/components/workshop/CardArt";
import { CAPTURE_PROMPTS, CAPTURE_SENTENCE } from "@/lib/capture";
import { teamTriadIds, type Card, type Team } from "@/lib/workshop-types";
import type { DriverLite } from "@/lib/drivers-shared";

// A polished, self-contained results layout for one team's finished scenario.
// Shared by the facilitator's projector spotlight (size="lg") and the team's
// own on-device recap after submitting (size="md").

type Size = "lg" | "md";

const T = {
  lg: {
    title: "text-[40px] md:text-[56px]",
    name: "text-[16px]",
    cardTitle: "text-[15px]",
    cardCond: "text-[12.5px]",
    band: 64,
    label: "text-[10px]",
    body: "text-[15px]",
    sentence: "text-[20px] md:text-[24px]",
    gap: "gap-6",
    cols: "sm:grid-cols-2 lg:grid-cols-4",
  },
  md: {
    title: "text-[26px]",
    name: "text-[13px]",
    cardTitle: "text-[12.5px]",
    cardCond: "text-[11px]",
    band: 44,
    label: "text-[9px]",
    body: "text-[13.5px]",
    sentence: "text-[16px]",
    gap: "gap-4",
    cols: "grid-cols-2",
  },
} satisfies Record<Size, Record<string, string | number>>;

export function TeamResult({
  team,
  triad,
  wildcard,
  driversBySlug,
  size = "md",
  heading,
}: {
  team: Team;
  triad: Card[];
  wildcard?: Card | null;
  driversBySlug?: Map<string, DriverLite>;
  size?: Size;
  heading?: string;
}) {
  const s = T[size];
  const submitted = team.status === "Submitted";
  const logic = CAPTURE_PROMPTS.map((p) => ({ label: p.label, value: team[p.key] })).filter(
    (r) => r.value?.trim()
  );
  const faces = [...triad, ...(wildcard ? [wildcard] : [])];
  // Union of the drivers behind this team's cards (dedup, order-preserving).
  const driverIds = [...new Set(faces.flatMap((c) => c.sourceDriverIds ?? []))];

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      {/* header: team + status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 rounded-[2px] border border-ink"
            style={{ background: team.color }}
          />
          <span className={`font-extrabold uppercase tracking-[0.06em] ${s.name}`}>
            {team.name || "Team"}
          </span>
        </span>
        <span
          className={
            "rounded-[2px] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] " +
            (submitted ? "bg-lime text-ink" : "border border-[var(--hairline)] text-muted")
          }
        >
          {submitted ? "Submitted" : "Drafting"}
        </span>
      </div>

      {/* world title */}
      <span className="eyebrow blue mt-5 block">{heading ?? "The world"}</span>
      {team.worldTitle ? (
        <h1
          className={`mt-1.5 font-extrabold uppercase leading-[1.02] tracking-tight ${s.title}`}
        >
          {team.worldTitle}
        </h1>
      ) : (
        <h1 className={`mt-1.5 italic text-muted ${s.title}`}>Untitled world</h1>
      )}

      {/* the triad, as cards */}
      {faces.length > 0 && (
        <div className={`mt-6 grid ${s.cols} ${s.gap}`}>
          {faces.map((c) => {
            const isWild = wildcard ? c.id === wildcard.id : false;
            const accent = roleHex(c.role);
            return (
              <div
                key={c.id}
                className="flex flex-col overflow-hidden rounded-[5px] border border-[var(--hairline)] bg-paper"
                style={{ borderTop: `4px solid ${accent}` }}
              >
                <div className="relative">
                  <CardArtBand dimension={c.dimension} height={s.band} />
                  {isWild && (
                    <span className="absolute right-1.5 top-1.5 rounded-[2px] bg-coral px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white">
                      ⚡ Wild
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <span className={`eyebrow ${s.label}`}>{c.dimension}</span>
                  <span className={`mt-1 font-extrabold leading-[1.15] ${s.cardTitle}`}>
                    {c.title}
                  </span>
                  <span className={`mt-1.5 leading-[1.4] text-muted ${s.cardCond}`}>
                    {c.condition}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* internal logic */}
      {logic.length > 0 && (
        <dl className={`mt-7 grid gap-x-8 gap-y-4 ${size === "lg" ? "sm:grid-cols-2" : ""}`}>
          {logic.map((r) => (
            <div key={r.label}>
              <dt
                className={`font-bold uppercase tracking-[0.08em] text-muted ${s.label}`}
              >
                {r.label}
              </dt>
              <dd className={`mt-1 leading-[1.5] ${s.body}`}>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* the warm-up sentence, set apart */}
      {team.convergence?.trim() && (
        <blockquote
          className={`serif mt-7 border-l-2 border-ink pl-4 italic leading-[1.35] ${s.sentence}`}
        >
          {team.convergence}
        </blockquote>
      )}

      {/* driver lineage */}
      {driversBySlug && driverIds.length > 0 && (
        <div className="mt-7 border-t border-[var(--rule)] pt-5">
          <DriverChips
            sourceDriverIds={driverIds}
            driversBySlug={driversBySlug}
            label="Drivers behind this world"
          />
        </div>
      )}
    </div>
  );
}
