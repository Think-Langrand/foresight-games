"use client";

import { useRef, useState } from "react";
import { CARD_DESCRIPTION_MAX, type RippleCard } from "@/lib/ripples-types";
import {
  childrenOf,
  implicationKey,
  implicationOrder,
  insertionPoint,
  ordinal,
  twinIndex,
  type SynthesisBoard,
} from "@/lib/synthesis-shape";
import {
  AddCardForm,
  CardMenu,
  CardMenuItem,
  InlineText,
} from "@/components/workshop/synthesis/SynthesisCard";
import type { Week2Lineage } from "@/lib/synthesis-shape";
import {
  DeleteThemeModal,
  type DeleteThemeMode,
} from "@/components/workshop/synthesis/DeleteThemeModal";

// Implication cards carry their own tint so they read as objects sitting IN a theme rather
// than as text printed on it — the theme box is lime, its well is near-white, and a card
// needs to be neither.
const CARD_BG = "#efeade";

// STEP 1 — cluster Week 2's implications into themes.
//
// An unclustered tray at the top, a row of theme columns below it, and a Parked drawer at
// the bottom. Everything is drag-and-drop: reorder inside the tray, reorder inside a theme,
// move a card across themes, park it, and reorder the theme columns themselves. Positions
// are list positions, not free coordinates — columns stay columns.
//
// Drag and drop is NATIVE HTML5, mirroring components/workshop/BrainstormSection.tsx (the
// only other drag surface in the repo, and no DnD library is installed). Two departures
// from that file, both deliberate:
//
//   1. dragstart calls dataTransfer.setData(). Firefox and Safari refuse to start a drag
//      without it — Chrome is the only engine that tolerates the omission. The dragged id
//      still lives in React state; the payload is only there to make the drag legal.
//   2. Dropping onto a CARD means "put it here", so every card is a drop target as well as
//      a drag source, and the container handles the leftover "drop at the end" case. Inner
//      handlers stopPropagation so the container's does not also fire. Which HALF of the
//      card you are over decides before or after it, so you can place a card precisely
//      rather than only ever landing in front of the one you dropped on.
//
// Ordering is a `sort` value per card, renumbered by planReorder — see lib/synthesis-shape.

type Drag = { id: string; kind: "card" | "theme" };
// Which card the pointer is over and which side of it — `after` is the far side along the
// list's axis (right in a wrapping row, below in a column). `anchorId` null = past the end.
type Over = { zone: string; anchorId: string | null; after: boolean };
type Axis = "x" | "y";

// Is the pointer past the midpoint of this element, along the list's axis?
function isFarSide(e: React.DragEvent, axis: Axis): boolean {
  const r = e.currentTarget.getBoundingClientRect();
  return axis === "x" ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
}

export function ClusterBoard({
  board,
  lineage,
  editable,
  busy,
  onAddTheme,
  onAddImplication,
  onEditCard,
  onDescribeCard,
  onMoveCard,
  onMoveTheme,
  onStartTheme,
  onPark,
  onDeleteCard,
  onDeleteTheme,
  onMerge,
  onCopyToTheme,
  onCreateThemeFrom,
}: {
  board: SynthesisBoard;
  // Week 2 ancestry, keyed by Week 2 card id — a seeded card points at one via sourceCardId.
  lineage: Record<string, Week2Lineage>;
  editable: boolean;
  busy: boolean;
  onAddTheme: (text: string) => void;
  onAddImplication: (text: string, themeId: string | null) => void;
  onEditCard: (card: RippleCard, text: string) => void;
  onDescribeCard: (card: RippleCard, description: string) => void;
  // Put `card` in `themeId` (null = the tray), immediately before `beforeId` (null = last).
  onMoveCard: (card: RippleCard, themeId: string | null, beforeId: string | null) => void;
  onMoveTheme: (theme: RippleCard, beforeId: string | null) => void;
  // Dropped on empty theme space: make a theme and put the card straight into it.
  onStartTheme: (card: RippleCard) => void;
  onPark: (card: RippleCard, parked: boolean) => void;
  onDeleteCard: (card: RippleCard) => void;
  // Deleting a theme also decides the fate of what it holds — see DeleteThemeModal.
  onDeleteTheme: (theme: RippleCard, mode: DeleteThemeMode) => void;
  onMerge: (survivor: RippleCard, absorbed: RippleCard) => void;
  // Put this implication in ANOTHER theme as well, keeping the one it is already in.
  // Clustering is not a partition — see migration 0023.
  onCopyToTheme: (card: RippleCard, themeId: string) => void;
  // Make a theme and move these tray implications into it, in one go.
  onCreateThemeFrom: (cardIds: string[]) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [addingTheme, setAddingTheme] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null); // theme id, or "tray"
  const [mergeFrom, setMergeFrom] = useState<RippleCard | null>(null);
  // The card whose "also add to…" picker is open. Null when none is.
  const [copyFrom, setCopyFrom] = useState<RippleCard | null>(null);
  // Tray cards ticked for "create theme from selected". Drag still works and is untouched;
  // this is the other way round the same job, for a group that would rather read the whole
  // tray and tick than pick cards up one at a time.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Show only implications this many steps out from their key change. null = all.
  const [orderFilter, setOrderFilter] = useState<number | null>(null);
  const togglePicked = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [showParked, setShowParked] = useState(false);
  // The theme awaiting a delete decision. Nothing is written until the modal is answered,
  // so a theme never vanishes and then reappears when the route refuses.
  const [pendingDelete, setPendingDelete] = useState<RippleCard | null>(null);
  const columnRefs = useRef(new Map<string, HTMLDivElement | null>());

  const byId = new Map<string, RippleCard>();
  for (const c of [
    ...board.themes,
    ...board.unclustered,
    ...board.parked,
    ...[...board.clusters.values()].flat(),
  ])
    byId.set(c.id, c);

  // Everything that would go with a theme: its hope/fear chains to full depth, plus the
  // risks, opportunities and tensions written on it. The modal names the damage, so an
  // undercount here is the difference between an informed choice and a surprise.
  const chainCountOf = (themeId: string): number => {
    let n = 0;
    const walk = (id: string, seen: Set<string>) => {
      for (const c of childrenOf(board, id)) {
        if (seen.has(c.id) || c.cardKind === null) continue;
        seen.add(c.id);
        n += 1;
        walk(c.id, seen);
      }
    };
    walk(themeId, new Set([themeId]));
    return n;
  };

  const endDrag = () => {
    setDrag(null);
    setOver(null);
  };

  // --- drop handling ---------------------------------------------------------
  const dropCard = (zone: string, beforeId: string | null) => {
    const card = drag && drag.kind === "card" ? byId.get(drag.id) : null;
    endDrag();
    if (!card || !editable) return;
    if (zone === "parked") {
      if (card.cardKind === "theme") return; // a theme is emptied and deleted, never parked
      if (!card.parked) onPark(card, true);
      return;
    }
    if (card.parked) onPark(card, false); // dragged back out of the drawer
    if (zone === "newtheme") {
      onStartTheme(card);
      return;
    }
    onMoveCard(card, zone === "tray" ? null : zone.slice("theme:".length), beforeId);
  };

  const dropTheme = (beforeId: string | null) => {
    const theme = drag && drag.kind === "theme" ? byId.get(drag.id) : null;
    endDrag();
    if (theme && editable) onMoveTheme(theme, beforeId);
  };

  // Shared wiring for a drop ZONE (a list's empty space — "drop at the end").
  const zoneProps = (zone: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!editable || drag?.kind !== "card") return;
      e.preventDefault();
      setOver({ zone, anchorId: null, after: true });
    },
    onDragLeave: () => setOver((v) => (v?.zone === zone ? null : v)),
    onDrop: (e: React.DragEvent) => {
      if (!editable || drag?.kind !== "card") return;
      e.stopPropagation();
      dropCard(zone, null);
    },
  });

  // Shared wiring for a CARD as a drop target: "put it on this side of me".
  const slotProps = (zone: string, anchorId: string, axis: Axis, list: RippleCard[]) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!editable || drag?.kind !== "card") return;
      e.preventDefault();
      e.stopPropagation();
      setOver({ zone, anchorId, after: isFarSide(e, axis) });
    },
    onDrop: (e: React.DragEvent) => {
      if (!editable || drag?.kind !== "card") return;
      e.stopPropagation();
      dropCard(zone, insertionPoint(list, anchorId, isFarSide(e, axis), drag.id));
    },
  });

  // The new-theme zones take a click as well as a drop, so you can start a theme by naming
  // it instead of having to drag something first. Keyboard-reachable, because a drop target
  // that is also the only way to do something must not be mouse-only.
  const newThemeClickProps = editable
    ? {
        role: "button" as const,
        tabIndex: 0,
        onClick: () => setAddingTheme(true),
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setAddingTheme(true);
          }
        },
      }
    : {};

  const dragProps = (id: string, kind: Drag["kind"]) => ({
    draggable: editable,
    onDragStart: (e: React.DragEvent) => {
      if (!editable) return;
      // The payload is never read — setData is what makes the drag legal in Firefox/Safari.
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
      setDrag({ id, kind });
    },
    onDragEnd: endDrag,
  });

  // Which edge of this card the insertion bar sits on, if any.
  const barSide = (zone: string, cardId: string): "near" | "far" | null => {
    if (drag?.kind !== "card" || over?.zone !== zone || over.anchorId !== cardId) return null;
    return over.after ? "far" : "near";
  };
  const zoneLit = (zone: string) => drag?.kind === "card" && over?.zone === zone;

  // --- card ------------------------------------------------------------------
  // A plain render FUNCTION, not a nested component. Declaring a component inside another
  // gives it a fresh identity on every render, so React unmounts and remounts it — which
  // would throw away a half-typed inline edit whenever the realtime refetch lands.
  // (ImplicationTree.tsx documents the same rule for the same reason.)
  // Where every implication on this board lives. One pass, read per card below, so a
  // doubled-up implication is visible wherever it appears rather than only where it was
  // copied from.
  const twins = twinIndex(board);

  // The tray by order, so the filter can be built and labelled from one pass. A card typed
  // here by hand has no Week 2 ancestry and so no order; it is always shown, because
  // hiding something a filter cannot describe is worse than a slightly longer list.
  const orderOf = (c: RippleCard) =>
    implicationOrder(lineage[c.sourceCardId ?? twins.get(implicationKey(c))?.sourceCardId ?? ""]);
  const orderCounts = new Map<number, number>();
  for (const c of board.unclustered) {
    const o = orderOf(c);
    if (o !== null) orderCounts.set(o, (orderCounts.get(o) ?? 0) + 1);
  }
  const orders = [...orderCounts.keys()].sort((a, b) => a - b);
  const tray =
    orderFilter === null
      ? board.unclustered
      : board.unclustered.filter((c) => orderOf(c) === orderFilter);

  const renderCard = (
    card: RippleCard,
    zone: string,
    themeId: string | null,
    axis: Axis,
    list: RippleCard[]
  ) => {
    const dragging = drag?.id === card.id;
    const merging = mergeFrom !== null && mergeFrom.id !== card.id;
    const hasChildren = childrenOf(board, card.id).length > 0;
    const info = twins.get(implicationKey(card));
    const inThemes = info?.themeIds.length ?? 0;
    // A copy carries no sourceCardId of its own (it stays out of 0018's unique
    // constraint), so the trail is read from whichever copy does hold the Week 2 link.
    const sourceId = card.sourceCardId ?? info?.sourceCardId ?? null;
    const from = sourceId ? lineage[sourceId] : undefined;
    const order = implicationOrder(from);
    return (
      <div
        {...dragProps(card.id, "card")}
        {...slotProps(zone, card.id, axis, list)}
        style={{ background: CARD_BG }}
        className={
          "group relative w-full rounded-[3px] border p-2.5 shadow-[1px_2px_0_rgba(36,36,34,0.10)] " +
          (editable ? "cursor-grab active:cursor-grabbing " : "") +
          (dragging ? "rotate-1 opacity-40 " : "") +
          (merging ? "border-blue " : inThemes > 1 ? "border-blue/60 " : "border-black/15 ")
        }
      >
        <div className="flex items-start gap-1.5">
          {editable && zone === "tray" && (
            <input
              type="checkbox"
              checked={picked.has(card.id)}
              onChange={() => togglePicked(card.id)}
              // The card itself is draggable; without this a mousedown on the box starts a
              // drag instead of ticking it — the same trap the lineage disclosure hit.
              onDragStart={(e) => e.preventDefault()}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select: ${card.text.slice(0, 60)}`}
              className="mt-[3px] shrink-0 cursor-pointer"
            />
          )}
          {/* The implication is the card. Everything else is secondary to it. */}
          <div className="min-w-0 flex-1 text-[13.5px] leading-[1.45]">
            <InlineText
              text={card.text}
              editable={editable}
              busy={busy}
              onSave={(next) => onEditCard(card, next)}
            />
          </div>

          {/* How far from the key change this sits. First-order is a direct consequence
              and reads strongest; the further out, the quieter — a group should be able to
              see at a glance that a theme is built mostly from speculation. */}
          {order !== null && (
            <span
              title={`${ordinal(order)}-order implication — ${order} step${order === 1 ? "" : "s"} from its key change`}
              className={
                "shrink-0 rounded-[2px] px-1 py-px text-[9px] font-bold uppercase tracking-[0.06em] " +
                (order === 1
                  ? "bg-ink text-paper"
                  : order === 2
                    ? "bg-black/15 text-ink"
                    : "border border-black/20 text-muted")
              }
            >
              {ordinal(order)}
            </span>
          )}
          {editable &&
            (merging ? (
              <button
                onClick={() => {
                  onMerge(card, mergeFrom!);
                  setMergeFrom(null);
                }}
                className="shrink-0 rounded-[2px] border border-blue px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.05em] text-blue"
              >
                Merge into this
              </button>
            ) : (
              <CardMenu>
                {(close) => (
                  <>
                    {themeId !== null && (
                      <CardMenuItem
                        onClick={() => {
                          close();
                          onMoveCard(card, null, null);
                        }}
                      >
                        Move out of theme
                      </CardMenuItem>
                    )}
                    <CardMenuItem
                      onClick={() => {
                        close();
                        onPark(card, !card.parked);
                      }}
                    >
                      {card.parked ? "Restore from parked" : "Park"}
                    </CardMenuItem>
                    {/* Copying is deliberately easy — the care goes into showing where a
                        group HAS doubled up, not into making it hard to do. */}
                    {card.cardKind === null && !card.parked && board.themes.length > 1 && (
                      <CardMenuItem
                        onClick={() => {
                          close();
                          setCopyFrom(card);
                        }}
                      >
                        Also add to another theme…
                      </CardMenuItem>
                    )}
                    {!hasChildren && (
                      <CardMenuItem
                        onClick={() => {
                          close();
                          setMergeFrom(card);
                        }}
                      >
                        Merge into…
                      </CardMenuItem>
                    )}
                    {/* Deleting one copy removes it from THIS theme and leaves the
                        others alone, so the wording has to say which it is. No confirm on
                        either path: a single-copy delete never had one, and adding a
                        dialog to the common action to serve the rare one is a bad trade. */}
                    <CardMenuItem
                      danger
                      onClick={() => {
                        close();
                        onDeleteCard(card);
                      }}
                    >
                      {inThemes > 1 ? "Remove from this theme" : "Delete"}
                    </CardMenuItem>
                  </>
                )}
              </CardMenu>
            ))}
        </div>

        {/* The thing the group asked to be able to see: this implication is also sitting
            in another column. Named rather than hinted, because the whole point is that
            nobody discovers it by accident halfway through the exercise. */}
        {inThemes > 1 && (
          <div
            className="mt-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.05em] text-blue"
            title={info?.themeIds
              .map((id) => board.themes.find((t) => t.id === id)?.text ?? "")
              .filter(Boolean)
              .join("  ·  ")}
          >
            <span aria-hidden>⧉</span>
            Also in {inThemes - 1} other theme{inThemes === 2 ? "" : "s"}
          </div>
        )}

        {/* Where it came from, folded away. Absent for a card typed here by hand, for a
            seed whose Week 2 source was deleted, and for a group whose Week 2 is still a
            placeholder — each simply shows no trail rather than an empty disclosure. */}
        {from && (
          <details
            className="mt-1.5"
            // The card is draggable, so a mousedown on the summary would otherwise start a
            // drag instead of toggling the disclosure.
            onDragStart={(e) => e.preventDefault()}
          >
            <summary className="cursor-pointer list-none text-[10px] font-bold uppercase tracking-[0.06em] text-muted hover:text-ink">
              ▸ Where this came from
            </summary>
            <div className="mt-1.5 border-l-2 border-black/15 pl-2">
              <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted">
                Key change
              </div>
              <div className="mt-0.5 text-[11.5px] font-bold leading-[1.35]">
                {from.keyChange}
              </div>
              {from.chain.length > 1 && (
                <ol className="mt-1.5 flex flex-col gap-0.5">
                  {from.chain.slice(1).map((step, i) => (
                    <li
                      key={i}
                      className="text-[11px] leading-[1.35] text-muted"
                      style={{ paddingLeft: `${i * 10}px` }}
                    >
                      ↳ {step}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </details>
        )}
      </div>
    );
  };

  // A card plus the insertion bar, drawn on whichever edge the drop would land on. `axis`
  // orients it: the tray wraps left-to-right, a theme column stacks top-to-bottom.
  const renderSlot = (
    card: RippleCard,
    zone: string,
    themeId: string | null,
    axis: Axis,
    list: RippleCard[],
    width?: string
  ) => {
    const side = barSide(zone, card.id);
    const bar =
      axis === "x"
        ? side === "near"
          ? "-left-1.5 bottom-0 top-0 w-1"
          : "-right-1.5 bottom-0 top-0 w-1"
        : side === "near"
          ? "-top-1.5 left-0 right-0 h-1"
          : "-bottom-1.5 left-0 right-0 h-1";
    return (
      <div key={card.id} className={"relative " + (width ?? "")}>
        {side && <span aria-hidden className={"absolute rounded bg-[var(--lime-deep)] " + bar} />}
        {renderCard(card, zone, themeId, axis, list)}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {mergeFrom && (
        <div className="flex items-center gap-3 rounded-[3px] border border-blue bg-card px-4 py-2 text-[12.5px]">
          <span>
            Merging <strong>{mergeFrom.text.slice(0, 60)}</strong> — pick the card to keep.
          </span>
          <button
            onClick={() => setMergeFrom(null)}
            className="ml-auto text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
      )}

      {/* What a good theme IS. Step 1 used to say only "name a theme"; a group with no
          shared idea of what they are looking for produces either one theme per
          implication or one theme for everything, and every later step inherits it. */}
      <section className="rounded-[3px] border border-[var(--hairline)] bg-card px-4 py-3">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          As you group and name themes
        </h2>
        <ul className="mt-1.5 flex flex-col gap-1 text-[12.5px] leading-[1.45]">
          <li>What connected change do these implications describe?</li>
          <li>What is changing — and for whom?</li>
          <li>Which implications support or complicate that reading?</li>
        </ul>
        <p className="mt-1.5 text-[11.5px] italic leading-[1.4] text-muted">
          If a theme is too broad, split it. If it repeats one note, look for related
          implications.
        </p>
      </section>

      {/* ---- the tray ---- */}
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
            Not yet in a theme ({board.unclustered.length})
          </h2>
          {editable && (
            <button
              onClick={() => setAddingTo(addingTo === "tray" ? null : "tray")}
              className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-blue hover:underline"
            >
              ＋ Add an implication
            </button>
          )}
          {/* Nearly half a real board is third-order — two steps removed from any key
              change — so a group that wants to cluster the direct consequences first needs
              a way to see only those. It also makes a 146-card tray navigable at all. */}
          {orders.length > 1 && (
            <span className="flex flex-wrap items-center gap-1">
              {[null, ...orders].map((o) => {
                const on = orderFilter === o;
                const n = o === null ? board.unclustered.length : (orderCounts.get(o) ?? 0);
                return (
                  <button
                    key={o ?? "all"}
                    onClick={() => setOrderFilter(o)}
                    aria-pressed={on}
                    title={
                      o === null
                        ? "Every implication in the tray"
                        : `${ordinal(o)}-order — ${o} step${o === 1 ? "" : "s"} from its key change`
                    }
                    className={
                      "rounded-[2px] border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] " +
                      (on
                        ? "border-ink bg-ink text-paper"
                        : "border-[var(--rule)] bg-paper text-muted hover:border-ink hover:text-ink")
                    }
                  >
                    {o === null ? "All" : ordinal(o)} {n}
                  </button>
                );
              })}
            </span>
          )}
          {editable && board.unclustered.length > 0 && (
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                {picked.size} selected
              </span>
              {picked.size > 0 && (
                <>
                  <button
                    onClick={() => {
                      onCreateThemeFrom([...picked]);
                      setPicked(new Set());
                    }}
                    disabled={busy}
                    className="rounded-[2px] border border-ink bg-lime px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep disabled:opacity-40"
                  >
                    Create theme from selected
                  </button>
                  <button
                    onClick={() => setPicked(new Set())}
                    className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted hover:text-ink"
                  >
                    Clear
                  </button>
                </>
              )}
            </span>
          )}
        </div>
        <div
          {...zoneProps("tray")}
          className={
            "flex flex-wrap content-start gap-2 rounded-[3px] border border-dashed p-3 " +
            (zoneLit("tray") ? "border-ink bg-lime/30 " : "border-black/15 ")
          }
        >
          {addingTo === "tray" && (
            <div className="w-56">
              <AddCardForm
                label="A new implication…"
                busy={busy}
                autoFocus
                onAdd={(t) => onAddImplication(t, null)}
                onDone={() => setAddingTo(null)}
              />
            </div>
          )}
          {tray.length === 0 && addingTo !== "tray" && (
            <p className="m-auto py-4 text-[12px] italic text-muted">
              {orderFilter !== null
                ? `Nothing ${ordinal(orderFilter)}-order left in the tray.`
                : board.themes.length > 0
                  ? "Everything has been sorted into a theme."
                  : "A facilitator seeds last session's implications here."}
            </p>
          )}
          {tray.map((c) => renderSlot(c, "tray", null, "x", tray, "w-56"))}
        </div>
      </section>

      {/* ---- the themes ---- */}
      <section>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
            Themes ({board.themes.length})
          </h2>
          {/* A target, not a rule. Too few and a theme is just a restatement of the map;
              too many and nothing has actually been grouped. The counter says where you
              are without stopping anyone who has a reason to be outside it. */}
          <span
            className={
              "rounded-[2px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] " +
              (board.themes.length >= 3 && board.themes.length <= 5
                ? "border-ink bg-lime text-ink"
                : "border-[var(--rule)] text-muted")
            }
          >
            {board.themes.length < 3
              ? `Aim for 3–5 · ${3 - board.themes.length} to go`
              : board.themes.length <= 5
                ? "3–5 · good range"
                : `${board.themes.length} — more than 5, consider merging`}
          </span>
          {editable && (
            <button
              onClick={() => setAddingTheme((v) => !v)}
              className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-blue hover:underline"
            >
              ＋ New theme
            </button>
          )}
        </div>

        {board.themes.length === 0 && !addingTheme ? (
          <div
            {...zoneProps("newtheme")}
            {...(addingTheme ? {} : newThemeClickProps)}
            className={
              "flex min-h-[12rem] w-full flex-col items-center justify-center gap-2 rounded-[4px] border-2 border-dashed p-6 text-center transition-colors " +
              (zoneLit("newtheme")
                ? "border-ink bg-lime/50 "
                : "border-black/25 bg-[rgba(196,255,103,0.10)] ") +
              (editable && !addingTheme ? "cursor-pointer hover:border-ink " : "")
            }
          >
            {addingTheme ? (
              <div className="w-72" onClick={(e) => e.stopPropagation()}>
                <AddCardForm
                  label="Name this theme — as a statement about change…"
                  busy={busy}
                  autoFocus
                  onAdd={onAddTheme}
                  onDone={() => setAddingTheme(false)}
                />
              </div>
            ) : (
              <>
                <span aria-hidden className="text-[26px] leading-none text-black/25">
                  ⤓
                </span>
                <p className="text-[14px] font-bold uppercase tracking-[0.06em]">
                  Drag an implication here to start your first theme
                </p>
                <p className="mx-auto max-w-[58ch] text-[12.5px] leading-[1.45] text-muted">
                  Or click to name one yourself. Name a theme as a statement about change —
                  &ldquo;Responsibility moves to communities faster than resources do&rdquo;
                  rather than &ldquo;Community capacity&rdquo;.
                </p>
              </>
            )}
          </div>
        ) : (
          <div
            className="flex flex-wrap items-stretch gap-3"
            // The row itself catches a theme dropped past the last column.
            onDragOver={(e) => {
              if (editable && drag?.kind === "theme") e.preventDefault();
            }}
            onDrop={(e) => {
              if (!editable || drag?.kind !== "theme") return;
              e.stopPropagation();
              dropTheme(null);
            }}
          >
            {board.themes.map((theme) => {
              const zone = `theme:${theme.id}`;
              const held = board.clusters.get(theme.id) ?? [];
              const chainCount = board.chains.get(theme.id)?.length ?? 0;
              const themeSide =
                drag?.kind === "theme" && over?.zone === "themes" && over.anchorId === theme.id
                  ? over.after
                    ? "far"
                    : "near"
                  : null;
              return (
                <div key={theme.id} className="relative">
                  {themeSide && (
                    <span
                      aria-hidden
                      className={
                        "absolute bottom-0 top-0 w-1 rounded bg-[var(--lime-deep)] " +
                        (themeSide === "near" ? "-left-2" : "-right-2")
                      }
                    />
                  )}
                  <div
                    ref={(el) => {
                      columnRefs.current.set(theme.id, el);
                    }}
                    {...zoneProps(zone)}
                    // A theme dragged over this column drops before it.
                    onDragOverCapture={(e) => {
                      if (!editable || drag?.kind !== "theme") return;
                      e.preventDefault();
                      setOver({ zone: "themes", anchorId: theme.id, after: isFarSide(e, "x") });
                    }}
                    onDropCapture={(e) => {
                      if (!editable || drag?.kind !== "theme") return;
                      e.stopPropagation();
                      dropTheme(
                        insertionPoint(board.themes, theme.id, isFarSide(e, "x"), drag.id)
                      );
                    }}
                    className={
                      "flex w-80 min-h-[17rem] flex-col gap-2 rounded-[4px] border-2 p-3 transition-colors " +
                      (zoneLit(zone) ? "border-ink " : "border-[var(--rule)] ") +
                      "bg-[rgba(196,255,103,0.16)] " +
                      (drag?.id === theme.id ? "opacity-40 " : "")
                    }
                  >
                    <div className="flex items-start gap-1.5">
                      {editable && (
                        <span
                          {...dragProps(theme.id, "theme")}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", theme.id);
                            e.dataTransfer.effectAllowed = "move";
                            // Drag the whole column, not the little grip.
                            const col = columnRefs.current.get(theme.id);
                            if (col) e.dataTransfer.setDragImage(col, 20, 20);
                            setDrag({ id: theme.id, kind: "theme" });
                          }}
                          aria-hidden
                          title="Drag to reorder this theme"
                          className="mt-[3px] shrink-0 cursor-grab select-none text-[11px] leading-none tracking-[-2px] text-black/30 active:cursor-grabbing"
                        >
                          ⠿⠿
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-bold">
                          <InlineText
                            text={theme.text}
                            editable={editable}
                            busy={busy}
                            onSave={(next) => onEditCard(theme, next)}
                          />
                        </div>
                        {/* What the group means by this theme — the thing that settles
                            whether a borderline implication belongs here or next door. */}
                        <div className="mt-0.5 text-[11.5px] leading-[1.4] text-muted">
                          <InlineText
                            text={theme.description ?? ""}
                            editable={editable}
                            busy={busy}
                            emptyLabel="＋ Describe this theme"
                            placeholder="What does this theme mean?"
                            maxLength={CARD_DESCRIPTION_MAX}
                            onSave={(next) => onDescribeCard(theme, next)}
                          />
                        </div>
                      </div>
                      {editable && (
                        <CardMenu label="Theme actions">
                          {(close) => (
                            <CardMenuItem
                              danger
                              onClick={() => {
                                close();
                                setPendingDelete(theme);
                              }}
                            >
                              Delete theme…
                            </CardMenuItem>
                          )}
                        </CardMenu>
                      )}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.06em] text-muted">
                      {held.length} implication{held.length === 1 ? "" : "s"}
                      {chainCount > 0 && ` · ${chainCount} hope/fear`}
                    </div>

                    {/* The well. Always dashed and always visible, so a theme reads as
                        somewhere to put things rather than as a label with a list under
                        it. Drops are handled by the column around it, which is more
                        forgiving than making only this rectangle a target. */}
                    <div
                      className={
                        "flex min-h-[9rem] flex-1 flex-col gap-2 rounded-[3px] border-2 border-dashed p-2 transition-colors " +
                        (zoneLit(zone)
                          ? "border-ink bg-lime/60 "
                          : "border-black/20 bg-[rgba(255,255,255,0.6)] ")
                      }
                    >
                      {held.map((c) => renderSlot(c, zone, theme.id, "y", held))}

                      {held.length === 0 && (
                        <div className="m-auto flex flex-col items-center gap-1 py-4 text-center">
                          <span aria-hidden className="text-[20px] leading-none text-black/25">
                            ⤓
                          </span>
                          <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">
                            Drop implications here
                          </span>
                        </div>
                      )}
                    </div>

                    {editable &&
                      (addingTo === theme.id ? (
                        <AddCardForm
                          label="A new implication…"
                          busy={busy}
                          autoFocus
                          onAdd={(t) => onAddImplication(t, theme.id)}
                          onDone={() => setAddingTo(null)}
                        />
                      ) : (
                        <button
                          onClick={() => setAddingTo(theme.id)}
                          className="self-start text-[10px] font-bold uppercase tracking-[0.05em] text-blue hover:underline"
                        >
                          ＋ Add an implication
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}

            {/* Always available at the end of the row: drop a card here and it becomes a
                new theme, so grouping never requires naming something first. */}
            {editable && (
              <div
                {...zoneProps("newtheme")}
                {...(addingTheme ? {} : newThemeClickProps)}
                className={
                  "flex w-64 min-h-[17rem] flex-col items-center justify-center gap-2 rounded-[4px] border-2 border-dashed p-4 text-center transition-colors " +
                  (zoneLit("newtheme")
                    ? "border-ink bg-lime/50 "
                    : "border-black/20 bg-transparent ") +
                  (addingTheme ? "" : "cursor-pointer hover:border-ink hover:bg-[rgba(196,255,103,0.10)] ")
                }
              >
                {addingTheme ? (
                  <div className="w-full" onClick={(e) => e.stopPropagation()}>
                    <AddCardForm
                      label="Name this theme — as a statement about change…"
                      busy={busy}
                      autoFocus
                      onAdd={onAddTheme}
                      onDone={() => setAddingTheme(false)}
                    />
                  </div>
                ) : (
                  <>
                    <span aria-hidden className="text-[22px] leading-none text-black/25">
                      ⤓
                    </span>
                    <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">
                      Drop a card here, or click to name a new theme
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---- unplaceable ----
           A card the board could not attach to anything: a hope with no theme above it,
           usually from an older board. Delete-only — there is no sensible "put it back",
           and the point is that it is visible rather than silently gone. */}
      {board.orphans.length > 0 && (
        <section className="rounded-[3px] border border-dashed border-coral/50 p-3">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-coral">
            Loose cards ({board.orphans.length})
          </h2>
          <p className="mt-1 text-[11.5px] italic text-muted">
            These aren&rsquo;t attached to a theme, so no step can show them. Delete them, or
            ask a facilitator to look.
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {board.orphans.map((c) => (
              <li key={c.id} className="group flex items-start gap-2 text-[12.5px] leading-[1.4]">
                <span className="min-w-0 flex-1">{c.text}</span>
                {editable && (
                  <button
                    onClick={() => onDeleteCard(c)}
                    aria-label="Delete card"
                    className="shrink-0 text-[11px] font-bold text-muted opacity-0 hover:text-coral group-hover:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- parked ---- */}
      <section
        {...zoneProps("parked")}
        className={
          "rounded-[3px] border border-dashed p-3 " +
          (zoneLit("parked") ? "border-coral bg-coral/10 " : "border-black/15 ")
        }
      >
        <button
          onClick={() => setShowParked((v) => !v)}
          aria-expanded={showParked}
          className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted hover:text-ink"
        >
          {showParked ? "▾" : "▸"} Parked ({board.parked.length})
        </button>
        <p className="mt-1 text-[11.5px] italic text-muted">
          Drag anything you&rsquo;ve set aside here. Nothing is deleted — drag it back out any
          time.
        </p>
        {showParked && board.parked.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {board.parked.map((c) => renderSlot(c, "parked", null, "x", board.parked, "w-56"))}
          </div>
        )}
      </section>

      {/* Which other theme should this implication ALSO sit in. Themes it is already in
          are listed and disabled rather than hidden, so the picker doubles as the answer
          to "where is this already?". */}
      {copyFrom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Also add to another theme"
          onClick={() => setCopyFrom(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[520px] rounded-[4px] border border-ink bg-card p-5 shadow-[4px_6px_0_rgba(36,36,34,0.18)]"
          >
            <h2 className="text-[16px] font-extrabold uppercase tracking-tight">
              Also add to another theme
            </h2>
            <p className="mt-2 text-[13px] leading-[1.5] text-muted">
              It stays where it is. One implication can belong to more than one theme.
            </p>
            <p className="mt-2 rounded-[2px] border border-black/15 bg-paper p-2 text-[13px] leading-[1.45]">
              {copyFrom.text}
            </p>

            <div className="mt-4 flex flex-col gap-1.5">
              {board.themes.map((t) => {
                const already = (twins.get(implicationKey(copyFrom))?.themeIds ?? []).includes(t.id);
                return (
                  <button
                    key={t.id}
                    disabled={already || busy}
                    onClick={() => {
                      onCopyToTheme(copyFrom, t.id);
                      setCopyFrom(null);
                    }}
                    className={
                      "rounded-[2px] border px-3 py-2 text-left text-[13px] leading-[1.4] " +
                      (already
                        ? "border-black/15 bg-paper text-muted"
                        : "border-ink bg-paper hover:bg-lime")
                    }
                  >
                    {t.text}
                    {already && (
                      <span className="ml-2 text-[10.5px] font-bold uppercase tracking-[0.05em] text-blue">
                        already here
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCopyFrom(null)}
              className="mt-4 rounded-[2px] border border-ink bg-paper px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-[var(--hairline)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <DeleteThemeModal
        open={pendingDelete !== null}
        themeText={pendingDelete?.text ?? ""}
        implications={pendingDelete ? (board.clusters.get(pendingDelete.id)?.length ?? 0) : 0}
        chainCards={pendingDelete ? chainCountOf(pendingDelete.id) : 0}
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onChoose={(mode) => {
          const theme = pendingDelete;
          setPendingDelete(null);
          if (theme) onDeleteTheme(theme, mode);
        }}
      />
    </div>
  );
}
