import type { ThemeProgress } from "@/lib/synthesis-shape";

// How far a theme has got, as the three things a picker can show: a word for the title, a
// colour, and a glyph. One module, because the theme rail on step 1 and the chips on step
// 3 are two pickers for the same list and must not disagree about what "done" looks like.

export const STATE_LABEL: Record<ThemeProgress, string> = {
  empty: "nothing yet",
  started: "in progress",
  done: "done",
};

export const STATE_DOT: Record<ThemeProgress, string> = {
  empty: "text-black/25",
  started: "text-blue",
  done: "text-[var(--lime-deep)]",
};

export function stateGlyph(state: ThemeProgress): string {
  return state === "done" ? "●" : state === "started" ? "◐" : "○";
}
