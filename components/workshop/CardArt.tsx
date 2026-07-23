"use client";

import { useState, type ReactNode } from "react";
import { artFor, hashString, mulberry32, type Motif } from "@/lib/card-art";
import { resolveDrivers, type DriverLite } from "@/lib/drivers-shared";
import type { CardRole } from "@/lib/workshop-types";

// Role → accent hex (matches roleColor() in CardsTeamView).
export function roleHex(role: CardRole): string {
  return role === "Wildcard" ? "#ff644e" : role === "Edge" ? "#b9860b" : "#a6e84b";
}

// ---------------------------------------------------------------- motif
function MotifSvg({ motif, hue, seed }: { motif: Motif; hue: string; seed: string }) {
  const rnd = mulberry32(hashString(seed));
  const W = 320;
  const H = 96;
  const els: ReactNode[] = [];

  if (motif === "rings") {
    const cx = W - 46 - rnd() * 36;
    const cy = H / 2;
    for (let i = 1; i <= 6; i++)
      els.push(
        <circle key={i} cx={cx} cy={cy} r={i * 15} fill="none" stroke={hue}
          strokeWidth={1.5} opacity={0.55 - i * 0.05} />
      );
  } else if (motif === "waves") {
    for (let w = 0; w < 4; w++) {
      const amp = 6 + rnd() * 8;
      const off = 16 + w * 22;
      const ph = rnd() * 6;
      let d = `M0 ${off}`;
      for (let x = 0; x <= W; x += 10) d += ` L${x} ${(off + Math.sin(x / 26 + ph) * amp).toFixed(1)}`;
      els.push(<path key={w} d={d} fill="none" stroke={hue} strokeWidth={1.5} opacity={0.5 - w * 0.08} />);
    }
  } else if (motif === "grid") {
    for (let gx = 18; gx < W; gx += 28)
      for (let gy = 16; gy < H; gy += 24)
        els.push(
          <circle key={`${gx}-${gy}`} cx={gx} cy={gy} r={1.4 + rnd() * 1.8} fill={hue}
            opacity={0.3 + rnd() * 0.3} />
        );
  } else if (motif === "network") {
    const pts = Array.from({ length: 9 }, () => ({ x: 14 + rnd() * (W - 28), y: 12 + rnd() * (H - 24) }));
    pts.forEach((p, i) =>
      pts.slice(i + 1).forEach((q, j) => {
        if (Math.hypot(p.x - q.x, p.y - q.y) < 96)
          els.push(<line key={`l${i}-${j}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={hue} strokeWidth={1} opacity={0.26} />);
      })
    );
    pts.forEach((p, i) => els.push(<circle key={`n${i}`} cx={p.x} cy={p.y} r={2.6} fill={hue} opacity={0.72} />));
  } else if (motif === "strata") {
    let y = 12;
    for (let i = 0; i < 6; i++) {
      const h = 4 + rnd() * 9;
      els.push(<rect key={i} x={0} y={y} width={W} height={h} fill={hue} opacity={0.1 + i * 0.05} />);
      y += h + 4 + rnd() * 5;
    }
  } else if (motif === "orbits") {
    const cx = W / 2;
    const cy = H / 2;
    for (let i = 0; i < 5; i++)
      els.push(
        <ellipse key={i} cx={cx} cy={cy} rx={30 + i * 24} ry={12 + i * 6} fill="none" stroke={hue}
          strokeWidth={1.2} opacity={0.5 - i * 0.06} transform={`rotate(${(rnd() * 180).toFixed(1)} ${cx} ${cy})`} />
      );
  } else {
    // rays
    const ox = rnd() * W;
    const oy = H + 8;
    for (let i = 0; i < 14; i++) {
      const ang = -Math.PI * 0.16 - (i / 13) * Math.PI * 0.68;
      const len = H * 1.5;
      els.push(<line key={i} x1={ox} y1={oy} x2={ox + Math.cos(ang) * len} y2={oy + Math.sin(ang) * len} stroke={hue} strokeWidth={1.2} opacity={0.3} />);
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
      {els}
    </svg>
  );
}

// The per-dimension art band shown at the top of a card face.
export function CardArtBand({
  dimension,
  className,
  height = 56,
}: {
  dimension: string;
  className?: string;
  height?: number;
}) {
  const { hue, image } = artFor(dimension);
  return (
    <div
      className={`relative overflow-hidden ${className ?? ""}`}
      style={{ height, background: `${hue}14` }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <MotifSvg motif={artFor(dimension).motif} hue={hue} seed={dimension} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- card back
// A shared "cone of futures" back — nested arcs radiating up from the base, on
// ink stock, with a role-colored edge.
export function CardBack({ role, className }: { role: CardRole; className?: string }) {
  const edge = roleHex(role);
  const cx = 110;
  const cy = 300;
  const arcs = [70, 110, 150, 190, 230, 270];
  return (
    <div
      className={`relative flex flex-col items-center justify-center overflow-hidden rounded-[6px] border-2 bg-ink ${className ?? ""}`}
      style={{ borderColor: edge }}
    >
      <svg viewBox="0 0 220 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
        {arcs.map((r, i) => (
          <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="#f5f4ec" strokeWidth={1.2} opacity={0.1 + i * 0.03} />
        ))}
        {Array.from({ length: 9 }).map((_, i) => {
          const a = -Math.PI / 2 + (i - 4) * 0.16;
          return (
            <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * 300} y2={cy + Math.sin(a) * 300} stroke="#f5f4ec" strokeWidth={0.8} opacity={0.07} />
          );
        })}
      </svg>
      <div className="relative z-10 text-center">
        <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-lime">Foresight</div>
        <div className="mt-1 font-serif text-[15px] italic text-paper">Futures deck</div>
      </div>
      <div className="absolute bottom-2 right-2 z-10 h-2 w-2 rounded-[1px]" style={{ background: edge }} />
    </div>
  );
}

// ---------------------------------------------------------------- driver chips
// The drivers a card's uncertainty traces back to. Chips expand to the driver's
// headline + body. Renders nothing if none of the card's drivers resolve.
export function DriverChips({
  sourceDriverIds,
  driversBySlug,
  label = "Drivers behind this uncertainty",
}: {
  sourceDriverIds: string[];
  driversBySlug: Map<string, DriverLite>;
  label?: string;
}) {
  const drivers = resolveDrivers(sourceDriverIds, driversBySlug);
  const [open, setOpen] = useState<string | null>(null);
  if (!drivers.length) return null;
  const active = drivers.find((d) => d.slug === open);
  return (
    <div className="mt-3">
      <div className="text-[9px] font-bold uppercase tracking-[0.09em] text-muted">{label}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {drivers.map((d) => (
          <button
            key={d.slug}
            onClick={() => setOpen(open === d.slug ? null : d.slug)}
            aria-pressed={open === d.slug}
            className={
              "rounded-[2px] border px-2 py-1 text-[10.5px] font-semibold transition-colors " +
              (open === d.slug
                ? "border-ink bg-lime"
                : "border-[var(--hairline)] bg-paper hover:border-ink")
            }
          >
            {d.name}
          </button>
        ))}
      </div>
      {active && (
        <div className="animate-rise mt-2 rounded-[2px] border-l-2 border-ink bg-card px-3 py-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.09em] text-muted">
            {active.theme}
          </div>
          <div className="mt-0.5 text-[13px] font-bold leading-[1.25]">{active.headline}</div>
          <div className="mt-1 text-[12px] leading-[1.45] text-muted">{active.body}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- flip
// Fixed-size 3D flip. `revealed` shows the front; otherwise the back.
export function FlipCard({
  revealed,
  front,
  back,
  className,
}: {
  revealed: boolean;
  front: ReactNode;
  back: ReactNode;
  className?: string; // set a height, e.g. "h-[210px]"
}) {
  return (
    <div className={className} style={{ perspective: "1200px" }}>
      <div
        className="relative h-full w-full transition-transform duration-[650ms] ease-out"
        style={{ transformStyle: "preserve-3d", transform: revealed ? "rotateY(0deg)" : "rotateY(180deg)" }}
      >
        <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
          {front}
        </div>
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          {back}
        </div>
      </div>
    </div>
  );
}
