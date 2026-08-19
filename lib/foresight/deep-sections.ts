// Pull the "second page" deep-read sections out of a scenario. The platform exposes
// them two ways depending on scenario vintage:
//   1. Structured `sections` keys (newer): `upside`, `blind_spot`, `arrival` — each a
//      markdown string.
//   2. `##` headings inside `body` markdown (older, e.g. "## Why This Future Arrives").
// Page 2 of the scenario reader surfaces the three named ones in a fixed order,
// preferring the structured section, then the body heading. Whichever are present.

export interface DeepSection {
  key: string;
  label: string;
  content: string; // markdown
}

const TARGETS: { key: string; label: string; sectionKey: string; match: RegExp }[] = [
  { key: "makes-possible", label: "What this world makes possible", sectionKey: "upside", match: /makes possible/i },
  { key: "blind-spot", label: "Structural blind spot", sectionKey: "blind_spot", match: /blind spot/i },
  { key: "why-arrives", label: "Why this future arrives", sectionKey: "arrival", match: /why this future arrives/i },
];

// Split body into { heading, content } blocks by `##`/`###` headings.
function blocksOf(body: string): { heading: string; content: string }[] {
  const out: { heading: string; content: string }[] = [];
  let heading: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (heading !== null) out.push({ heading, content: buf.join("\n").trim() });
  };
  for (const line of body.split("\n")) {
    const m = /^#{2,3}\s+(.+?)\s*$/.exec(line.trim());
    if (m) {
      flush();
      heading = m[1].trim();
      buf = [];
    } else if (heading !== null) {
      buf.push(line);
    }
  }
  flush();
  return out;
}

export function extractScenarioDeepSections(scenario: {
  sections?: Record<string, unknown> | null;
  body?: string | null;
}): DeepSection[] {
  const sections = (scenario.sections ?? {}) as Record<string, unknown>;
  const blocks = scenario.body ? blocksOf(scenario.body) : [];
  const out: DeepSection[] = [];
  for (const t of TARGETS) {
    // Prefer the structured section key…
    const sv = sections[t.sectionKey];
    let content = typeof sv === "string" && sv.trim() ? sv.trim() : "";
    // …then fall back to a matching `##` body heading.
    if (!content) {
      const b = blocks.find((bl) => t.match.test(bl.heading));
      if (b?.content) content = b.content;
    }
    if (content) out.push({ key: t.key, label: t.label, content });
  }
  return out;
}
