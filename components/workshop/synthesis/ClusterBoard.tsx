"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CARD_DESCRIPTION_MAX, type RippleCard } from "@/lib/ripples-types";
import {
  childrenOf,
  implicationKey,
  branchOf,
  implicationOrder,
  insertionPoint,
  keyChangeLabel,
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
import { FuturesWheel } from "@/components/workshop/FuturesWheel";
import { SuggestThemesRail } from "@/components/workshop/synthesis/SuggestThemesRail";
import { ThemeJoinSearch } from "@/components/workshop/synthesis/ThemeJoinSearch";
import type { AdminTools } from "@/lib/analysis/implication-cluster-shape";
import {
  DeleteThemeModal,
  type DeleteThemeMode,
} from "@/components/workshop/synthesis/DeleteThemeModal";

// Implication cards carry their own tint so they read as objects sitting IN a theme rather
// than as text printed on it — the theme box is lime, its well is near-white, and a card
// needs to be neither.
const CARD_BG = "#efeade";

// One fill per order, so the distance from the key change is a colour rather than a number
// you have to read. Tinted rather than solid: the card's own text has to stay the loudest
// thing on it, and these sit on the near-white card ground.
const ORDER_TINT: Record<number | "deep", string> = {
  1: "bg-lime",
  2: "bg-blue/25",
  3: "bg-coral/30",
  4: "bg-black/12",
  deep: "bg-black/12",
};

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

// Per-browser memory of whether the right rail is folded away. Read through
// useSyncExternalStore so the server and the first client paint both say "open" and the
// stored preference lands in the hydration pass, with no setState-in-effect. A copy is
// kept in memory so the toggle still works where storage is blocked.
const RIGHT_RAIL_KEY = "synthesis.rightRail";
type RailState = "open" | "closed";
let railMemory: RailState | null = null;
const railListeners = new Set<() => void>();
function readRightRail(): RailState {
  if (railMemory) return railMemory;
  try {
    return window.localStorage.getItem(RIGHT_RAIL_KEY) === "closed" ? "closed" : "open";
  } catch {
    return "open";
  }
}
function subscribeRightRail(cb: () => void) {
  railListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    railListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function writeRightRail(v: RailState) {
  railMemory = v;
  try {
    window.localStorage.setItem(RIGHT_RAIL_KEY, v);
  } catch {
    // Not remembered past this page, still toggled.
  }
  for (const l of railListeners) l();
}
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
  onMoveManyToTheme,
  week2Cards = [],
  admin,
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
  // Make a theme and move these tray implications into it, in one go. `text` names it;
  // without one it is "Theme N".
  onCreateThemeFrom: (cardIds: string[], text?: string) => void;
  // Move several tray implications into an EXISTING theme at once — the rail's click.
  onMoveManyToTheme: (cardIds: string[], themeId: string) => void;
  // Week 2's map, so the drill-in can show an implication inside its own branch.
  week2Cards?: RippleCard[];
  // Present for a signed-in facilitator only: the clustering tool rides the right rail.
  admin?: AdminTools;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [addingTheme, setAddingTheme] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null); // theme id, or "tray"
  const [mergeFrom, setMergeFrom] = useState<RippleCard | null>(null);
  // The card whose "also add to…" picker is open. Null when none is.
  const [copyFrom, setCopyFrom] = useState<RippleCard | null>(null);
  // The Week 2 card id whose branch is open in the lightbox. Null = closed.
  const [tracing, setTracing] = useState<string | null>(null);
  // The theme opened in the body instead of the board — from a rail square or a column's
  // menu. Null = the board. Resolved against the live list below, so a theme someone else
  // deletes while it is open falls back to the board rather than to a blank page.
  const [focusId, setFocusId] = useState<string | null>(null);
  // The rail square under the pointer, and where to draw its full contents. The squares
  // truncate every line to fit; the popover is the same theme with nothing cut. Fixed to
  // the viewport rather than inside the rail, which scrolls and would clip it.
  const [hoverTheme, setHoverTheme] = useState<{ id: string; top: number } | null>(null);
  // Tray cards ticked for "create theme from selected". Drag still works and is untouched;
  // this is the other way round the same job, for a group that would rather read the whole
  // tray and tick than pick cards up one at a time.
  const [rawPicked, setPicked] = useState<Set<string>>(new Set());
  // Show only implications this many steps out from their key change. null = all.
  const [orderFilter, setOrderFilter] = useState<number | null>(null);

  // Tell the page a rail is on the left, so the header and the board both yield to it.
  // A DOM side effect in an effect is exactly what effects are for; the alternative was
  // threading a step-1-only flag through SessionTabs, which every other week also uses.
  // "wide" when the facilitator's suggestions share the right rail, which needs reading room.
  useEffect(() => {
    document.body.dataset.themeRail = admin ? "wide" : "1";
    return () => {
      delete document.body.dataset.themeRail;
    };
  }, [admin]);

  // The right rail can be folded away: once the prompts have been read, and especially once
  // a facilitator's suggestions have been used, it is width the board could be using. The
  // choice is remembered per browser (see RIGHT_RAIL_KEY).
  const rightRailOpen = useSyncExternalStore(subscribeRightRail, readRightRail, () => "open") === "open";
  useEffect(() => {
    document.body.dataset.rightRail = rightRailOpen ? "open" : "closed";
    return () => {
      delete document.body.dataset.rightRail;
    };
  }, [rightRailOpen]);
  const toggleRightRail = () => writeRightRail(rightRailOpen ? "closed" : "open");
  // Show only implications from one key change. Independent of the order filter; both
  // narrow the TRAY and neither touches what is already in a theme.
  const [keyFilter, setKeyFilter] = useState<string | null>(null);
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

  const focus = board.themes.find((t) => t.id === focusId) ?? null;

  // Escape leaves the theme view — unless something that owns Escape is open on top of
  // it (a modal, the drill-in, a field being typed in).
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (tracing || copyFrom || mergeFrom || pendingDelete) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      setFocusId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focus, tracing, copyFrom, mergeFrom, pendingDelete]);
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
  const lineageOf = (c: RippleCard) =>
    lineage[c.sourceCardId ?? twins.get(implicationKey(c))?.sourceCardId ?? ""];
  const orderOf = (c: RippleCard) => implicationOrder(lineageOf(c));
  const keyOf = (c: RippleCard) => lineageOf(c)?.keyChange ?? null;

  // Each filter's counts are taken with the OTHER filter already applied, so a chip's
  // number is what you would actually get by pressing it. Counting both against the whole
  // tray would show "3rd 68" next to a key change that has four.
  const matchesOrder = (c: RippleCard) => orderFilter === null || orderOf(c) === orderFilter;
  const matchesKey = (c: RippleCard) => keyFilter === null || keyOf(c) === keyFilter;

  const orderCounts = new Map<number, number>();
  for (const c of board.unclustered.filter(matchesKey)) {
    const o = orderOf(c);
    if (o !== null) orderCounts.set(o, (orderCounts.get(o) ?? 0) + 1);
  }
  const orders = [...orderCounts.keys()].sort((a, b) => a - b);

  const keyCounts = new Map<string, number>();
  for (const c of board.unclustered.filter(matchesOrder)) {
    const k = keyOf(c);
    if (k) keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
  }
  // Only key changes the group actually mapped under. On the real Group 1 board three of
  // the six have no implications at all, and a chip reading "0" is just noise.
  const keyChanges = [...keyCounts.keys()].sort();

  const tray = board.unclustered.filter((c) => matchesOrder(c) && matchesKey(c));

  // DERIVED, not synced. Several people cluster this board at once, so a card you ticked
  // can be dragged into someone else's theme, or deleted, between the tick and the click.
  // Intersecting with the live tray means it silently drops out of your selection instead
  // of being yanked back out of their theme by "create theme from selected" — the same
  // fallback ThemeWorkspace uses for a deleted theme and HopesFearsBoard for a deleted card.
  const trayIds = new Set(board.unclustered.map((c) => c.id));
  const picked = new Set([...rawPicked].filter((id) => trayIds.has(id)));

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

        {/* How far from the key change this sits, parked in the corner so it reads as a
            stamp on the card rather than another thing to read. Each order gets its own
            fill: a group should be able to see from across the room that a theme is built
            mostly from third-order speculation. */}
        {order !== null && (
          <span
            title={`${ordinal(order)}-order implication — ${order} step${order === 1 ? "" : "s"} from its key change`}
            className={
              "pointer-events-none absolute bottom-1 right-1 rounded-[2px] px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] text-ink " +
              (ORDER_TINT[order] ?? ORDER_TINT.deep)
            }
          >
            {ordinal(order)}
          </span>
        )}

        {/* Where it came from. A fold-out list of ancestor text told you the names but
            not the shape — which branch this sits on, how much else hangs off the same key
            change, how far out it is. The lightbox shows that branch as the wheel the
            group drew in Week 2, with this implication picked out of it. */}
        {sourceId && (
          <button
            onClick={() => setTracing(sourceId)}
            onDragStart={(e) => e.preventDefault()}
            className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-blue hover:underline"
          >
            ◎ Where this came from
          </button>
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
    <>
      {/* The drop rail: a fixed panel at the SCREEN edge, outside the 1100px column, so the
          board reads as a board you pull cards into rather than a page you scroll. With 146
          implications the themes sat six screens below the tray and the targets scrolled
          away from the cards entirely.
          
          It scrolls itself, because three big targets plus a group's real themes will
          outgrow a short viewport. Hidden below lg, where there is no gutter to live in and
          the stacked layout still reads. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[15rem] overflow-y-auto border-r border-ink bg-card px-3 py-4 lg:block">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          Themes
        </h2>
        <p className="mt-1 text-[11px] italic leading-[1.35] text-muted">
          {picked.size > 0
            ? `Click one to add ${picked.size}.`
            : "Click a theme to open it. Drag cards in, or tick and click."}
        </p>

        <div className="mt-3 flex flex-col gap-2.5">
          {board.themes.map((t) => {
            const n = board.clusters.get(t.id)?.length ?? 0;
            const lit = zoneLit(`theme:${t.id}`);
            return (
              <button
                key={t.id}
                {...zoneProps(`theme:${t.id}`)}
                onClick={() => {
                  // With nothing ticked, a square opens its theme; with a selection it
                  // is the drop target it always was.
                  if (picked.size === 0) {
                    setFocusId(t.id);
                    return;
                  }
                  onMoveManyToTheme([...picked], t.id);
                  setPicked(new Set());
                }}
                aria-pressed={focus?.id === t.id}
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  // Keep the popover on screen: anchor to the square's top, but never so
                  // low that a long list runs off the bottom.
                  const top = Math.max(8, Math.min(r.top, window.innerHeight - 380));
                  setHoverTheme({ id: t.id, top });
                }}
                onMouseLeave={() => setHoverTheme(null)}
                className={
                  "flex aspect-square w-full flex-col rounded-[6px] border-2 p-2.5 text-left transition-all " +
                  (lit
                    ? "scale-[1.02] border-ink bg-lime shadow-[3px_4px_0_rgba(36,36,34,0.2)] "
                    : focus?.id === t.id
                      ? "border-ink bg-lime shadow-[3px_4px_0_rgba(36,36,34,0.2)] "
                      : "border-ink bg-[rgba(196,255,103,0.16)] hover:bg-lime/40 ") +
                  (picked.size > 0 ? "cursor-copy" : "")
                }
              >
                <span className="flex items-baseline justify-between gap-1.5">
                  {/* The heading is the theme's own name once it has one. An unnamed theme
                      still reads "Theme 3" from its text, so printing both said it twice. */}
                  <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-[0.08em]">
                    {t.text}
                  </span>
                  <span className="shrink-0 rounded-[2px] bg-ink px-1.5 py-px text-[10px] font-bold text-paper">
                    {n}
                  </span>
                </span>
                {/* What is actually in it, a line each. The square is the whole budget, so
                    anything past it is cut rather than stretching the rail. */}
                <span className="mt-1.5 flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                  {(board.clusters.get(t.id) ?? []).map((c) => (
                    <span key={c.id} className="truncate text-[10.5px] leading-[1.35] text-ink/80">
                      {c.text}
                    </span>
                  ))}
                  {n === 0 && (
                    <span className="text-[10.5px] italic leading-[1.35] text-muted">
                      Nothing in it yet.
                    </span>
                  )}
                </span>
                {picked.size > 0 && (
                  <span className="mt-auto pt-1 text-[9.5px] font-bold uppercase tracking-[0.05em] text-blue">
                    ＋ Add {picked.size}
                  </span>
                )}
              </button>
            );
          })}

          {/* Empty slots, never pre-created themes. A real blank theme would exist on the
              board from the moment anyone opened it: three "nothing yet" chips on steps 2
              and 3, three to delete if the group wants two, and a race to make three per
              person. A slot mints its theme on first drop — onStartTheme already did. */}
          {Array.from({ length: Math.max(0, 3 - board.themes.length) }).map((_, i) => (
            <div
              key={`slot-${i}`}
              {...zoneProps("newtheme")}
              className={
                "flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-[6px] border-2 border-dashed p-3 text-center transition-all " +
                (zoneLit("newtheme")
                  ? "scale-[1.02] border-ink bg-lime shadow-[3px_4px_0_rgba(36,36,34,0.2)]"
                  : "border-black/25 hover:border-ink")
              }
            >
              <span aria-hidden className="text-[26px] leading-none opacity-25">
                ⊕
              </span>
              <span className="text-[10.5px] font-bold uppercase leading-[1.3] tracking-[0.05em] text-muted">
                Drop to start a theme
              </span>
            </div>
          ))}

          {/* The rail button mints a theme straight away, named the way a dropped card
              or a ticked set would name it — "Theme N". Naming can wait until the group
              knows what the pile is about; the form in the body is still there for when
              it does. */}
          {editable && (
            <button
              onClick={() => {
                if (picked.size > 0) {
                  onCreateThemeFrom([...picked]);
                  setPicked(new Set());
                } else onAddTheme(`Theme ${board.themes.length + 1}`);
              }}
              disabled={busy}
              className="rounded-[2px] border border-ink bg-paper px-2 py-2 text-[10.5px] font-bold uppercase tracking-[0.05em] hover:bg-lime disabled:opacity-40"
            >
              {picked.size > 0 ? `＋ New theme from ${picked.size}` : "＋ New theme"}
            </button>
          )}
        </div>
      </aside>

      {/* The hovered square, in full. Read-only and ignores the pointer, so it never gets
          between the cursor and the square that opened it, or a card being dragged. */}
      {hoverTheme && !drag && (() => {
        const t = board.themes.find((x) => x.id === hoverTheme.id);
        if (!t) return null;
        const n = board.themes.indexOf(t) + 1;
        const held = board.clusters.get(t.id) ?? [];
        return (
          <div
            role="tooltip"
            className="pointer-events-none fixed left-[15.5rem] z-40 hidden w-[24rem] overflow-y-auto rounded-[4px] border-2 border-ink bg-card p-3.5 shadow-[4px_5px_0_rgba(36,36,34,0.2)] lg:block"
            style={{ top: hoverTheme.top, maxHeight: `calc(100vh - ${hoverTheme.top + 8}px)` }}
          >
            <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">
              Theme {n} · {held.length} implication{held.length === 1 ? "" : "s"}
            </div>
            <div className="mt-1 text-[14px] font-extrabold leading-[1.25]">{t.text}</div>
            {t.description && (
              <p className="mt-1.5 text-[12px] leading-[1.45] text-ink/80">{t.description}</p>
            )}
            {held.length > 0 ? (
              <ul className="mt-2.5 flex flex-col gap-1.5 border-t border-black/10 pt-2.5">
                {held.map((c) => (
                  <li key={c.id} className="border-l-2 border-black/15 pl-2.5 text-[12px] leading-[1.4]">
                    {c.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[12px] italic text-muted">Nothing in it yet.</p>
            )}
            <p className="mt-2.5 text-[10px] font-bold uppercase tracking-[0.05em] text-blue">
              Click to open
            </p>
          </div>
        );
      })()}

      {/* The instructions, mirroring the theme rail on the other side. Step 1 used to say
          only "name a theme"; a group with no shared idea of what it is looking for
          produces either one theme per implication or one theme for everything, and every
          later step inherits it. Up here it stays readable while you work, instead of
          scrolling away above 146 cards. */}
      <aside
        className={
          "fixed inset-y-0 right-0 z-30 hidden overflow-y-auto border-l border-ink bg-card py-4 lg:block " +
          (!rightRailOpen ? "w-[2.75rem] px-0" : admin ? "w-[21rem] px-3" : "w-[15rem] px-3")
        }
      >
        {/* Folded: a thin strip with one control, so the rail is still findable. */}
        {!rightRailOpen ? (
          <button
            onClick={toggleRightRail}
            aria-expanded={false}
            title="Show the prompts"
            className="mx-auto flex h-full w-full flex-col items-center gap-2 pt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted hover:bg-lime/40 hover:text-ink"
          >
            <span aria-hidden className="text-[13px] leading-none">
              ‹
            </span>
            <span className="[writing-mode:vertical-rl]">{admin ? "Prompts & suggestions" : "Prompts"}</span>
          </button>
        ) : (
          <>
        {/* In flow rather than floated over the heading, so it never sits on top of
            whatever is first in the rail. */}
        <div className="-mt-1 mb-2 flex justify-end">
          <button
            onClick={toggleRightRail}
            aria-expanded={true}
            title="Hide this panel"
            className="rounded-[2px] border border-[var(--hairline)] bg-paper px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-muted hover:border-ink hover:text-ink"
          >
            Hide ›
          </button>
        </div>
        {/* A facilitator's clustering tool, above the prompts: example groupings to read
            beside the real tray. Members never see this — `admin` is decided on the server. */}
        {admin && (
          <div className="mb-4 border-b border-[var(--rule)] pb-4">
            <SuggestThemesRail
              admin={admin}
              board={board}
              editable={editable}
              busy={busy}
              onCreateThemeFrom={onCreateThemeFrom}
            />
          </div>
        )}
        <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          As you group and name themes
        </h2>
        <ul className="mt-2 flex flex-col gap-2 text-[12px] leading-[1.4]">
          <li>What connected change do these implications describe?</li>
          <li>What is changing — and for whom?</li>
          <li>Which implications support or complicate that reading?</li>
        </ul>
        <p className="mt-3 border-t border-[var(--hairline)] pt-2.5 text-[11.5px] italic leading-[1.4] text-muted">
          If a theme is too broad, split it. If it repeats one note, look for related
          implications.
        </p>
        <p className="mt-2 text-[11.5px] italic leading-[1.4] text-muted">
          Aim for 3–5 themes. An implication can sit in more than one.
        </p>
          </>
        )}
      </aside>

      {/* The rails are fixed at the screen edges, so they eat both gutters. Yield exactly
          what it actually takes: its width less whatever margin the centred 1100px column
          already had spare. On a wide screen the gutter swallows it and nothing moves. */}
      <div>
      <div className="flex min-w-0 flex-col gap-6">
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

      {/* ---- one theme, opened from the rail ----
           The columns show every theme at once, which is right for sorting and wrong for
           writing: a statement about change wants room, and "what else belongs here" wants
           a search, not a scan of 146 cards. Same card machinery as the columns — a card
           keeps its menu, its order stamp and its drill-in — so nothing learned on the board
           is lost in here. */}
      {focus && (() => {
        const theme = focus;
        const zone = `theme:${theme.id}`;
        const held = board.clusters.get(theme.id) ?? [];
        const at = board.themes.findIndex((t) => t.id === theme.id);
        const prev = board.themes[at - 1];
        const next = board.themes[at + 1];
        // What is in another theme and NOT already here (by implication identity, so a
        // copy of something this theme holds is not offered back to it).
        const heldKeys = new Set(held.map(implicationKey));
        const elsewhere = board.themes
          .filter((t) => t.id !== theme.id)
          .flatMap((t) =>
            (board.clusters.get(t.id) ?? [])
              .filter((c) => !heldKeys.has(implicationKey(c)))
              .map((card) => ({ card, themeText: t.text }))
          );
        const sourceIdOf = (c: RippleCard) =>
          c.sourceCardId ?? twins.get(implicationKey(c))?.sourceCardId ?? null;
        const navBtn =
          "rounded-[2px] border border-ink bg-paper px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] hover:bg-lime disabled:opacity-30";
        return (
          <section className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => setFocusId(null)} className={navBtn}>
                ← Back to the board
              </button>
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                Theme {at + 1} of {board.themes.length}
              </span>
              <span className="ml-auto flex gap-1">
                <button disabled={!prev} onClick={() => prev && setFocusId(prev.id)} className={navBtn}>
                  ← Prev
                </button>
                <button disabled={!next} onClick={() => next && setFocusId(next.id)} className={navBtn}>
                  Next →
                </button>
              </span>
            </div>

            {/* The statement. Same head card as steps 2 and 3 (ThemeLineagePanel), so the
                theme looks like one thing all the way through the week. */}
            <div className="rounded-[4px] border-2 border-ink bg-[rgba(196,255,103,0.16)] px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">
                    The change we see
                  </div>
                  <h2 className="mt-1 text-[20px] font-extrabold uppercase leading-[1.1] tracking-tight">
                    <InlineText
                      text={theme.text}
                      editable={editable}
                      busy={busy}
                      placeholder="Name this theme as a statement about change…"
                      onSave={(next) => onEditCard(theme, next)}
                    />
                  </h2>
                  <div className="mt-1.5 max-w-[70ch] text-[13.5px] leading-[1.5] text-ink/80">
                    <InlineText
                      text={theme.description ?? ""}
                      editable={editable}
                      busy={busy}
                      emptyLabel="＋ Describe this theme"
                      placeholder="What does this theme mean?"
                      maxLength={CARD_DESCRIPTION_MAX}
                      rows={3}
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
              {editable && (
                <p className="mt-3 border-t border-black/10 pt-2.5 text-[11.5px] italic leading-[1.4] text-muted">
                  Double-click the statement to edit it. Name a theme as a statement about
                  change — &ldquo;Responsibility moves to communities faster than resources
                  do&rdquo; rather than &ldquo;Community capacity&rdquo;.
                </p>
              )}
            </div>

            {/* Everything in it, as full cards. The whole block is the drop zone, like a
                column, so a card dragged off a rail square still lands. */}
            <div
              {...zoneProps(zone)}
              className={
                "rounded-[4px] border-2 p-3 transition-colors " +
                (zoneLit(zone) ? "border-ink " : "border-[var(--rule)] ") +
                "bg-[rgba(196,255,103,0.16)]"
              }
            >
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
                  In this theme ({held.length})
                </h3>
                {editable && addingTo !== theme.id && (
                  <button
                    onClick={() => setAddingTo(theme.id)}
                    className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-blue hover:underline"
                  >
                    ＋ Add an implication
                  </button>
                )}
              </div>
              {editable && addingTo === theme.id && (
                <div className="mb-3 max-w-[32rem]">
                  <AddCardForm
                    label="A new implication…"
                    busy={busy}
                    autoFocus
                    onAdd={(t) => onAddImplication(t, theme.id)}
                    onDone={() => setAddingTo(null)}
                  />
                </div>
              )}
              <div
                className={
                  "grid gap-2 rounded-[3px] border-2 border-dashed p-2 sm:grid-cols-2 xl:grid-cols-3 " +
                  (zoneLit(zone) ? "border-ink bg-lime/60 " : "border-black/20 bg-[rgba(255,255,255,0.6)] ")
                }
              >
                {held.map((c) => renderSlot(c, zone, theme.id, "y", held))}
                {held.length === 0 && (
                  <div className="col-span-full flex flex-col items-center gap-1 py-6 text-center">
                    <span aria-hidden className="text-[20px] leading-none text-black/25">
                      ⤓
                    </span>
                    <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">
                      Nothing in it yet — drop implications here, or search below
                    </span>
                  </div>
                )}
              </div>
            </div>

            <ThemeJoinSearch
              key={theme.id}
              members={held}
              tray={board.unclustered}
              elsewhere={elsewhere}
              orderOf={orderOf}
              keyOf={keyOf}
              sourceIdOf={sourceIdOf}
              editable={editable}
              busy={busy}
              onMoveIn={(c) => onMoveCard(c, theme.id, null)}
              onCopyIn={(c) => onCopyToTheme(c, theme.id)}
              admin={admin}
            />
          </section>
        );
      })()}

      {!focus && (
      <>
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
          {keyChanges.length > 1 && (
            <span className="flex flex-wrap items-center gap-1">
              {[null, ...keyChanges].map((k) => {
                const on = keyFilter === k;
                const n = k === null ? board.unclustered.filter(matchesOrder).length : (keyCounts.get(k) ?? 0);
                return (
                  <button
                    key={k ?? "all-keys"}
                    onClick={() => setKeyFilter(k)}
                    aria-pressed={on}
                    title={k ?? "Every key change"}
                    className={
                      // No truncation here: keyChangeLabel already caps the label, and
                      // clipping it also clipped the count, which is the half worth reading.
                      "whitespace-nowrap rounded-[2px] border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] " +
                      (on
                        ? "border-blue bg-blue text-white"
                        : "border-[var(--rule)] bg-paper text-muted hover:border-blue hover:text-ink")
                    }
                  >
                    {k === null ? "Any key change" : keyChangeLabel(k)} {n}
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
                            <>
                              <CardMenuItem
                                onClick={() => {
                                  close();
                                  setFocusId(theme.id);
                                }}
                              >
                                Open theme
                              </CardMenuItem>
                              <CardMenuItem
                                danger
                                onClick={() => {
                                  close();
                                  setPendingDelete(theme);
                                }}
                              >
                                Delete theme…
                              </CardMenuItem>
                            </>
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
      </>
      )}

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

      {/* The drill-in. Covers the screen because the thing being shown is a map, and a map
          in a 240px card is a diagram of nothing. */}
      {tracing && (() => {
        const branch = branchOf(week2Cards, tracing);
        if (!branch) return null;
        const self = branch.subtree.find((c) => c.id === tracing);
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Where this came from"
            onClick={() => setTracing(null)}
            className="fixed inset-0 z-[100] flex flex-col bg-[rgba(20,20,18,0.72)] p-4 sm:p-8"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="mx-auto flex h-full w-full max-w-[1200px] flex-col overflow-hidden rounded-[6px] border-2 border-ink bg-paper"
            >
              <div className="flex items-start justify-between gap-4 border-b border-[var(--rule)] px-5 py-3">
                <div className="min-w-0">
                  <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">
                    Key change
                  </div>
                  <div className="mt-0.5 text-[14px] font-extrabold leading-[1.25]">
                    {branch.root.text}
                  </div>
                  {self && (
                    <div className="mt-1.5 text-[12.5px] leading-[1.4]">
                      <span className="rounded-[2px] bg-lime px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.06em]">
                        This card
                      </span>{" "}
                      {self.text}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setTracing(null)}
                  className="shrink-0 rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime"
                >
                  Close ✕
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4">
                {/* The key change is the HUB, so it must not also be a node — drawn both
                    ways it read as two different cards saying the same thing. Its direct
                    children become the first ring, exactly as key changes do on the full
                    map where the scenario is the hub. */}
                <FuturesWheel
                  cards={branch.subtree
                    .filter((c) => c.id !== branch.root.id)
                    .map((c) => (c.parentId === branch.root.id ? { ...c, parentId: null } : c))}
                  centerLabel={branch.root.text}
                  highlightIds={branch.pathIds}
                  selectedId={tracing}
                  variant="branch"
                />
              </div>
            </div>
          </div>
        );
      })()}

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
      </div>
    </>
  );
}
