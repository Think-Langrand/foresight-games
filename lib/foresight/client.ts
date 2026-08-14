import "server-only";

// Server-only client for the external Foresight / Carmelita "scenario display" API
// (docs/docs/api-ingestion.md). Read-only, server-to-server, authenticated with a
// shared key sent as the `X-Foresight-Key` header. NEVER import this into a client
// component — the key must never reach the browser.
//
// Mirrors the shape of lib/airtable.ts: env read inline, a `configured()` guard, a
// typed error class + guard, a centralized error mapper, and a thin typed fetch
// wrapper with per-call cache control.

import type {
  PublicDriverCard,
  PublicUncertainty,
  Scenario,
  ScenarioCard,
  ScenarioSet,
  ScenarioSetSummary,
} from "./types";

// The API lives under `/api/v1/foresight`. The canonical env var (per the doc) is
// FORESIGHT_API_URL and includes that path; this repo's existing .env.local uses
// FORESIGHT_URL and points at the bare host. Accept either and normalize so both
// `http://localhost:8000` and `http://localhost:8000/api/v1/foresight` work.
const API_PATH = "/api/v1/foresight";

function resolveBase(): string | undefined {
  const raw = (process.env.FORESIGHT_API_URL ?? process.env.FORESIGHT_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!raw) return undefined;
  return raw.includes(API_PATH) ? raw : `${raw}${API_PATH}`;
}

const BASE = resolveBase();
const KEY = process.env.FORESIGHT_API_KEY;

// Multi-tenant seam: today every route passes this single default. To go
// multi-tenant later, resolve the ref per project (route segment / passphrase /
// tenant table) and pass it explicitly — nothing else in this module changes.
export const DEFAULT_PROJECT_REF = process.env.FORESIGHT_PROJECT_REF ?? "nnphi";

export function foresightConfigured(): boolean {
  return Boolean(BASE && KEY);
}

// Raised on any non-2xx response. `status` lets callers distinguish "not found"
// (404) or "malformed uuid slot" (422) — both of which a route should turn into
// notFound() — from real failures (401 bad key, 5xx) that should surface as errors.
export class ForesightError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly path: string
  ) {
    super(`Foresight ${status} on ${path}: ${detail}`);
    this.name = "ForesightError";
  }
}

// A 404 (unknown/unpublished ref) or 422 (a non-UUID in a UUID-typed slot, e.g. a
// hand-typed setId) means "this thing isn't here" — routes should render 404, not 500.
export function isForesightNotFound(err: unknown): boolean {
  return (
    err instanceof ForesightError && (err.status === 404 || err.status === 422)
  );
}

// A human-readable reason for a failed request, for the ForesightUnavailable panel.
// Network failures (backend down) throw a plain TypeError("fetch failed").
export function describeForesightFailure(err: unknown): string {
  if (err instanceof ForesightError) {
    if (err.status === 401)
      return "Authentication failed — check FORESIGHT_API_KEY.";
    return `The platform API returned ${err.status}.`;
  }
  return "The foresight platform API couldn't be reached. Is the backend running, and is FORESIGHT_API_URL correct?";
}

interface FetchOpts {
  // Next.js fetch cache control. Default is `no-store` because payloads carry
  // signed image URLs that expire; caching the JSON would serve stale/expired URLs.
  revalidate?: number | false;
}

async function foresight<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  if (!foresightConfigured()) {
    throw new Error(
      "Foresight API not configured (set FORESIGHT_API_URL and FORESIGHT_API_KEY)."
    );
  }

  const init: RequestInit & { next?: { revalidate: number } } = {
    headers: { "X-Foresight-Key": KEY! },
  };
  if (typeof opts.revalidate === "number") {
    init.next = { revalidate: opts.revalidate };
  } else {
    init.cache = "no-store";
  }

  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    // FastAPI error bodies look like { "detail": "…" }.
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      // non-JSON body — keep the status text
    }
    throw new ForesightError(res.status, detail, path);
  }
  return res.json() as Promise<T>;
}

// --- Public data helpers. `ref` defaults to DEFAULT_PROJECT_REF (the seam). ---

// §5.1 — published set summaries. No-store so a set that was just published on the
// platform shows up here immediately rather than after a cache window.
export function getScenarioSets(
  ref: string = DEFAULT_PROJECT_REF
): Promise<ScenarioSetSummary[]> {
  return foresight<ScenarioSetSummary[]>(
    `/projects/${encodeURIComponent(ref)}/scenario-sets`
  );
}

// §5.2 — one set with its scenario cards (cards carry expiring coverImageUrls, so
// no-store). Returns null on 404/422 so pages can call notFound().
export async function getScenarioSet(
  setId: string,
  ref: string = DEFAULT_PROJECT_REF
): Promise<ScenarioSet | null> {
  try {
    return await foresight<ScenarioSet>(
      `/projects/${encodeURIComponent(ref)}/scenario-sets/${encodeURIComponent(setId)}`
    );
  } catch (err) {
    if (isForesightNotFound(err)) return null;
    throw err;
  }
}

// §5.3 — flat cards across the project (optionally scoped to one set). No route
// uses this in the first pass, but it's ready for a future "all scenarios" grid.
export function getScenarios(
  opts: { setId?: string; ref?: string } = {}
): Promise<ScenarioCard[]> {
  const ref = opts.ref ?? DEFAULT_PROJECT_REF;
  const qs = opts.setId
    ? `?set_id=${encodeURIComponent(opts.setId)}`
    : "";
  return foresight<ScenarioCard[]>(
    `/projects/${encodeURIComponent(ref)}/scenarios${qs}`
  );
}

// §5.4 — one full scenario, resolved by slug (preferred) or UUID. The endpoint
// needs only scenarioRef; the setId in the route is used for navigation, not here.
// Returns null on 404/422 so pages can call notFound().
export async function getScenario(
  scenarioRef: string,
  ref: string = DEFAULT_PROJECT_REF
): Promise<Scenario | null> {
  try {
    return await foresight<Scenario>(
      `/projects/${encodeURIComponent(ref)}/scenarios/${encodeURIComponent(scenarioRef)}`
    );
  } catch (err) {
    if (isForesightNotFound(err)) return null;
    throw err;
  }
}

// --- Model down-flow: a project's drivers + uncertainties ------------------
// These power the per-project /project/<slug>/{drivers,uncertainties} pages.
// Driver cards carry signed, expiring imageUrls, so no-store here too.

// GET /projects/{ref}/drivers — the project's driver cards (unpaginated).
export function getForesightDrivers(
  ref: string = DEFAULT_PROJECT_REF
): Promise<PublicDriverCard[]> {
  return foresight<PublicDriverCard[]>(
    `/projects/${encodeURIComponent(ref)}/drivers`
  );
}

// GET /projects/{ref}/uncertainties — full list, ordered by number, each with
// its complete outcomes[] inline (the deck's raw material).
export function getForesightUncertainties(
  ref: string = DEFAULT_PROJECT_REF
): Promise<PublicUncertainty[]> {
  return foresight<PublicUncertainty[]>(
    `/projects/${encodeURIComponent(ref)}/uncertainties`
  );
}
