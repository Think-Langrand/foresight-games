// Assembles the full payload the Analysis view renders, from a set of raw export
// entries. Kept deliberately subset-agnostic (§10): the routes call it with all
// entries, one session's entries, or a code-filtered slice — same function,
// same output shape — so a future "compare two sessions" view can reuse it.

import { cleanEntries } from "./clean";
import {
  cardFrequency,
  dimensionFrequency,
  roleSplit,
  cardCoOccurrence,
  dimensionCoOccurrence,
  duplicateTriads,
  fieldFillRates,
} from "./aggregate";
import type {
  CardStat,
  CleanResult,
  KernelEntry,
  NarrativeField,
  PairStat,
} from "./types";

export interface AnalysisData {
  kept: KernelEntry[];
  excluded: CleanResult["excluded"];
  nearDuplicateGroups: KernelEntry[][];
  cards: CardStat[];
  dimensions: { dimension: string; picks: number }[];
  roleSplit: { core: number; edge: number };
  cardPairs: PairStat[];
  dimensionPairs: PairStat[];
  duplicateTriads: { triad: string[]; entries: KernelEntry[] }[];
  fillRates: Record<NarrativeField, number>;
  codes: string[]; // distinct session codes among kept, for the filter row
  families: string[]; // distinct non-empty families among kept
  toneCounts: { hopeful: number; dark: number };
  taggedCount: number; // kept entries with a tone tag
}

export function buildAnalysisData(
  entries: KernelEntry[],
  opts: { allDimensions?: string[]; excludeCodes?: string[] } = {}
): AnalysisData {
  const clean = cleanEntries(entries, { excludeCodes: opts.excludeCodes });
  const { kept } = clean;

  const codes = [...new Set(kept.map((e) => e.code).filter(Boolean))].sort();
  const families = [
    ...new Set(kept.map((e) => (e.family ?? "").trim()).filter(Boolean)),
  ].sort();

  let hopeful = 0;
  let dark = 0;
  for (const e of kept) {
    if (e.tone === "hopeful") hopeful++;
    else if (e.tone === "dark") dark++;
  }

  return {
    kept,
    excluded: clean.excluded,
    nearDuplicateGroups: clean.nearDuplicateGroups,
    cards: cardFrequency(kept),
    dimensions: dimensionFrequency(kept, opts.allDimensions),
    roleSplit: roleSplit(kept),
    cardPairs: cardCoOccurrence(kept, 2),
    dimensionPairs: dimensionCoOccurrence(kept, 2),
    duplicateTriads: duplicateTriads(kept),
    fillRates: fieldFillRates(kept),
    codes,
    families,
    toneCounts: { hopeful, dark },
    taggedCount: hopeful + dark,
  };
}
