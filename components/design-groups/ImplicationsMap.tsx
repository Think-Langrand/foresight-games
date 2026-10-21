"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { ImplicationsExercise } from "@/components/design-groups/AnswerPanels";
import { buildMapModel, defaultBranch } from "@/lib/implication-map-shape";
import { buildChildrenMap, orderLabelForDepth, type RippleCard } from "@/lib/ripples-types";
import { branchOf, keyChangeLabel } from "@/lib/synthesis-shape";

// The Session 2 map on the handoff: the key changes the group mapped across the top, that
// branch's wheel on the left, and whatever you click read out as sentences on the right.
//
// WHY NOT ImplicationsPanel. The panel is the right thing on the board and in the admin
// viewer, where the job is to interrogate the map: it carries a wheel/tree/list switch, order
// filters and zoom. The handoff is read, not interrogated, so this composes the same
// primitives — FuturesWheel, and lib/implication-map-shape for the branch model the panel
// also uses — behind one control: which key change. Nothing here changes the panel, so the
// board, the earlier-week tabs and both admin views are untouched.
//
// CLICKING A NODE narrows the readout to that node's chain and dims the rest of the wheel,
// which is what the wheel's own `highlightIds` / `selectedId` are for.
//
// WHY ssr: false. FuturesWheel lays out in floating point and writes the results into
// attributes and inline styles (`y2="209.51611348914545"`, `left: 620.641px`). Server and
// client disagree on the last digit and on px-vs-number, so server-rendering it throws a
// hydration mismatch React will not patch up. On the board it is always reached by a click,
// so it has never server-rendered; this page puts it in the first paint.
const FuturesWheel = dynamic(
  () => import("@/components/workshop/FuturesWheel").then((m) => m.FuturesWheel),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[320px] items-center justify-center">
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          Drawing the map…
        </p>
      </div>
    ),
  }
);

export default function ImplicationsMap({ ex }: { ex: ImplicationsExercise }) {
  const model = useMemo(() => buildMapModel(ex.cards), [ex.cards]);
  const children = useMemo(() => buildChildrenMap(model.tree), [model.tree]);
  const [branch, setBranch] = useState<string | null>(() => defaultBranch(model));
  // Which card in the branch the readout is pinned to. Null reads the whole branch.
  const [nodeId, setNodeId] = useState<string | null>(null);

  const root = branch ? (model.tree.find((c) => c.id === branch) ?? null) : null;

  // The branch as the wheel wants it: the key change becomes the hub, so it is dropped from
  // the cards and its children are reparented to the centre. Mirrors ImplicationsPanel.
  const wheelCards = useMemo(() => {
    if (!root) return model.tree;
    const sub = branchOf(model.tree, root.id);
    if (!sub) return model.tree;
    return sub.subtree
      .filter((c) => c.id !== sub.root.id)
      .map((c) => (c.parentId === sub.root.id ? { ...c, parentId: null } : c));
  }, [model.tree, root]);

  const descendantsOf = (id: string): string[] => {
    const out: string[] = [];
    const walk = (x: string) => {
      for (const k of children.get(x) ?? []) {
        out.push(k.id);
        walk(k.id);
      }
    };
    walk(id);
    return out;
  };

  // The chain to light up: the path down from the key change to the clicked card, plus
  // everything under it. branchOf gives the ancestry for free.
  const highlightIds = useMemo(() => {
    if (!nodeId) return undefined;
    const path = branchOf(model.tree, nodeId)?.pathIds ?? new Set<string>([nodeId]);
    return new Set<string>([...path, ...descendantsOf(nodeId)]);
    // descendantsOf closes over `children`, which the dep covers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, model.tree, children]);

  const pickBranch = (id: string) => {
    setBranch(id);
    setNodeId(null); // a held node from another branch would read as this one's
  };

  const toggleNode = (id: string) => setNodeId((cur) => (cur === id ? null : id));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The one control: which key change. No view switch, no order filter, no zoom — this
          is read, not interrogated. */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 pb-4">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Key change
        </span>
        {model.keyChanges.map((k) => {
          const on = k.key === branch;
          return (
            <button
              key={k.key}
              onClick={() => pickBranch(k.key)}
              aria-pressed={on}
              title={k.title}
              className={
                "whitespace-nowrap rounded-[2px] border px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] " +
                (on
                  ? "border-blue bg-blue text-white"
                  : "border-[var(--rule)] bg-paper text-muted hover:border-blue hover:text-ink")
              }
            >
              {k.label} <span className="tabular-nums opacity-80">{k.count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="min-h-0 min-w-0 overflow-auto overscroll-contain rounded-[3px] border border-[var(--hairline)] bg-card p-3">
          {root ? (
            <FuturesWheel
              cards={wheelCards}
              centerLabel={keyChangeLabel(root.text)}
              variant="branch"
              zoom="fit"
              selectedId={nodeId ?? undefined}
              highlightIds={highlightIds}
              nodeProps={(cardId) => ({
                onClick: () => toggleNode(cardId),
                onKeyDown: (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleNode(cardId);
                  }
                },
                role: "button",
                tabIndex: 0,
                "aria-pressed": cardId === nodeId,
                style: { cursor: "pointer" },
              })}
            />
          ) : (
            <p className="m-0 p-4 text-[14px] text-muted">
              This group did not map implications under any key change.
            </p>
          )}
        </div>

        <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain border-t border-[var(--hairline)] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <Readout
            tree={model.tree}
            children_={children}
            depths={model.depths}
            root={root}
            nodeId={nodeId}
            onClear={() => setNodeId(null)}
          />
        </div>
      </div>
    </div>
  );
}

// The picked chain, read as one connected path.
//
// With a node picked the panel reads top to bottom as a single chain: the key change, then
// each step down to the card you clicked, each joined by an arrow, with the clicked one
// picked out — and then everything that follows from it underneath. That is the shape of the
// group's own reasoning, and a breadcrumb ("A › B › C") flattened it into a line of clipped
// fragments, which is what this replaces.
//
// NOTHING IS TRUNCATED HERE. These are the group's sentences; a clipped implication makes a
// reader guess at the half that was cut.
function Readout({
  tree,
  children_,
  depths,
  root,
  nodeId,
  onClear,
}: {
  tree: RippleCard[];
  children_: Map<string | null, RippleCard[]>;
  depths: Map<string, number>;
  root: RippleCard | null;
  nodeId: string | null;
  onClear: () => void;
}) {
  if (!root) return null;

  const byId = new Map(tree.map((c) => [c.id, c]));
  const node = nodeId ? (byId.get(nodeId) ?? null) : null;
  const head = node ?? root;

  // Walk UP from the clicked card and reverse, so the path is already in reading order —
  // root first. Cycle-guarded, like every other walk over parent_card_id.
  const path: RippleCard[] = (() => {
    const out: RippleCard[] = [];
    const seen = new Set<string>();
    let cur: RippleCard | undefined = head;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.push(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return out.reverse();
  })();

  const under = (() => {
    let n = 0;
    const walk = (x: string) => {
      for (const k of children_.get(x) ?? []) {
        n += 1;
        walk(k.id);
      }
    };
    walk(head.id);
    return n;
  })();

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-0 font-mono text-[10px] uppercase tracking-[0.14em] text-blue">
          {node ? "This chain" : "The whole branch"}
        </p>
        {node && (
          <button
            onClick={onClear}
            className="shrink-0 rounded-[2px] border border-[var(--rule)] bg-paper px-2 py-[3px] font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted hover:border-ink hover:text-ink"
          >
            Whole branch ×
          </button>
        )}
      </div>

      {/* The path down to the picked card. One item when nothing is picked. */}
      <ol className="m-0 mt-4 list-none p-0">
        {path.map((c, i) => {
          const d = depths.get(c.id) ?? 0;
          const on = node !== null && c.id === head.id;
          return (
            <li key={c.id}>
              <div
                className={
                  "grid grid-cols-[22px_1fr] items-start gap-2 rounded-[2px] py-2 pr-2 " +
                  (on ? "border-l-[3px] border-blue bg-blue/10 pl-2" : "pl-[3px]")
                }
              >
                <span
                  className={
                    "mt-[5px] justify-self-center rounded-full " +
                    (on ? "h-[9px] w-[9px] bg-blue" : "h-[7px] w-[7px] bg-[var(--rule)]")
                  }
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="m-0 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                    {orderLabelForDepth(d)}
                    {on && <span className="ml-2 font-bold text-blue">selected</span>}
                  </p>
                  <p
                    className={
                      "m-0 mt-[3px] max-w-[52ch] leading-[1.45] " +
                      (on
                        ? "text-[15px] font-bold"
                        : i === 0
                          ? "text-[14px] font-bold"
                          : "text-[14px]")
                    }
                  >
                    {c.text}
                  </p>
                </div>
              </div>

              {/* The connector, aligned under the dot. */}
              {i < path.length - 1 && (
                <div className="ml-[13px] flex h-5 flex-col items-center" aria-hidden="true">
                  <span className="w-px flex-1 bg-[var(--rule)]" />
                  <svg width="9" height="5" viewBox="0 0 9 5" className="block">
                    <path d="M0 0 L4.5 5 L9 0 Z" fill="var(--rule)" />
                  </svg>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* And what follows from it. */}
      <div className="mt-6">
        <p className="m-0 border-b border-ink pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          {under > 0 ? (
            <>
              What follows <span className="tabular-nums text-ink">{under}</span>
            </>
          ) : (
            "Nothing follows"
          )}
        </p>
        {under > 0 ? (
          <Branch
            ids={(children_.get(head.id) ?? []).map((c) => c.id)}
            tree={tree}
            children_={children_}
            depths={depths}
          />
        ) : (
          <p className="m-0 py-3 text-[14px] italic text-muted">
            The chain ends here. Nothing was mapped below it.
          </p>
        )}
      </div>
    </>
  );
}


function Branch({
  ids,
  tree,
  children_,
  depths,
}: {
  ids: string[];
  tree: RippleCard[];
  children_: Map<string | null, RippleCard[]>;
  depths: Map<string, number>;
}) {
  if (!ids.length) return null;
  return (
    <ul className="m-0 list-none p-0">
      {ids.map((id) => {
        const card = tree.find((c) => c.id === id);
        if (!card) return null;
        const kids = (children_.get(id) ?? []).map((c) => c.id);
        const d = depths.get(id) ?? 1;
        return (
          <li key={id}>
            <div className="relative border-b border-[var(--hairline)] py-[9px] pl-[22px]">
              <span
                className="absolute left-0 top-[14px] rounded-full bg-blue"
                style={{
                  width: Math.max(8 - d, 3),
                  height: Math.max(8 - d, 3),
                  opacity: Math.max(1 - (d - 1) * 0.16, 0.42),
                }}
              />
              <p className="m-0 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                {orderLabelForDepth(d)}
              </p>
              <p className="m-0 mt-[3px] max-w-[52ch] text-[14px] leading-[1.45]">{card.text}</p>
            </div>
            {kids.length > 0 && (
              <div className="ml-3 border-l border-[var(--hairline)] pl-3">
                <Branch ids={kids} tree={tree} children_={children_} depths={depths} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
