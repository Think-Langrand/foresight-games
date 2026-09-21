// Card colour by tree depth — echoes the paper game (white/yellow/red) in the
// deck's own palette: key change = lime, 1st order = blue, 2nd = amber, 3rd =
// coral. Deeper than that the four hues cycle, lightened a step on each pass so
// depth 0 and depth 4 don't read as the same level. Used to tint the
// implication-tree node borders, the list dots and the wheel rings.
const DEPTH_HUES = ["var(--lime-deep)", "var(--blue)", "var(--amber)", "var(--coral)"];

export function rippleDepthColor(depth: number): string {
  const d = Math.max(0, Math.trunc(depth));
  const hue = DEPTH_HUES[d % DEPTH_HUES.length];
  const pass = Math.floor(d / DEPTH_HUES.length);
  if (pass === 0) return hue;
  // Each further pass washes the hue toward the paper ground.
  const strength = Math.max(35, 100 - pass * 30);
  return `color-mix(in srgb, ${hue} ${strength}%, var(--paper))`;
}
