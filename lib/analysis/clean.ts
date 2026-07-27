// Cleaning layer for the Analysis view (§3).
//
// Pure and deterministic: given the raw export entries, decide which submitted
// kernels are analysable, which to drop (with a reason), and which look like the
// same world submitted under different codes. Near-duplicates are *flagged*, not
// removed — the UI surfaces them as a caveat. Nothing here mutates its input.

import type { CleanResult, ExcludeReason, KernelEntry, NarrativeField } from "./types";
import { NARRATIVE_FIELDS } from "./types";

// Every free-text field on the record, used by the gibberish heuristic.
const TEXT_FIELDS: (keyof KernelEntry)[] = [
  "worldTitle",
  "convergence",
  "definingCharacteristics",
  "centralTension",
  "newNormal",
  "brokenAssumption",
  "primaryCondition",
  "worldDescription",
];

function str(entry: KernelEntry, field: keyof KernelEntry): string {
  const v = entry[field];
  return typeof v === "string" ? v.trim() : "";
}

// "adfadfa"-style keyboard mash: at least one field filled, and *every* filled
// text field is short (< 10 chars) with no internal whitespace.
function isGibberish(entry: KernelEntry): boolean {
  const filled = TEXT_FIELDS.map((f) => str(entry, f)).filter((v) => v.length > 0);
  if (filled.length === 0) return false;
  return filled.every((v) => v.length < 10 && !/\s/.test(v));
}

// A field counts as "filled" for analysis when its trimmed length exceeds 3.
export function isFilled(entry: KernelEntry, field: NarrativeField): boolean {
  return str(entry, field).length > 3;
}

// Card-only pre-seed / abandon: all five narrative fields blank or <= 3 chars.
function isEmptyText(entry: KernelEntry): boolean {
  return NARRATIVE_FIELDS.every((f) => str(entry, f).length <= 3);
}

// --- near-duplicate detection ---
//
// Two link signals, combined via union-find:
//   1. Text similarity: Jaccard over the narrative-field word tokens >= 0.6.
//   2. Structural + text: the two triads share >= 2 outcome cards AND their
//      narratives are clearly related (Jaccard >= 0.3).
//
// Signal 1 alone (pure text Jaccard) is what §3 names, but on the real export
// the same world resubmitted under different codes is *reworded* each time, so
// its narrative Jaccard sits near 0.3 — well below any text-only threshold that
// wouldn't also merge genuinely distinct worlds. Signal 2 is what actually
// catches those resubmissions: sharing 2 of 3 outcome cards is a strong
// structural tell, and requiring related text on top of it prevents the popular
// "convergence" cards (which many independent teams pick) from collapsing
// distinct worlds into one group. Together they flag {X4VR, P946, RH75} — the
// July export's known resubmission — and nothing else.

const TEXT_THRESHOLD = 0.6;
const STRUCT_TEXT_THRESHOLD = 0.3;
const STRUCT_SHARED_CARDS = 2;

function tokenize(entry: KernelEntry): Set<string> {
  const text = NARRATIVE_FIELDS.map((f) => str(entry, f))
    .join(" ")
    .toLowerCase();
  return new Set(text.match(/[a-z0-9]+/g) ?? []);
}

function cardTitleSet(entry: KernelEntry): Set<string> {
  const cards = Array.isArray(entry.cards) ? entry.cards : [];
  return new Set(cards.map((c) => c.title).filter(Boolean));
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const inter = overlap(a, b);
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Union-find over kept entries: link every pair the predicate joins, then return
// the connected components of size >= 2.
function nearDuplicateGroups(kept: KernelEntry[]): KernelEntry[][] {
  const tokens = kept.map(tokenize);
  const titles = kept.map(cardTitleSet);
  const parent = kept.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (i: number, j: number) => {
    parent[find(i)] = find(j);
  };

  const linked = (i: number, j: number): boolean => {
    const sim = jaccard(tokens[i], tokens[j]);
    if (sim >= TEXT_THRESHOLD) return true;
    return (
      overlap(titles[i], titles[j]) >= STRUCT_SHARED_CARDS &&
      sim >= STRUCT_TEXT_THRESHOLD
    );
  };

  for (let i = 0; i < kept.length; i++) {
    for (let j = i + 1; j < kept.length; j++) {
      if (linked(i, j)) union(i, j);
    }
  }

  const groups = new Map<number, KernelEntry[]>();
  for (let i = 0; i < kept.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(kept[i]);
  }
  return [...groups.values()].filter((g) => g.length >= 2);
}

/**
 * Clean a batch of raw export entries. Rules run in order: keep only Submitted,
 * drop gibberish, drop empty-text, drop manual excludes, then flag (not drop)
 * near-duplicate groups among what survives.
 */
export function cleanEntries(
  entries: KernelEntry[],
  opts: { excludeCodes?: string[] } = {}
): CleanResult {
  const excludeCodes = new Set((opts.excludeCodes ?? []).map((c) => c.toUpperCase()));
  const kept: KernelEntry[] = [];
  const excluded: { entry: KernelEntry; reason: ExcludeReason }[] = [];

  for (const entry of entries) {
    if (entry.status !== "Submitted") continue; // not an exclusion — just out of scope
    if (isGibberish(entry)) {
      excluded.push({ entry, reason: "gibberish" });
    } else if (isEmptyText(entry)) {
      excluded.push({ entry, reason: "empty-text" });
    } else if (excludeCodes.has((entry.code ?? "").toUpperCase())) {
      excluded.push({ entry, reason: "manual" });
    } else {
      kept.push(entry);
    }
  }

  return { kept, excluded, nearDuplicateGroups: nearDuplicateGroups(kept) };
}
