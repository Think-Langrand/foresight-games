// Core foresight model types. Mirrors data/model.seed.json and the Airtable base.

export type Direction =
  | "Positive for public health"
  | "Negative for public health"
  | "Mixed / depends";

export type Alignment =
  | "Self-aligned"
  | "Engineered alignment"
  | "Needs collective action"
  | "Mixed / depends";

export type Effect =
  | "Strengthens"
  | "Weakens"
  | "Breaks / reverses"
  | "Reshapes"
  | "Neutral / unclear";

export type Magnitude = "High" | "Medium" | "Low";

export interface LoopImpact {
  id: string;
  label: string;
  effect: Effect;
  magnitude: Magnitude;
  mechanism: string;
  loopName: string;
  loopSubsystem: string;
  loopCode: string;
}

export interface Outcome {
  id: string;
  label: string;
  direction: Direction;
  alignment: Alignment;
  narrative: string;
  strategicMove: string;
  impacts: LoopImpact[];
}

export interface Uncertainty {
  id: string;
  label: string;
  question: string;
  poleA: string;
  poleB: string;
  sharpest: boolean;
  outcomes: Outcome[];
}

export interface Driver {
  id: string;
  name: string;
  theme: string;
  headline: string;
  short: string;
  neutralHeadline: string;
  neutralReading: string;
  neutralName: string;
  topRight: boolean;
  impact?: string;
  uncertainty?: string;
  uncertainties: Uncertainty[];
}

export interface Model {
  drivers: Driver[];
}

// Theme sort order the explorer uses.
export const THEME_ORDER = [
  "Keystone",
  "Trust, Legitimacy & Information",
  "The Social Fabric",
  "The Institutional Base",
  "The Data & AI Inflection",
  "The Shifting Burden of Disease",
  "Decentralization & Consumerization",
] as const;

// Short display direction (strip the " for public health" suffix used in the base).
export function shortDirection(d: Direction): "Positive" | "Negative" | "Mixed / depends" {
  if (d.startsWith("Positive")) return "Positive";
  if (d.startsWith("Negative")) return "Negative";
  return "Mixed / depends";
}

export function isHopefulSeed(o: Outcome): boolean {
  return (
    o.direction.startsWith("Positive") &&
    (o.alignment === "Self-aligned" || o.alignment === "Engineered alignment")
  );
}
