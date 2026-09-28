"use client";

import { useState } from "react";
import { MAX_TREE_DEPTH, childOrderOf, type RippleCard } from "@/lib/ripples-types";
import { flipOf, isHopeFear, type HopeFear, type SynthesisBoard } from "@/lib/synthesis-shape";
import { AddCardForm, InlineText } from "@/components/workshop/synthesis/SynthesisCard";

// One theme's hopes & fears, as a chain: hopes and fears written straight onto the theme,
// then each one's flip side hanging off it, onward.
//
// This is a sibling of ImplicationTree, not an extension of it, for three reasons:
//   1. ImplicationTree walks depthByCard over the WHOLE card array. On a Week 3 board a
//      theme's children are implications AND hopes/fears at the same depth, so it would
//      interleave the clustered implications into the chain. We need the kind-filtered
//      walk (board.chainDepth) instead.
//   2. Its vocabulary is all wrong here — a scenario root node, "Key change / 1st order"
//      column headers, "In this world… / Because of that…" prompts, rank badges, colour
//      by depth. Each would become another boolean prop on an already dense component.
//   3. The alternation rule (a fear's child is a hope) has no analogue there: it decides
//      the ＋ affordance's label and the kind it posts.
//
// What it DOES borrow is the technique. The nodes are plain render FUNCTIONS, not inner
// components — React then reconciles them by key instead of remounting, which is what stops
// the `animate-rise` entry animation replaying on every parent re-render. Do not "clean
// this up" into components.

// Geometry mirrors ImplicationTree's (the pattern source) but is kept local, so the two
// layouts stay free to diverge: a hope/fear chain is narrower and colours by kind, not
// depth. One constant per measurement, with the gap DERIVED so nothing drifts.
const NODE_W = 216;
const STUB_W = 20;
const SPINE_W = 2;
const TICK_W = 16;
const GAP_W = STUB_W + SPINE_W + TICK_W;

const KIND_BORDER: Record<HopeFear, string> = {
  hope: "var(--lime-deep)",
  fear: "var(--coral)",
};
const KIND_CHIP: Record<HopeFear, string> = {
  hope: "bg-lime text-ink",
  fear: "bg-coral text-white",
};

export function HopeFearChain({
  theme,
  board,
  editable,
  busy,
  onAdd,
  onEdit,
  onDelete,
}: {
  theme: RippleCard;
  board: SynthesisBoard;
  editable: boolean;
  busy: boolean;
  onAdd: (parent: RippleCard, kind: HopeFear, text: string) => void;
  onEdit: (card: RippleCard, text: string) => void;
  onDelete: (card: RippleCard) => void;
}) {
  // Which node is currently showing its composer, and for which kind. Hoisted here because
  // the nodes below are render functions and cannot hold state of their own.
  const [adding, setAdding] = useState<{ parentId: string; kind: HopeFear } | null>(null);

  const stub = () => (
    <span
      aria-hidden
      className="shrink-0 self-center border-t border-dashed border-[var(--rule)]"
      style={{ width: STUB_W }}
    />
  );
  const tick = () => (
    <span
      aria-hidden
      className="shrink-0 self-center border-t border-dashed border-[var(--rule)]"
      style={{ width: TICK_W }}
    />
  );

  // A composer, or the ＋ buttons that open one.
  const renderAdd = (parent: RippleCard, kinds: HopeFear[]) => {
    if (!editable) return null;
    const depth = board.chainDepth.get(parent.id);
    if (depth === undefined || depth >= MAX_TREE_DEPTH) return null;
    // childOrderOf is what the server will check, so if there's no valid child order the
    // chain has genuinely bottomed out.
    if (!childOrderOf(parent.order)) return null;

    const open = adding?.parentId === parent.id ? adding.kind : null;
    if (open) {
      return (
        <div style={{ width: NODE_W }} className="shrink-0">
          <AddCardForm
            label={open === "hope" ? "A hope this creates…" : "A fear this creates…"}
            busy={busy}
            autoFocus
            onAdd={(text) => onAdd(parent, open, text)}
            onDone={() => setAdding(null)}
          />
        </div>
      );
    }
    return (
      <div className="flex shrink-0 flex-col gap-1" style={{ width: NODE_W }}>
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => setAdding({ parentId: parent.id, kind: k })}
            className="rounded-[2px] border border-dashed border-[var(--rule)] px-2 py-1 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-muted hover:border-ink hover:text-ink"
          >
            ＋ {k === "hope" ? "a hope" : "a fear"}
          </button>
        ))}
      </div>
    );
  };

  // A single hope/fear node.
  const renderNode = (card: RippleCard, kind: HopeFear) => (
    <div
      className="group shrink-0 animate-rise rounded-[2px] border border-black/10 border-l-4 bg-paper p-2 text-[12.5px] leading-[1.4] shadow-[1px_2px_0_rgba(36,36,34,0.08)]"
      style={{ width: NODE_W, borderLeftColor: KIND_BORDER[kind] }}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className={
            "rounded-[2px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] " +
            KIND_CHIP[kind]
          }
        >
          {kind}
        </span>
        {editable && (
          <button
            onClick={() => onDelete(card)}
            aria-label="Delete card"
            className="ml-auto text-[11px] font-bold text-muted opacity-0 hover:text-coral group-hover:opacity-100 group-focus-within:opacity-100"
          >
            ✕
          </button>
        )}
      </div>
      <InlineText text={card.text} editable={editable} busy={busy} onSave={(t) => onEdit(card, t)} />
    </div>
  );

  // One node plus everything hanging off it, laid out left→right.
  const renderBranch = (card: RippleCard): React.ReactNode => {
    const kind = card.cardKind;
    if (!isHopeFear(kind)) return null;
    // Same invisibility rule as ImplicationTree's renderBranch: a card the walk never
    // placed is drawn nowhere.
    if (board.chainDepth.get(card.id) === undefined) return null;

    const kids = (board.chains.get(card.id) ?? []).filter((k) => isHopeFear(k.cardKind));
    // A fear's child is a hope, and the other way round — one ＋, already labelled.
    const addBlock = renderAdd(card, [flipOf(kind)]);

    return (
      <div key={card.id} className="flex items-start" style={{ gap: 0 }}>
        {renderNode(card, kind)}
        {(kids.length > 0 || addBlock) && stub()}
        {kids.length > 0 ? (
          <div className="flex flex-col gap-2 border-l-2 border-dashed border-[var(--rule)] pl-0">
            {kids.map((k) => (
              <div key={k.id} className="flex items-start">
                {tick()}
                {renderBranch(k)}
              </div>
            ))}
            {addBlock && (
              <div className="flex items-start">
                {tick()}
                {addBlock}
              </div>
            )}
          </div>
        ) : (
          addBlock
        )}
      </div>
    );
  };

  const roots = (board.chains.get(theme.id) ?? []).filter((c) => isHopeFear(c.cardKind));
  // The theme's own "write a hope / write a fear" lives in HopeFearPicker at the foot of
  // the step, so the chain only offers the per-node flip side.
  const themeAdd = null;

  // With nothing written yet the chain has nothing to draw; the picker below is the whole
  // interface at that point.
  if (roots.length === 0) return null;

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex items-start" style={{ gap: 0, minWidth: NODE_W * 2 + GAP_W }}>
        {/* The theme is the root of every chain. */}
        <div
          className="shrink-0 rounded-[2px] border-2 border-ink bg-card p-2.5 text-[13.5px] font-bold leading-[1.35]"
          style={{ width: NODE_W }}
        >
          <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.08em] text-muted">
            Theme
          </div>
          {theme.text}
        </div>

        {(roots.length > 0 || themeAdd) && stub()}

        <div className="flex flex-col gap-2 border-l-2 border-dashed border-[var(--rule)]">
          {roots.map((c) => (
            <div key={c.id} className="flex items-start">
              {tick()}
              {renderBranch(c)}
            </div>
          ))}
          {themeAdd && (
            <div className="flex items-start">
              {tick()}
              {themeAdd}
            </div>
          )}
          {roots.length === 0 && !themeAdd && (
            <div className="flex items-start">
              {tick()}
              <p className="py-2 text-[12px] italic text-muted">No hopes or fears yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
