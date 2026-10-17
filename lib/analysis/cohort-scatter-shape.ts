// Axis arithmetic for the weight map. Pure, because both ways of getting it wrong are
// invisible once the chart is drawn and neither shows up as an error.

export interface Span {
  lo: number;
  hi: number;
}

// The visible range for a set of means on a 1-5 scale.
//
// Two failures this has to avoid at once:
//
// A theme's score is the mean of several key changes and means regress to the centre, so
// the real spread is narrow -- around 0.5 on live data. Plotting the full 1-5 grid puts
// every dot in one corner, which is why the axes zoom to the data at all.
//
// But padding and then clamping to [1,5] deletes the padding exactly when a value sits at
// the end of the scale, which a mean of 5.0 does on the real data. That dot's centre lands
// on the top gridline with its upper half outside the plot. So the padding goes OUTSIDE the
// nominal scale rather than being clipped back into it: an axis that reads 5.2 is honest,
// a dot half off the canvas is not.
const MIN_SPAN = 0.6;
const PAD_FLOOR = 0.12;
const PAD_SHARE = 0.18;

export function axisSpan(values: number[]): Span {
  if (values.length === 0) return { lo: 1, hi: 5 };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(PAD_FLOOR, (hi - lo) * PAD_SHARE);
  let [a, b] = [lo - pad, hi + pad];
  if (b - a < MIN_SPAN) {
    const mid = (a + b) / 2;
    [a, b] = [mid - MIN_SPAN / 2, mid + MIN_SPAN / 2];
  }
  return { lo: a, hi: b };
}

// Half-point ticks inside a span, kept to the real scale: an axis may extend past 5 to make
// room for a dot, but there is no such thing as a plausibility of 5.5 and labelling one
// would be worse than the crowding it avoids.
export function axisTicks(s: Span): number[] {
  const clamp = (v: number) => Math.min(5, Math.max(1, Math.round(v * 10) / 10));
  const add = (set: Set<number>, v: number) => {
    if (v >= s.lo - 0.001 && v <= s.hi + 0.001) set.add(clamp(v));
  };

  const half = new Set<number>();
  for (let v = Math.ceil(s.lo * 2) / 2; v <= s.hi + 0.001; v += 0.5) add(half, v);
  if (half.size >= 2) return [...half].sort((a, b) => a - b);

  // A span narrower than one half-point yields one tick or none, and an axis drawn with a
  // single bare line has no scale at all. Fall back to quarter-points, then to the span's
  // own ends.
  //
  // A SET, not an array, and this is the whole reason the fallback is written out: the
  // previous one returned [ceil(lo), floor(hi)], which for a span of 4.52-5.1 is [5, 5] --
  // the same tick twice. React logged a duplicate-key error and one gridline silently
  // disappeared, and no test caught it because nothing tested the ticks.
  const quarter = new Set(half);
  for (let v = Math.ceil(s.lo * 4) / 4; v <= s.hi + 0.001; v += 0.25) add(quarter, v);
  if (quarter.size >= 2) return [...quarter].sort((a, b) => a - b);

  const ends = new Set<number>([clamp(s.lo), clamp(s.hi)]);
  return [...ends].sort((a, b) => a - b);
}
