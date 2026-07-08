// Client-safe UI helpers: color maps + small utilities. No server imports here.
import type { Alignment, Direction, Effect, Magnitude } from "@/lib/types";

export const DIR_COLOR: Record<string, string> = {
  Positive: "#2F8F2A",
  Negative: "#FF644E",
  "Mixed / depends": "#B9860B",
};

export const ALIGN: Record<Alignment, { c: string; bg: string; short: string }> = {
  "Self-aligned": { c: "#2F8F2A", bg: "rgba(47,143,42,0.10)", short: "Self-aligned" },
  "Engineered alignment": { c: "#275DE2", bg: "rgba(39,93,226,0.10)", short: "Engineered" },
  "Needs collective action": {
    c: "#FF644E",
    bg: "rgba(255,100,78,0.10)",
    short: "Needs collective",
  },
  "Mixed / depends": { c: "#B9860B", bg: "rgba(185,134,11,0.12)", short: "Mixed" },
};

export const EFFECT_COLOR: Record<Effect, string> = {
  Strengthens: "#2F8F2A",
  Weakens: "#E07A26",
  "Breaks / reverses": "#D1382A",
  Reshapes: "#4B45C6",
  "Neutral / unclear": "#6B6B5E",
};

export function effectColor(e: Effect | string): string {
  return EFFECT_COLOR[e as Effect] ?? "#6B6B5E";
}
export function effectBg(e: Effect | string): string {
  return effectColor(e) + "1A";
}

export function dirColor(d: Direction | string): string {
  if (typeof d === "string" && d.startsWith("Positive")) return DIR_COLOR.Positive;
  if (typeof d === "string" && d.startsWith("Negative")) return DIR_COLOR.Negative;
  return DIR_COLOR["Mixed / depends"];
}

export const MAG_OPACITY: Record<Magnitude, number> = { High: 1, Medium: 0.6, Low: 0.3 };
