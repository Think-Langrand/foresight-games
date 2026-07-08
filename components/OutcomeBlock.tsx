"use client";

import { useState } from "react";
import type { Outcome } from "@/lib/types";
import { shortDirection } from "@/lib/types";
import { ALIGN, dirColor, effectColor, effectBg, MAG_OPACITY } from "@/lib/ui";

function MagDots({ mag }: { mag: string }) {
  const op = MAG_OPACITY[mag as keyof typeof MAG_OPACITY] ?? 0.6;
  return (
    <span className="inline-flex items-center gap-[3px]" title={mag}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-[5px] w-[5px] rounded-full bg-ink"
          style={{ opacity: op }}
        />
      ))}
    </span>
  );
}

export function OutcomeBlock({ o }: { o: Outcome }) {
  const dc = dirColor(o.direction);
  const al = ALIGN[o.alignment] ?? { c: "#6B6B5E", bg: "rgba(107,107,94,0.1)" };
  const [smOpen, setSmOpen] = useState(false);
  const hasMove = typeof o.strategicMove === "string" && o.strategicMove.trim().length > 0;

  return (
    <div
      className="rounded-r-[2px] bg-paper px-[15px] py-[13px]"
      style={{ borderLeft: `3px solid ${dc}` }}
    >
      <div className="flex flex-wrap items-center gap-x-[9px] gap-y-1">
        <span className="text-[14.5px] font-semibold text-ink">{o.label}</span>
        <span
          className="text-[9.5px] font-bold uppercase tracking-[0.1em]"
          style={{ color: dc }}
        >
          {shortDirection(o.direction)}
        </span>
        <span
          className="rounded-[2px] border px-[7px] py-[3px] text-[9.5px] font-bold uppercase tracking-[0.06em]"
          style={{ color: al.c, background: al.bg, borderColor: al.c }}
        >
          {o.alignment}
        </span>
      </div>

      <div className="mt-[9px] text-[13.5px] leading-[1.5] text-ink">{o.narrative}</div>

      {hasMove && (
        <>
          <button
            className={
              "mt-[11px] inline-flex items-center gap-[5px] rounded-[2px] px-[2px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.12em] transition-colors " +
              (smOpen ? "text-ink" : "text-muted hover:text-ink")
            }
            onClick={() => setSmOpen((s) => !s)}
            aria-expanded={smOpen}
          >
            <span className="text-lime-deep">{smOpen ? "▾" : "▸"}</span> Strategic move
          </button>
          {smOpen && (
            <div className="mt-2 rounded-r-[1px] bg-card px-[14px] py-[11px] text-[13px] leading-[1.55] text-ink" style={{ borderLeft: "2px solid var(--lime-deep)" }}>
              {o.strategicMove}
            </div>
          )}
        </>
      )}

      {o.impacts.length > 0 && (
        <div className="mt-[13px] text-[9.5px] font-bold uppercase tracking-[0.13em] text-muted">
          Loop Impacts
        </div>
      )}
      <div className="mt-2 flex flex-col gap-[9px]">
        {o.impacts.map((im, i) => (
          <div key={im.id || i} className="flex flex-col gap-[3px]">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="whitespace-nowrap rounded-[2px] border px-[6px] py-[2px] text-[9px] font-bold uppercase tracking-[0.05em]"
                style={{
                  color: effectColor(im.effect),
                  background: effectBg(im.effect),
                  borderColor: effectColor(im.effect),
                }}
              >
                {im.effect}
              </span>
              <MagDots mag={im.magnitude} />
              <span className="text-[12.5px] font-medium text-ink">{im.loopName}</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted">
                {im.loopSubsystem}
                {im.loopCode ? ` · ${im.loopCode}` : ""}
              </span>
            </div>
            {im.mechanism && (
              <div className="text-[12px] leading-[1.45] text-muted">{im.mechanism}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
