// Client-safe shaping for the Session 2 IMPLICATION MAP. No server imports — safe in client
// components, route handlers, and tests.
//
// WHY THIS IS ITS OWN MODULE. This was inline in ImplicationsPanel, which was fine while the
// panel was the only thing that drew the map. The handoff page now draws the same map in a
// split layout (map left, the picked chain read out on the right), and to open on the same
// branch the panel would open on, it has to agree about which roots are pickable and in what
// order. Two copies of that rule would drift, so there is one.

import { buildChildrenMap, depthByCard, type RippleCard } from "@/lib/ripples-types";
import { sortRootsByRank } from "@/lib/ripples-scoring";
import { keyChangeLabel } from "@/lib/synthesis-shape";

export interface MapKeyChange {
  key: string; // the root card's id
  label: string; // shortened for a chip
  title: string; // the whole key change, for a tooltip
  count: number; // everything under it, at any depth
}

export interface MapOrder {
  order: number; // depth, 1 = first order
  count: number;
}

export interface MapModel {
  tree: RippleCard[]; // the map without the brainstorm stickies
  depths: Map<string, number>;
  roots: RippleCard[]; // pickable key changes, in rank order
  keyChanges: MapKeyChange[]; // the same roots as chips
  orders: MapOrder[];
  total: number; // every implication below a key change
}

export function buildMapModel(cards: RippleCard[]): MapModel {
  const tree = cards.filter((c) => c.order !== "STICKY");
  const depths = depthByCard(tree);
  const children = buildChildrenMap(tree);
  const everyRoot = sortRootsByRank((children.get(null) ?? []).filter((c) => depths.has(c.id)));

  const countUnder = (id: string): number => {
    let n = 0;
    const walk = (x: string) => {
      for (const k of children.get(x) ?? []) {
        if (!depths.has(k.id)) continue;
        n += 1;
        walk(k.id);
      }
    };
    walk(id);
    return n;
  };

  // Only key changes the group actually mapped under — a chip reading "0" is noise, and a
  // branch with nothing in it is a hub and no wheel. The whole map still draws them all.
  const roots = everyRoot.filter((r) => countUnder(r.id) > 0);
  const keyChanges = roots.map((r) => ({
    key: r.id,
    label: keyChangeLabel(r.text),
    title: r.text,
    count: countUnder(r.id),
  }));

  const orderCounts = new Map<number, number>();
  for (const c of tree) {
    const d = depths.get(c.id);
    if (d !== undefined && d > 0) orderCounts.set(d, (orderCounts.get(d) ?? 0) + 1);
  }
  const orders = [...orderCounts.keys()]
    .sort((a, b) => a - b)
    .map((o) => ({ order: o, count: orderCounts.get(o)! }));

  return {
    tree,
    depths,
    roots,
    keyChanges,
    orders,
    total: orders.reduce((n, o) => n + o.count, 0),
  };
}

// The branch the map opens on: the top-ranked key change that was actually mapped under, or
// null ("any key change") when none was. Mirrors ImplicationsPanel's own `undefined` default,
// so a caller that controls the pick starts where the panel would have.
export function defaultBranch(model: MapModel): string | null {
  return model.roots[0]?.id ?? null;
}
