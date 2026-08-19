// Pull the "second page" deep-read sections out of a scenario's `body` markdown.
// The platform writes the deeper editorial layer as `##` sections inside `body`
// (e.g. "## Why This Future Arrives"); page 2 of the scenario reader surfaces the
// three named ones — in a fixed order — rendering whichever are present. Content
// creators add the missing ones as `##` headings and they light up automatically.

export interface DeepSection {
  key: string;
  label: string; // normalized display label (the body heading's exact case varies)
  content: string; // markdown between this heading and the next
}

const TARGETS: { key: string; label: string; match: RegExp }[] = [
  { key: "makes-possible", label: "What this world makes possible", match: /makes possible/i },
  { key: "blind-spot", label: "Structural blind spot", match: /blind spot/i },
  { key: "why-arrives", label: "Why this future arrives", match: /why this future arrives/i },
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

export function extractScenarioDeepSections(body: string | null | undefined): DeepSection[] {
  if (!body || !body.trim()) return [];
  const blocks = blocksOf(body);
  const out: DeepSection[] = [];
  for (const t of TARGETS) {
    const b = blocks.find((bl) => t.match.test(bl.heading));
    if (b && b.content) out.push({ key: t.key, label: t.label, content: b.content });
  }
  return out;
}
