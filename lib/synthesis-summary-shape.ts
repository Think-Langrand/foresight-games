// Client-safe shape of the facilitator's executive summary of a Week 3 board (steps 1–2:
// themes, their four answers, risks and opportunities), plus the pure digest the model
// is prompted with. No runtime imports: lib/ripples-types imports coerceSummary, and
// anything imported here at runtime would close a cycle back into it.
//
// The summary is stored on the board's session config (sessions.config.summary), which is
// in the realtime publication — so a facilitator generating it is enough for every member
// to see it land. The model call itself lives in lib/analysis/synthesis-summary.ts.

import type { SynthesisExercise } from "@/components/design-groups/AnswerPanels";

export interface SynthesisSummaryTheme {
  themeId: string; // the theme card's id at generation; the theme may since have gone
  title: string;
  about: string; // what the theme is about, in a sentence or two
  atStake: string; // the four answers, condensed
  risks: string[];
  opportunities: string[];
}

export interface SynthesisSummary {
  overview: string; // across every theme: what is at stake in this future
  themes: SynthesisSummaryTheme[];
  tensions: string[]; // disagreements and pulls in different directions, left unresolved
  generatedAt: string; // ISO
  // summaryCardCount(board) when it was written. Kept for summaries written before
  // inputHash existed; the UI falls back to comparing counts for those.
  cardCount: number;
  // summaryInputHash(ex) when it was written: a hash of exactly the text the model read.
  // The UI says "the board has changed since" when the live hash differs — so an edited
  // answer or a renamed theme counts as a change, where a count alone would miss it.
  inputHash?: string;
}

// A hash of what the model is given (summaryDigest(ex).text), as a short hex string.
// FNV-1a over UTF-16 code units: no crypto needed, this only has to answer "same input
// or not" and be identical on the server that writes it and the client that compares.
export function summaryInputHash(ex: SynthesisExercise): string {
  const text = summaryDigest(ex).text;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${text.length.toString(16)}-${h.toString(16).padStart(8, "0")}`;
}

// Clamps applied to whatever the model returns. Strict JSON schema cannot express maxLength,
// so these live in code.
export const SUMMARY_LIMITS = {
  overview: 1200,
  field: 600,
  item: 300,
  items: 8,
  themes: 20,
} as const;

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const strList = (v: unknown, max: number, count: number): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => str(x, max))
        .filter((x) => x.length > 0)
        .slice(0, count)
    : [];

// A stored blob → a summary, or null when it is not one. Tolerant of extra keys and of
// theme blocks whose theme has since been deleted (they still read by title).
export function coerceSummary(raw: unknown): SynthesisSummary | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const overview = str(r.overview, SUMMARY_LIMITS.overview);
  const generatedAt = typeof r.generatedAt === "string" && Number.isFinite(Date.parse(r.generatedAt)) ? r.generatedAt : "";
  if (!overview || !generatedAt) return null;
  const themes: SynthesisSummaryTheme[] = Array.isArray(r.themes)
    ? r.themes
        .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
        .map((t) => ({
          themeId: str(t.themeId, 80),
          title: str(t.title, SUMMARY_LIMITS.item),
          about: str(t.about, SUMMARY_LIMITS.field),
          atStake: str(t.atStake, SUMMARY_LIMITS.field),
          risks: strList(t.risks, SUMMARY_LIMITS.item, SUMMARY_LIMITS.items),
          opportunities: strList(t.opportunities, SUMMARY_LIMITS.item, SUMMARY_LIMITS.items),
        }))
        .filter((t) => t.title.length > 0)
        .slice(0, SUMMARY_LIMITS.themes)
    : [];
  return {
    overview,
    themes,
    tensions: strList(r.tensions, SUMMARY_LIMITS.item, SUMMARY_LIMITS.items),
    generatedAt,
    cardCount: typeof r.cardCount === "number" && Number.isFinite(r.cardCount) ? r.cardCount : 0,
    ...(typeof r.inputHash === "string" && r.inputHash.length > 0 ? { inputHash: r.inputHash } : {}),
  };
}

// --- the digest the model reads ---------------------------------------------------

export interface SummaryDigestTheme {
  key: string; // t1, t2, … — what the model is asked to refer to themes by
  themeId: string;
  title: string;
  description: string | null;
  answers: string[]; // "Question — answer"
  risks: string[];
  opportunities: string[];
}

export interface SummaryDigest {
  themes: SummaryDigestTheme[];
  text: string; // the prompt body
  keyToId: Record<string, string>;
}

const CLIP = 400;
const clip = (s: string) => (s.length > CLIP ? s.slice(0, CLIP - 1).trimEnd() + "…" : s);

// Themes as short keys with everything steps 1–2 wrote on them. Short keys rather than
// uuids, as the clustering tool does: the model copies them back exactly, and they cost a
// token each. Capped by total length — a theme past the cap is left out whole rather than
// cut mid-answer, so what the model reads is always complete per theme.
export function summaryDigest(ex: SynthesisExercise, maxChars = 12000): SummaryDigest {
  const themes: SummaryDigestTheme[] = [];
  const keyToId: Record<string, string> = {};
  const parts: string[] = [];
  let used = 0;

  ex.themes.forEach((t, i) => {
    const key = `t${i + 1}`;
    const theme: SummaryDigestTheme = {
      key,
      themeId: t.id,
      title: clip(t.text.trim() || `Theme ${i + 1}`),
      description: t.description?.trim() ? clip(t.description.trim()) : null,
      answers: t.answers.map((a) => clip(`${a.label} — ${a.text.trim()}`)),
      risks: t.risks.map((r) => clip(r.text.trim())).filter(Boolean),
      opportunities: t.opportunities.map((o) => clip(o.text.trim())).filter(Boolean),
    };
    const lines = [
      `Theme ${key}: ${theme.title}`,
      theme.description ? `About: ${theme.description}` : null,
      ...theme.answers.map((a) => `Q: ${a}`),
      ...theme.risks.map((r) => `Risk: ${r}`),
      ...theme.opportunities.map((o) => `Opportunity: ${o}`),
    ].filter((l): l is string => Boolean(l));
    const block = lines.join("\n");
    if (used + block.length + 2 > maxChars && themes.length > 0) return;
    used += block.length + 2;
    themes.push(theme);
    keyToId[key] = t.id;
    parts.push(block);
  });

  return { themes, text: parts.join("\n\n"), keyToId };
}
