// Pure normalization for the scenario `sections` bag (a flexible
// Record<string, unknown> from the Foresight API). Prose keys are strings;
// "list" keys (Rules, Regimes, Glossary, Institutions, Dynamics) are arrays of
// small objects whose shapes are not final — normalize defensively so the UI can
// render title-only rows that expand, without hard-coding a fixed set of keys.
//
// Kept React-free and exported so it can be unit-tested under the node test env.

export type NormItem = {
  id: string;
  title: string;
  body: string;
  preferred: boolean;
};

export type NormSection =
  | { key: string; title: string; kind: "prose"; body: string }
  | { key: string; title: string; kind: "list"; items: NormItem[] };

// "governing_settlement" -> "Governing settlement"
export function humanizeKey(key: string): string {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function pickTitle(obj: Record<string, unknown>): string {
  const t = obj.title ?? obj.name ?? obj.term ?? obj.label;
  return typeof t === "string" && t.trim() ? t : "(untitled)";
}

function pickBody(obj: Record<string, unknown>): string {
  const b = obj.text ?? obj.definition ?? obj.description ?? obj.body;
  if (typeof b === "string") return b;
  // Unknown shape — surface whatever remains, minus the title-ish keys.
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (["title", "name", "term", "label", "preferred"].includes(k)) continue;
    rest[k] = v;
  }
  return Object.keys(rest).length ? JSON.stringify(rest, null, 2) : "";
}

export function normalizeSections(
  sections: Record<string, unknown> | null | undefined
): NormSection[] {
  return Object.entries(sections ?? {}).map(([key, value]) => {
    const title = humanizeKey(key);
    if (typeof value === "string") {
      return { key, title, kind: "prose", body: value };
    }
    if (Array.isArray(value)) {
      const seen = new Map<string, number>();
      const items: NormItem[] = value.map((raw, index) => {
        const obj = asRecord(raw);
        const itemTitle = obj ? pickTitle(obj) : String(raw);
        const body = obj ? pickBody(obj) : "";
        // Stable-ish id for the hidden-set; index fallback, de-duped.
        const base = `${key}::${slug(itemTitle) || index}`;
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        const id = n === 0 ? base : `${base}-${n}`;
        return {
          id,
          title: itemTitle,
          body,
          preferred: Boolean(obj && obj.preferred === true),
        };
      });
      return { key, title, kind: "list", items };
    }
    // Bare object / other → prose fallback.
    return { key, title, kind: "prose", body: JSON.stringify(value, null, 2) };
  });
}
