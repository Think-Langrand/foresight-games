// The geometry of the scenario-to-theme flow. Pure, so the arithmetic that makes a Sankey
// honest is under test rather than eyeballed in a browser.
//
// The one property that matters: the ribbons leaving a node must exactly fill it. A Sankey
// whose ribbons do not add up to their node is not an imperfect picture, it is a picture
// claiming a group contributed more or less material than it did.

export interface FlowLink {
  groupId: string;
  themeIndex: number;
  count: number;
}

export interface FlowNode {
  key: string;
  side: "source" | "target";
  value: number;
  x: number;
  y: number;
  h: number;
}

export interface FlowRibbon {
  groupId: string;
  themeIndex: number;
  count: number;
  thickness: number;
  path: string;
}

export interface FlowLayout {
  sources: FlowNode[];
  targets: FlowNode[];
  ribbons: FlowRibbon[];
  width: number;
  height: number;
}

export interface FlowOpts {
  height: number;
  nodeWidth: number;
  gap: number; // vertical space between nodes in a column
  width?: number;
}

// Stack one column: every node's height is its share of the column's total, after the gaps
// between them have been taken out of the available space.
function stack(
  entries: { key: string; value: number }[],
  height: number,
  gap: number,
  x: number,
  side: "source" | "target"
): FlowNode[] {
  const live = entries.filter((e) => e.value > 0);
  if (live.length === 0) return [];
  const total = live.reduce((s, e) => s + e.value, 0);
  const usable = Math.max(1, height - gap * (live.length - 1));
  let y = 0;
  return live.map((e) => {
    const h = (e.value / total) * usable;
    const node: FlowNode = { key: e.key, side, value: e.value, x, y, h };
    y += h + gap;
    return node;
  });
}

export function flowLayout(
  groupIds: string[],
  themeCount: number,
  links: FlowLink[],
  opts: FlowOpts
): FlowLayout {
  const width = opts.width ?? 100;
  const live = links.filter((l) => l.count > 0);
  if (live.length === 0) return { sources: [], targets: [], ribbons: [], width, height: opts.height };

  const sumBy = <K extends string | number>(key: (l: FlowLink) => K) => {
    const m = new Map<K, number>();
    for (const l of live) m.set(key(l), (m.get(key(l)) ?? 0) + l.count);
    return m;
  };

  const byGroup = sumBy((l) => l.groupId);
  const byTheme = sumBy((l) => l.themeIndex);

  const sources = stack(
    groupIds.map((id) => ({ key: id, value: byGroup.get(id) ?? 0 })),
    opts.height,
    opts.gap,
    0,
    "source"
  );
  const targets = stack(
    Array.from({ length: themeCount }, (_, i) => ({ key: String(i), value: byTheme.get(i) ?? 0 })),
    opts.height,
    opts.gap,
    width - opts.nodeWidth,
    "target"
  );

  // Pack ribbons into each node in a stable order, tracking how far down each node we have
  // got. Both ends are packed the same way, which is what makes the sums come out exact.
  const srcCursor = new Map(sources.map((n) => [n.key, n.y]));
  const tgtCursor = new Map(targets.map((n) => [n.key, n.y]));
  const srcNode = new Map(sources.map((n) => [n.key, n]));
  const tgtNode = new Map(targets.map((n) => [n.key, n]));

  const ordered = [...live].sort(
    (a, b) =>
      groupIds.indexOf(a.groupId) - groupIds.indexOf(b.groupId) || a.themeIndex - b.themeIndex
  );

  const ribbons: FlowRibbon[] = [];
  for (const l of ordered) {
    const s = srcNode.get(l.groupId);
    const t = tgtNode.get(String(l.themeIndex));
    if (!s || !t) continue;
    const sT = (l.count / s.value) * s.h;
    const tT = (l.count / t.value) * t.h;
    const sy = srcCursor.get(s.key)!;
    const ty = tgtCursor.get(t.key)!;
    srcCursor.set(s.key, sy + sT);
    tgtCursor.set(t.key, ty + tT);

    const x0 = opts.nodeWidth;
    const x1 = width - opts.nodeWidth;
    const cx = (x0 + x1) / 2;
    // A closed band rather than a thick stroke, so its two ends can differ in thickness
    // when a group's share of a theme is not the theme's share of the group.
    ribbons.push({
      groupId: l.groupId,
      themeIndex: l.themeIndex,
      count: l.count,
      thickness: sT,
      path:
        `M${x0},${sy} C${cx},${sy} ${cx},${ty} ${x1},${ty} ` +
        `L${x1},${ty + tT} C${cx},${ty + tT} ${cx},${sy + sT} ${x0},${sy + sT} Z`,
    });
  }

  return { sources, targets, ribbons, width, height: opts.height };
}
