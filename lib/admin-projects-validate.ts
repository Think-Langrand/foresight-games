import "server-only";

import {
  defaultHomeConfig,
  normalizeHomeConfig,
  type HomeConfig,
} from "@/lib/project-home";

// Request-body validation for the admin projects API. Returns cleaned input or an
// error message. `slug` is validated/returned only on create (immutable on edit).
// The passphrase is handled as plaintext here; the route hashes it (lib/project-gate).

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function slugOf(v: unknown): string | null {
  const s = str(v, 80).toLowerCase();
  return SLUG_RE.test(s) ? s : null;
}

export interface ProjectParsed {
  slug: string; // create only
  name: string;
  carmelitaProjectRef: string;
  homeConfig: HomeConfig;
  enabled: boolean;
  passphrase: string; // plaintext; "" = none provided
  clearPassphrase: boolean; // edit only: explicitly remove the gate
}

export function parseProject(
  body: unknown,
  { withSlug }: { withSlug: boolean }
): { input: ProjectParsed } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  const name = str(b.name, 200);
  if (!name) return { error: "Name is required." };

  const carmelitaProjectRef = str(b.carmelitaProjectRef, 200);
  if (!carmelitaProjectRef)
    return { error: "A Carmelita project id is required." };

  let slug = "";
  if (withSlug) {
    const s = slugOf(b.slug);
    if (!s) return { error: "A valid slug is required (lowercase, hyphenated)." };
    slug = s;
  }

  const homeConfig =
    b.homeConfig === undefined
      ? defaultHomeConfig()
      : normalizeHomeConfig(b.homeConfig);

  return {
    input: {
      slug,
      name,
      carmelitaProjectRef,
      homeConfig,
      enabled: b.enabled !== false, // default true
      passphrase: str(b.passphrase, 200),
      clearPassphrase: b.clearPassphrase === true,
    },
  };
}
