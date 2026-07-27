import "server-only";

import type { DriverInput, UncertaintyInput, OutcomeInput } from "@/lib/admin-content";

// Shared request-body validation for the admin content API routes. Returns the
// cleaned input, or an error message. Slug is only validated/returned on create
// (it is immutable on edit).

const ROLES = new Set(["Core", "Edge", "Wildcard"]);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function slugOf(v: unknown): string | null {
  const s = str(v, 80).toLowerCase();
  return SLUG_RE.test(s) ? s : null;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function parseDriver(
  body: unknown,
  { withSlug }: { withSlug: boolean }
): { input: DriverInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = str(b.name, 200);
  if (!name) return { error: "Name is required." };
  let slug = "";
  if (withSlug) {
    const s = slugOf(b.slug);
    if (!s) return { error: "A valid slug is required (lowercase, hyphenated)." };
    slug = s;
  }
  return {
    input: {
      slug,
      number: num(b.number),
      name,
      theme: str(b.theme, 200),
      headline: str(b.headline, 500),
      body: str(b.body, 5000),
    },
  };
}

function parseOutcomes(v: unknown): OutcomeInput[] | { error: string } {
  if (!Array.isArray(v)) return { error: "Outcomes must be a list." };
  const out: OutcomeInput[] = [];
  for (const raw of v) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const title = str(o.title, 300);
    if (!title) continue; // skip blank rows
    const role = str(o.role, 20);
    out.push({
      code: typeof o.code === "string" && /^C\d+$/.test(o.code) ? o.code : undefined,
      role: ROLES.has(role) ? role : "Core",
      title,
      description: str(o.description, 2000),
    });
  }
  if (out.length === 0) return { error: "At least one outcome is required." };
  return out;
}

export function parseUncertainty(
  body: unknown,
  { withSlug }: { withSlug: boolean }
): { input: UncertaintyInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = str(b.title, 300);
  if (!title) return { error: "Title is required." };
  let slug = "";
  if (withSlug) {
    const s = slugOf(b.slug);
    if (!s) return { error: "A valid slug is required (lowercase, hyphenated)." };
    slug = s;
  }
  const outcomes = parseOutcomes(b.outcomes);
  if ("error" in outcomes) return { error: outcomes.error };
  const sourceDriverIds = Array.isArray(b.sourceDriverIds)
    ? [...new Set(b.sourceDriverIds.filter((x): x is string => typeof x === "string"))]
    : [];
  return {
    input: {
      slug,
      number: num(b.number),
      domain: str(b.domain, 200),
      title,
      question: str(b.question, 1000),
      sourceDriverIds,
      outcomes,
    },
  };
}
