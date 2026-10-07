"use client";

import { rippleDepthColor } from "@/components/workshop/RippleCard";
import { ordinal } from "@/lib/synthesis-shape";

// The controls every implications map shares — the live cluster board's and the read-only
// Session 2 view's — so looking at a map is the same wherever you are looking at it:
//
//   KeyChangeChips  which key change's branch — one each, then "Any key change" last
//   OrderChips      which order is in view, each in its colour — "All" first
//   MapToolbar      zoom − + Fit, the order legend, and the way through the branches
//
// Each row opens with one word saying what it filters, so the two rows of chips read as
// two questions rather than one run of buttons.
//
// One colour per order, the same hue the Week 2 wheel gives that ring (RippleCard's depth
// palette: 1st blue, 2nd amber, 3rd coral, then cycling lighter), so a chip, a card's stamp
// and the ring round a circle all agree. Tinted for the off state so the text stays loudest.

export const orderColor = (order: number) => rippleDepthColor(order);
export const orderTint = (order: number) => `color-mix(in srgb, ${orderColor(order)} 28%, var(--card))`;
// The hue cycle lands on lime every fourth order, and lime wants ink text, not white.
export const orderOnText = (order: number) => (order % 4 === 0 ? "var(--ink)" : "#fff");

export type Zoom = number | "fit";

// One step of zoom from where the map is, or back to fit. `fitScale` is what "fit" has
// resolved to, so the first step from Fit moves from what is on screen rather than to 125%.
export function stepZoom(zoom: Zoom, dir: "in" | "out", fitScale: number): number {
  const from = typeof zoom === "number" ? zoom : fitScale || 1;
  const next = dir === "in" ? from * 1.25 : from / 1.25;
  return Math.min(2, Math.max(0.25, Number(next.toFixed(3))));
}

// The one-word label that opens a row of chips.
function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mr-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted">{children}</span>
  );
}

// The key changes come first, in the order the board ranks them, and the first one is
// what a board opens on; "Any key change" is the way out to the whole wheel, so it sits
// last rather than being the first thing to read.
export function KeyChangeChips({
  items,
  allCount,
  value,
  onChange,
}: {
  items: { key: string; label: string; count: number; title?: string }[];
  allCount: number;
  value: string | null;
  onChange: (key: string | null) => void;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <RowLabel>Key change:</RowLabel>
      {[...items, null].map((it) => {
        const key = it === null ? null : it.key;
        const on = value === key;
        return (
          <button
            key={key ?? "all-keys"}
            onClick={() => onChange(key)}
            aria-pressed={on}
            title={it === null ? "Every key change" : (it.title ?? it.label)}
            className={
              // No truncation here: the label is already capped, and clipping it also
              // clipped the count, which is the half worth reading.
              "whitespace-nowrap rounded-[2px] border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] " +
              (on
                ? "border-blue bg-blue text-white"
                : "border-[var(--rule)] bg-paper text-muted hover:border-blue hover:text-ink")
            }
          >
            {it === null ? "Any key change" : it.label} {it === null ? allCount : it.count}
          </button>
        );
      })}
    </span>
  );
}

export function OrderChips({
  orders,
  allCount,
  value,
  onChange,
}: {
  orders: { order: number; count: number }[];
  allCount: number;
  value: number | null;
  onChange: (order: number | null) => void;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <RowLabel>Order:</RowLabel>
      {[null, ...orders].map((it) => {
        const o = it === null ? null : it.order;
        const on = value === o;
        const colour = o === null ? null : orderColor(o);
        return (
          <button
            key={o ?? "all"}
            onClick={() => onChange(o)}
            aria-pressed={on}
            title={
              o === null
                ? "Every implication"
                : `${ordinal(o)}-order — ${o} step${o === 1 ? "" : "s"} from its key change`
            }
            className={
              "flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] " +
              (colour === null
                ? on
                  ? "border-ink bg-ink text-paper"
                  : "border-[var(--rule)] bg-paper text-muted hover:border-ink hover:text-ink"
                : on
                  ? ""
                  : "text-ink hover:brightness-95")
            }
            style={
              o === null || colour === null
                ? undefined
                : on
                  ? { background: colour, borderColor: colour, color: orderOnText(o) }
                  : { background: orderTint(o), borderColor: colour }
            }
          >
            {colour !== null && !on && (
              <span aria-hidden className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: colour }} />
            )}
            {o === null ? "All" : ordinal(o)} {it === null ? allCount : it.count}
          </button>
        );
      })}
    </span>
  );
}

// Zoom, the order legend, and — when there is more than one branch — which one is drawn
// and the way through all of them. `branch.index` null = every key change at once.
export function MapToolbar({
  zoom,
  onZoom,
  orders,
  branch,
}: {
  zoom: Zoom;
  onZoom: (dir: "in" | "out" | "fit") => void;
  orders: number[];
  branch?: {
    label: string;
    index: number | null;
    total: number;
    onStep: (step: -1 | 1) => void;
  };
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">Zoom</span>
      {([
        ["−", "out"],
        ["+", "in"],
      ] as const).map(([glyph, dir]) => (
        <button
          key={dir}
          onClick={() => onZoom(dir)}
          aria-label={dir === "in" ? "Zoom in" : "Zoom out"}
          className="rounded-[2px] border border-[var(--rule)] bg-paper px-2 py-0.5 text-[12px] font-bold leading-none text-muted hover:border-ink hover:text-ink"
        >
          {glyph}
        </button>
      ))}
      <button
        onClick={() => onZoom("fit")}
        aria-pressed={zoom === "fit"}
        className={
          "rounded-[2px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] " +
          (zoom === "fit"
            ? "border-ink bg-ink text-paper"
            : "border-[var(--rule)] bg-paper text-muted hover:border-ink hover:text-ink")
        }
      >
        Fit
      </button>
      {typeof zoom === "number" && (
        <span className="text-[10px] font-bold text-muted">{Math.round(zoom * 100)}%</span>
      )}

      {orders.length > 0 && (
        <span className="ml-2 flex items-center gap-1.5" aria-label="Colours by order">
          {orders.map((o) => (
            <span key={o} className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.05em] text-muted">
              <span aria-hidden className="inline-block h-[9px] w-[9px] rounded-full" style={{ background: orderColor(o) }} />
              {ordinal(o)}
            </span>
          ))}
        </span>
      )}

      {branch && branch.total > 1 && (
        <span className="ml-auto flex min-w-0 items-center gap-1.5">
          <span
            className="min-w-0 max-w-[20rem] truncate text-[10.5px] font-bold uppercase tracking-[0.05em]"
            title={branch.label}
          >
            {branch.label}
          </span>
          <span className="shrink-0 whitespace-nowrap text-[10px] font-bold text-muted">
            {branch.index === null ? `${branch.total} maps` : `${branch.index + 1}/${branch.total}`}
          </span>
          {([
            ["‹", -1, "Previous key change"],
            ["›", 1, "Next key change"],
          ] as const).map(([glyph, step, label]) => (
            <button
              key={step}
              onClick={() => branch.onStep(step)}
              aria-label={label}
              title={label}
              className="shrink-0 rounded-[2px] border border-ink bg-paper px-2 py-0.5 text-[12px] font-bold leading-none hover:bg-lime"
            >
              {glyph}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
