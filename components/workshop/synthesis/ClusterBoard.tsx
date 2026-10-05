"use client";

import { useEffect, useRef, useState } from "react";
import { CARD_DESCRIPTION_MAX, type RippleCard } from "@/lib/ripples-types";
import {
  childrenOf,
  implicationKey,
  branchOf,
  implicationOrder,
  seededIndex,
  insertionPoint,
  keyChangeLabel,
  ordinal,
  clusterProgress,
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
import { rippleDepthColor } from "@/components/workshop/RippleCard";
import { SuggestThemesRail } from "@/components/workshop/synthesis/SuggestThemesRail";
import { ThemeJoinSearch } from "@/components/workshop/synthesis/ThemeJoinSearch";
import { ThemeLineagePanel } from "@/components/workshop/synthesis/ThemeLineagePanel";
import { STATE_DOT, STATE_LABEL, stateGlyph } from "@/components/workshop/synthesis/themeProgress";
import { makePrefStore, usePref } from "@/components/workshop/synthesis/prefStore";
import { Dot, ThemeRail } from "@/components/workshop/synthesis/ThemeRail";
import { PromptRail } from "@/components/workshop/synthesis/PromptRail";
import type { AdminTools } from "@/lib/analysis/implication-cluster-shape";
import {
  DeleteThemeModal,
  type DeleteThemeMode,
} from "@/components/workshop/synthesis/DeleteThemeModal";

// Implication cards carry their own tint so they read as objects sitting IN a theme rather
// than as text printed on it — the theme box is lime, its well is near-white, and a card
// needs to be neither.
const CARD_BG = "#efeade";

// One colour per order, so the distance from the key change is a colour rather than a
// number you have to read. The SAME hue the Week 2 wheel gives that ring (RippleCard's
// depth palette: 1st blue, 2nd amber, 3rd coral, then cycling lighter), so the filter
// chips, the stamp on a card and the ring round a map node all agree. The stamp and the
// off-state chip are tinted rather than solid: the text has to stay the loudest thing.
const orderColor = (order: number) => rippleDepthColor(order);
const orderTint = (order: number) => `color-mix(in srgb, ${orderColor(order)} 28%, var(--card))`;
// The hue cycle lands on lime every fourth order, and lime wants ink text, not white.
const orderOnText = (order: number) => (order % 4 === 0 ? "var(--ink)" : "#fff");

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

// Per-browser memory of the sheet's "In this theme" fold. See prefStore.ts for why this is
// an external store rather than state read in an effect. (The right rail's fold lives in
// PromptRail.)
const themeCardsPref = makePrefStore("synthesis.themeCards", "open", ["open", "closed"] as const);
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
  scenarioTitle,
  admin,
  themeId,
  onPickTheme,
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
  // The hub label when the whole map is drawn.
  scenarioTitle?: string;
  // Present for a signed-in facilitator only: the clustering tool rides the right rail.
  admin?: AdminTools;
  // The theme open in the body (null = the board). Owned by the view and shared with the
  // exploration step, so moving between steps keeps you on the theme you were working on.
  themeId: string | null;
  onPickTheme: (id: string | null) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [addingTheme, setAddingTheme] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null); // theme id, or "tray"
  const [mergeFrom, setMergeFrom] = useState<RippleCard | null>(null);
  // The card whose "also add to…" picker is open. Null when none is.
  const [copyFrom, setCopyFrom] = useState<RippleCard | null>(null);
  // Cards or the Week 2 map, in the same place. The map is the way in: a branch is usually
  // already a theme, so grabbing one beats picking its members out of a list of 146. Cards
  // only when there is no Week 2 map to draw (a group whose Week 2 is still a placeholder).
  const [view, setView] = useState<"cards" | "map">(week2Cards.length > 0 ? "map" : "cards");
  // The Week 2 card the map was opened ON, if it was opened from a card. Highlights its
  // path and scrolls to it; cleared as soon as you change branch.
  const [focusNode, setFocusNode] = useState<string | null>(null);
  // Map zoom. "fit" shows the whole branch; a number is an explicit level, so you can get
  // close enough to read a circle and still drag it out to a theme.
  const [zoom, setZoom] = useState<number | "fit">("fit");
  // What "fit" currently works out to, reported by the wheel. Pressing + from Fit then
  // steps up from what you are actually looking at instead of jumping to 125%.
  const fitScaleRef = useRef(1);
  // Inside an open theme, how "find more" looks: the text search, or the Week 2 map with
  // this theme's nodes lit. Ephemeral — it is a way of looking, not a preference.
  const [findMode, setFindMode] = useState<"search" | "map">("search");
  // Tray cards ticked for "create theme from selected". Drag still works and is untouched;
  // this is the other way round the same job, for a group that would rather read the whole
  // tray and tick than pick cards up one at a time.
  const [rawPicked, setPicked] = useState<Set<string>>(new Set());
  // Show only implications this many steps out from their key change. null = all.
  const [orderFilter, setOrderFilter] = useState<number | null>(null);
  // The map node whose full text the right rail is reading out. See peekCard below.
  const [peek, setPeek] = useState<string | null>(null);
  // Which branch the map draws. Deliberately NOT keyFilter, which also filters the tray:
  // stepping through the maps would then narrow the card list as a side effect, and
  // landing on a key change whose implications are all clustered would leave the tray
  // empty with no lit chip to explain why — the chips are counted off the tray, so that
  // key change has no chip at all. Picking a chip still sets both; cycling sets only this.
  const [mapKey, setMapKey] = useState<string | null>(null);

  // Whether the sheet's "In this theme" block is unfolded. Once a theme's membership is
  // settled and the reading is the work, the cards are height the reading could be using.
  const cardsOpen = usePref(themeCardsPref) === "open";
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

  // The theme open in the body. Resolved against the live list, so a theme someone else
  // deletes while it is open falls back to the board rather than to a blank page.
  const focus = board.themes.find((t) => t.id === themeId) ?? null;
  // Is a map on screen — the board's, or the one inside an open theme? The right rail's
  // read-out only makes sense while one is.
  const mapVisible = focus ? findMode === "map" : view === "map";

  // Escape leaves the theme view — unless something that owns Escape is open on top of
  // it (a modal, the drill-in, a field being typed in).
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (copyFrom || mergeFrom || pendingDelete) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      onPickTheme(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focus, copyFrom, mergeFrom, pendingDelete, onPickTheme]);
  const columnRefs = useRef(new Map<string, HTMLDivElement | null>());

  const byId = new Map<string, RippleCard>();
  for (const c of [
    ...board.themes,
    ...board.unclustered,
    ...board.parked,
    ...[...board.clusters.values()].flat(),
  ])
    byId.set(c.id, c);

  // Everything that would go with a theme: its hope/fear chains to full depth, plus its
  // reading, and the risks, opportunities and tensions written on it. The modal names the damage, so an
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

  // --- the map ----------------------------------------------------------------
  // Which branch is drawn. The key-change chips already in the header pick it; with none
  // picked ("Any key change") the map is the WHOLE wheel, every key change at once. It is
  // big — Group 1's is 2217px — but "fit" scales it into the column and the zoom gets you
  // close; drawing the first branch instead, under a chip that said "any", misled.
  // The branches the map can show. NOT `keyChanges`, which counts the tray: once a group
  // has clustered everything under one key change it drops out of the chips, and that
  // branch's map would become unreachable at exactly the point the group is reviewing its
  // work. This is every key change with an implication anywhere on the board.
  const mapKeyChanges = (() => {
    const seen = new Map<string, string>(); // text → keyChangeId
    for (const c of board.unclustered
      .concat([...board.clusters.values()].flat())
      .concat(board.parked)) {
      const l = lineageOf(c);
      if (l?.keyChange && l.keyChangeId && !seen.has(l.keyChange)) {
        seen.set(l.keyChange, l.keyChangeId);
      }
    }
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  })();
  // The cycler's own choice wins, then the tray's chip; neither = the whole wheel. A key
  // change that has since vanished from the list falls back to the first.
  const mapPick = mapKey ?? keyFilter;
  const mapAll = mapPick === null;
  const mapAt = mapAll ? -1 : Math.max(0, mapKeyChanges.findIndex(([text]) => text === mapPick));
  const mapRootId = mapAll ? null : (mapKeyChanges[mapAt]?.[1] ?? null);
  const mapBranch = mapRootId ? branchOf(week2Cards, mapRootId) : null;
  // The whole-map view has no root to cut away, and its first ring is the key changes.
  const focusBranch = focusNode ? branchOf(week2Cards, focusNode) : null;
  // Every order on the Week 2 map, for the legend beside the zoom. From the map, not the
  // tray, so it is complete inside a theme's "find more" map where the tray is out of view.
  const mapOrders = [...new Set(week2Cards.map((c) => implicationOrder(lineage[c.id])).filter((o): o is number => o !== null))]
    .sort((a, b) => a - b);


  // Every Week 2 id that has a Week 3 card, and where that card currently sits. The map
  // draws Week 2 cards but themes hold Week 3 ones, so this is the only way a node can
  // find the row it is allowed to move. Absent = never seeded = nothing to do with it.
  const seeded = seededIndex(board);

  // DERIVED, not synced. Several people cluster this board at once, so a card you ticked
  // can be dragged into someone else's theme, or deleted, between the tick and the click.
  // Intersecting with the live tray means it silently drops out of your selection instead
  // of being yanked back out of their theme by "create theme from selected" — the same
  // fallback the other steps use for a deleted theme or a deleted hope.
  const trayIds = new Set(board.unclustered.map((c) => c.id));
  const picked = new Set([...rawPicked].filter((id) => trayIds.has(id)));

  // --- the rail's read-out on the map -----------------------------------------
  // A node clips its label to fit its circle, and on a real board most of them clip. The
  // right rail has the width to show one in full, so hovering a node fills it: no overlay
  // to get between the pointer and a drag, and no click to spend — clicking a node already
  // means "add this to the selection".
  //
  // Sticky rather than cleared on mouse-out. Clearing it would empty the panel as soon as
  // you moved toward the thing you were trying to read.
  const peekCard = peek ? (week2Cards.find((c) => c.id === peek) ?? null) : null;
  const peekSeeded = peek ? (seeded.get(peek) ?? null) : null;
  const peekLineage = peek ? lineage[peek] : undefined;

  // The trail, as orders: the key change, every step down to the hovered node, and then
  // everything hanging off it. Stopping at the hovered node made it look like the end of
  // the branch when most of the time it is the middle — the point of the rail is to place
  // an implication in its chain, and half a chain places it badly.
  //
  // Siblings share a level, because they are the same order and the arrow between levels
  // IS the order step. Capped at six levels below; the tree allows nine and the rail is
  // not where you read a whole branch.
  const peekLevels: { texts: string[]; order: number; here: boolean }[] = (() => {
    if (!peek || !peekLineage) return [];
    const kids = new Map<string, RippleCard[]>();
    for (const c of week2Cards) {
      if (!c.parentId) continue;
      const at = kids.get(c.parentId);
      if (at) at.push(c);
      else kids.set(c.parentId, [c]);
    }
    const last = peekLineage.chain.length - 1;
    const out = peekLineage.chain.map((text, i) => ({
      texts: [text],
      order: i,
      here: i === last,
    }));
    let frontier = kids.get(peek) ?? [];
    while (frontier.length > 0 && out.length < last + 1 + 6) {
      out.push({ texts: frontier.map((c) => c.text), order: out.length, here: false });
      frontier = frontier.flatMap((c) => kids.get(c.id) ?? []);
    }
    return out;
  })();

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
            className="pointer-events-none absolute bottom-1 right-1 rounded-[2px] px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] text-ink"
            style={{ background: orderTint(order) }}
          >
            {ordinal(order)}
          </span>
        )}

        {/* Where it came from. A fold-out list of ancestor text told you the names but
            not the shape — which branch this sits on, how much else hangs off the same key
            change, how far out it is. This switches the middle of the page to that branch
            as the group drew it in Week 2, with this implication picked out of it. */}
        {sourceId && (
          <button
            onClick={() => {
              const l = lineage[sourceId];
              if (l) setMapKey(l.keyChange); // the branch to draw; the tray filter is left alone
              setFocusNode(sourceId);
              setPeek(sourceId); // and read it out in the rail, since it is why you came
              if (focus) {
                // Inside a theme the sheet has its own map, so stay on the theme and show
                // it there — unfolding the block if it was tucked away.
                setFindMode("map");
                if (!cardsOpen) themeCardsPref.write("open");
              } else {
                setView("map");
              }
            }}
            onDragStart={(e) => e.preventDefault()}
            className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-blue hover:underline"
          >
            ◎ Where this came from
          </button>
        )}
      </div>
    );
  };

  // The Week 2 branch: zoom, the way through every key change, and the wheel. Drawn on the
  // board in place of the card list, and inside an open theme as its "find more" map —
  // where that theme's own nodes are lit and a selection can be added straight into it.
  const renderMap = (inTheme: RippleCard | null) => (
    <div className="rounded-[3px] border border-dashed border-black/15 p-3">
      {mapKeyChanges.length > 0 && (mapAll || mapBranch) ? (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
              Zoom
            </span>
            {([
              ["−", "out"],
              ["+", "in"],
            ] as const).map(([glyph, dir]) => (
              <button
                key={dir}
                onClick={() =>
                  setZoom((z) => {
                    const from = typeof z === "number" ? z : (fitScaleRef.current || 1);
                    const next = dir === "in" ? from * 1.25 : from / 1.25;
                    return Math.min(2, Math.max(0.25, Number(next.toFixed(3))));
                  })
                }
                aria-label={dir === "in" ? "Zoom in" : "Zoom out"}
                className="rounded-[2px] border border-[var(--rule)] bg-paper px-2 py-0.5 text-[12px] font-bold leading-none text-muted hover:border-ink hover:text-ink"
              >
                {glyph}
              </button>
            ))}
            <button
              onClick={() => setZoom("fit")}
              aria-pressed={zoom === "fit"}
              className={
                "rounded-[2px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] " +
                (zoom === "fit"
                  ? "border-ink bg-ink text-paper"
                  : "border-[var(--rule)] bg-paper text-muted hover:border-ink hover:text-ink")
              }
            >
              Fit
            </button>
            {typeof zoom === "number" && (
              <span className="text-[10px] font-bold text-muted">{Math.round(zoom * 100)}%</span>
            )}

            {/* The order colours, so the rings on the circles read without going back to
                the tray's chips — which are out of view inside a theme. */}
            {mapOrders.length > 0 && (
              <span className="ml-2 flex items-center gap-1.5" aria-label="Ring colours by order">
                {mapOrders.map((o) => (
                  <span key={o} className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.05em] text-muted">
                    <span aria-hidden className="inline-block h-[9px] w-[9px] rounded-full" style={{ background: orderColor(o) }} />
                    {ordinal(o)}
                  </span>
                ))}
              </span>
            )}

            {/* Which branch, and the way through all of them. The key-change chips in the
                tray header can pick one, but they are counted off the TRAY — a key change
                whose implications have all been clustered drops out of them, and its map
                with it. Stepping through happens here, off the full list, so every map
                stays reachable however far the clustering has got. "All key changes" is
                one stop on the way round, unless the tray is filtered to one key change —
                the cycler never touches the tray's filter, so it cannot clear it. */}
            {mapKeyChanges.length > 1 && (
              <span className="ml-auto flex min-w-0 items-center gap-1.5">
                <span
                  className="min-w-0 max-w-[20rem] truncate text-[10.5px] font-bold uppercase tracking-[0.05em]"
                  title={mapAll ? "All key changes" : mapKeyChanges[mapAt]?.[0]}
                >
                  {mapAll ? "All key changes" : mapKeyChanges[mapAt]?.[0]}
                </span>
                <span className="shrink-0 whitespace-nowrap text-[10px] font-bold text-muted">
                  {mapAll ? `${mapKeyChanges.length} maps` : `${mapAt + 1}/${mapKeyChanges.length}`}
                </span>
                {([
                  ["‹", -1, "Previous key change"],
                  ["›", 1, "Next key change"],
                ] as const).map(([glyph, step, label]) => (
                  <button
                    key={step}
                    onClick={() => {
                      // Wraps, so you can walk the whole set in one direction.
                      const stops: (string | null)[] = [
                        ...(keyFilter === null ? [null] : []),
                        ...mapKeyChanges.map(([text]) => text),
                      ];
                      const cur = Math.max(0, stops.indexOf(mapPick));
                      const next = stops[(cur + step + stops.length) % stops.length];
                      setMapKey(next); // the map only — the tray keeps its filter
                      setFocusNode(null);
                      setZoom("fit"); // branches differ in size; a held zoom misleads
                    }}
                    aria-label={label}
                    title={label}
                    className="shrink-0 rounded-[2px] border border-ink bg-paper px-2 py-0.5 text-[12px] font-bold leading-none hover:bg-lime"
                  >
                    {glyph}
                  </button>
                ))}
              </span>
            )}
          </div>

          {/* What to do with the circles you have clicked. On the board the rail squares
              are also targets; inside a theme the obvious destination is this theme, so it
              is the first button. */}
          {editable && picked.size > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-[3px] border-2 border-blue bg-[#e4ecfb] px-3 py-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-blue">
                {picked.size} selected
              </span>
              {inTheme && (
                <button
                  onClick={() => {
                    onMoveManyToTheme([...picked], inTheme.id);
                    setPicked(new Set());
                  }}
                  disabled={busy}
                  className="rounded-[2px] border border-ink bg-lime px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] hover:bg-lime-deep disabled:opacity-40"
                >
                  Add {picked.size} to this theme
                </button>
              )}
              <button
                onClick={() => {
                  onCreateThemeFrom([...picked]);
                  setPicked(new Set());
                }}
                disabled={busy}
                className="rounded-[2px] border border-ink bg-paper px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] hover:bg-lime disabled:opacity-40"
              >
                New theme from {picked.size}
              </button>
              <button
                onClick={() => setPicked(new Set())}
                className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted hover:text-ink"
              >
                Clear
              </button>
              {!inTheme && (
                <span className="text-[11px] italic text-muted">
                  Or click a theme on the rail to add them there.
                </span>
              )}
            </div>
          )}

          <div className="max-h-[70vh] overflow-auto">
            <FuturesWheel
              key={mapBranch ? mapBranch.root.id : "all"}
              cards={
                mapBranch
                  ? mapBranch.subtree
                      .filter((c) => c.id !== mapBranch.root.id)
                      .map((c) => (c.parentId === mapBranch.root.id ? { ...c, parentId: null } : c))
                  : week2Cards
              }
              centerLabel={mapBranch ? mapBranch.root.text : scenarioTitle || "This future"}
              variant={mapBranch ? "branch" : "map"}
              zoom={zoom}
              onFitScale={(v) => (fitScaleRef.current = v)}
              selectedId={focusNode ?? undefined}
              highlightIds={focusNode ? (mapBranch ?? focusBranch)?.pathIds : undefined}
              // Every circle wears its order's colour; a picked one goes blue and a member
              // of the open theme lime, thicker, so the selection still reads over the
              // order rings.
              ringFor={(w2id) => {
                const hit = seeded.get(w2id);
                if (hit && picked.has(hit.card.id)) return { color: "var(--blue)", width: 4 };
                if (hit && inTheme !== null && hit.themeId === inTheme.id) return { color: "var(--lime-deep)", width: 4 };
                const o = implicationOrder(lineage[w2id]);
                return o === null ? null : { color: orderColor(o), width: 3 };
              }}
              nodeProps={(w2id) => {
                const hit = seeded.get(w2id);
                // Hovering reads the node out in full in the right rail — on every node,
                // including one with no Week 3 card, because "what does this one say" is
                // the question whether or not you can act on it.
                const read = { onMouseEnter: () => setPeek(w2id) };
                // The tray's order filter applies to the map too: the other orders step
                // back so the filtered one reads as a ring of colour.
                const order = implicationOrder(lineage[w2id]);
                const filteredOut = orderFilter !== null && order !== orderFilter;
                // On the whole map the key changes are drawn too. They are the structure,
                // not candidates — never seeded, never dragged — so they read at full
                // strength with no "not on this board" stamp.
                if (order === null) return { ...read, style: { cursor: "default" } };
                // Never seeded into this week: there is no row to move.
                if (!hit) return { ...read, style: { cursor: "not-allowed", opacity: filteredOut ? 0.2 : 0.45 } };
                const themed = hit.themeId !== null;
                const member = inTheme !== null && hit.themeId === inTheme.id;
                return {
                  ...(editable && !themed ? dragProps(hit.card.id, "card") : {}),
                  ...read,
                  onClick: () => {
                    if (!editable || themed) return;
                    togglePicked(hit.card.id);
                  },
                  style: {
                    cursor: !editable || themed ? "default" : "grab",
                    ...(themed ? { background: "var(--lime)" } : {}),
                    // Inside a theme the OTHER themes' nodes step back, so the lit ones
                    // read as the shape of this theme on the map.
                    ...(inTheme && themed && !member ? { opacity: 0.45 } : {}),
                    ...(filteredOut ? { opacity: 0.3 } : {}),
                  },
                };
              }}
              nodeExtra={(w2id) => {
                const hit = seeded.get(w2id);
                if (implicationOrder(lineage[w2id]) === null) return null; // a key change
                if (!hit) return (
                  <span className="rounded-[2px] bg-black/10 px-1 py-px text-[8.5px] font-bold uppercase tracking-[0.05em] text-muted">
                    not on this board
                  </span>
                );
                if (hit.themeId === null) return null;
                if (inTheme && hit.themeId === inTheme.id) return (
                  <span className="rounded-[2px] bg-[var(--lime-deep)] px-1 py-px text-[8.5px] font-bold uppercase tracking-[0.05em] text-ink">
                    this theme
                  </span>
                );
                const n = board.themes.findIndex((t) => t.id === hit.themeId) + 1;
                return (
                  <span className="rounded-[2px] bg-ink px-1 py-px text-[8.5px] font-bold uppercase tracking-[0.05em] text-paper">
                    Theme {n}
                  </span>
                );
              }}
            />
          </div>
        </>
      ) : (
        <p className="py-10 text-center text-[12.5px] italic text-muted">
          No key change with implications to map.
        </p>
      )}
    </div>
  );

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
      <ThemeRail
        board={board}
        activeId={focus?.id ?? null}
        onPick={onPickTheme}
        progressFor={(t) => clusterProgress(board, t.id)}
        progressLabel="Cards"
        wide={Boolean(admin)}
        dragging={drag !== null}
        hint={
          picked.size > 0
            ? `Click one to add ${picked.size}.`
            : focus
              ? "Click the lit theme again to go back to the board."
              : "Click a theme to open it. Drag cards in, or tick and click."
        }
        // The squares are drop targets here, and a click with cards ticked adds them.
        squareProps={(t) => zoneProps(`theme:${t.id}`)}
        squareLit={(t) => zoneLit(`theme:${t.id}`)}
        pickedCount={picked.size}
        onAddPicked={(t) => {
          onMoveManyToTheme([...picked], t.id);
          setPicked(new Set());
        }}
        footer={
          <>
            {/* Empty slots, never pre-created themes. A real blank theme would exist on the
                board from the moment anyone opened it: three "nothing yet" chips on later
                steps, three to delete if the group wants two, and a race to make three per
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
          </>
        }
      />

      {/* The instructions, mirroring the theme rail on the other side. Step 1 used to say
          only "name a theme"; a group with no shared idea of what it is looking for
          produces either one theme per implication or one theme for everything, and every
          later step inherits it. Up here it stays readable while you work, instead of
          scrolling away above 146 cards. */}
      <PromptRail wide={Boolean(admin)} label={admin ? "Prompts & suggestions" : "Prompts"}>
        {/* ---- the hovered node, in full ----
            Only on the map, where the question exists: a circle clips its label to fit, so
            the rail is where the whole implication can actually be read. It also says the
            things the node has no room for — how far out it is, which key change it hangs
            off, and whether it is already in a theme. */}
        {mapVisible && (
          // A solid panel rather than a ruled-off stretch of rail: it is the one part of
          // this column that changes as you move, and it should read as a readout.
          <div className="mb-4 rounded-[4px] border border-blue/30 bg-[#e4ecfb] p-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue">
              Selected implication
            </h2>
            {peekCard ? (
              <>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {peekLineage && implicationOrder(peekLineage) !== null && (
                    <span
                      className="rounded-[2px] px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] text-ink"
                      style={{ background: orderTint(implicationOrder(peekLineage)!) }}
                    >
                      {ordinal(implicationOrder(peekLineage)!)}
                    </span>
                  )}
                  {peekSeeded === null ? (
                    <span className="rounded-[2px] bg-black/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] text-muted">
                      Not on this board
                    </span>
                  ) : peekSeeded.themeId !== null ? (
                    <span className="rounded-[2px] bg-ink px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] text-paper">
                      Theme {board.themes.findIndex((t) => t.id === peekSeeded.themeId) + 1}
                    </span>
                  ) : (
                    <span className="rounded-[2px] border border-ink/30 px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] text-muted">
                      Not in a theme
                    </span>
                  )}
                </div>

                {/* The branch read top to bottom, one order per step. The hovered node is
                    the bold one; everything under it keeps going, because a node is almost
                    always the middle of a chain rather than the end of one. The text is not
                    repeated above — it is already in here, in its place. */}
                <ol className="mt-2.5 flex flex-col">
                  {peekLevels.map((level, i) => (
                    <li key={i}>
                      {i === 0 && (
                        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-[0.07em] text-blue/70">
                          Key change
                        </span>
                      )}
                      {i > 0 && (
                        // An actual arrow, drawn, carrying the order it steps into.
                        <span className="flex items-center gap-1.5 py-0.5 pl-1.5 text-blue/60">
                          <svg
                            width="9"
                            height="18"
                            viewBox="0 0 9 18"
                            aria-hidden
                            className="shrink-0"
                          >
                            <line x1="4.5" y1="0" x2="4.5" y2="12" stroke="currentColor" strokeWidth="1.5" />
                            <polygon points="4.5,18 1,11.5 8,11.5" fill="currentColor" />
                          </svg>
                          <span className="text-[9px] font-bold uppercase tracking-[0.07em]">
                            {ordinal(level.order)} order
                          </span>
                        </span>
                      )}
                      <div className="flex flex-col gap-1">
                        {level.texts.map((text, j) => (
                          <p
                            key={j}
                            // Key changes are whole paragraphs — the real ones run eight
                            // lines here and swamped the chain they are supposed to be the
                            // head of. Clamped, with the full text on hover.
                            title={level.order === 0 ? text : undefined}
                            className={
                              "flex items-start gap-1.5 text-[11.5px] leading-[1.35] " +
                              (level.order === 0
                                ? "font-bold uppercase tracking-[0.04em] text-ink"
                                : level.here
                                  ? "rounded-[2px] bg-paper px-1.5 py-1 text-[12.5px] font-bold text-ink shadow-[1px_1px_0_rgba(39,93,226,0.25)]"
                                  : "text-ink/65")
                            }
                          >
                            {/* No bullet on the key change — it is the head of the chain,
                                not an item in a list — nor on the hovered node, which has
                                its own card. The bullets are for the levels that hold
                                several siblings and would otherwise run together. */}
                            {level.order > 0 && !level.here && <Dot />}
                            <span className={level.order === 0 ? "line-clamp-3" : "min-w-0"}>
                              {text}
                            </span>
                          </p>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="mt-1.5 text-[12px] italic leading-[1.4] text-ink/60">
                Hover a circle on the map to read it in full.
              </p>
            )}
          </div>
        )}

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
        {/* No panel, no fill — these are the questions the group is meant to be holding,
            and they read best as plain text in the margin. Set nearly twice the size they
            were: at 12px they were sized like UI chrome and scanned like it, which is the
            opposite of what a prompt is for. The same prompts on the board and inside a
            theme: this step is clustering, wherever you are standing. */}
        <h2 className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-muted">
          As you group and name themes
        </h2>
        <ul className="mt-3 flex flex-col gap-3.5 text-[19px] font-medium leading-[1.3] tracking-[-0.01em]">
          <li>What do these implications have in common?</li>
          <li>What is this theme about — and for whom?</li>
          <li>Which implications support or complicate that reading?</li>
        </ul>
        <p className="mt-4 border-t border-[var(--hairline)] pt-3 text-[14.5px] italic leading-[1.4] text-muted">
          If a theme is too broad, split it. If it repeats one note, look for related
          implications.
        </p>
        <p className="mt-2.5 text-[14.5px] italic leading-[1.4] text-muted">
          Aim for 3–5 themes. An implication can sit in more than one.
        </p>
      </PromptRail>

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

      {/* ---- where the body is, in one place that never moves ----
           Cards↔Map and board↔theme were two independent pieces of state sharing a single
           exit, and the Cards|Map toggle only existed in the tray. So from inside a theme
           there was no way to ask for the OTHER board, and "← Back to the board" could not
           say which one it meant — it just returned you to whichever you had left.

           There are three places the body can be, so this is one control with three
           segments rather than a toggle plus a back button. Where you are is a label; the
           other two are the ways out, always in the same spot. */}
      {(week2Cards.length > 0 || focus) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule)] pb-2.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
            Working in
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-1">
            {(["cards", "map"] as const).map((v) => {
              if (v === "map" && week2Cards.length === 0) return null;
              const on = !focus && view === v;
              return (
                <button
                  key={v}
                  onClick={() => {
                    setView(v);
                    if (v === "cards") setFocusNode(null);
                    onPickTheme(null); // leaving a theme, if one is open
                  }}
                  aria-pressed={on}
                  className={
                    "rounded-[2px] border px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] transition-colors " +
                    (on
                      ? "border-ink bg-ink text-paper"
                      : "border-ink bg-paper text-ink hover:bg-lime")
                  }
                >
                  {v === "cards" ? "Cards" : "Map"}
                </button>
              );
            })}
            {/* Not a button. Clicking where you already are should not be one of the
                options; the theme's own rail square toggles it shut, and Cards and Map
                are the ways out from here. */}
            {focus && (
              <span className="flex min-w-0 max-w-[22rem] items-center gap-1.5 rounded-[2px] border-2 border-ink bg-lime px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] shadow-[2px_2px_0_rgba(36,36,34,0.2)]">
                <span className="shrink-0 rounded-[2px] bg-ink px-1 py-px text-[9.5px] text-paper">
                  {board.themes.findIndex((t) => t.id === focus.id) + 1}
                </span>
                <span className="truncate" title={focus.text}>
                  {focus.text}
                </span>
              </span>
            )}
          </span>
        </div>
      )}

      {/* ---- one theme, opened from the rail: the sheet ----
           The columns show every theme at once, which is right for sorting and wrong for
           writing. A theme opened here is one sheet: the statement, what is in it (folding
           away once that is settled), and the reading — "how does this future work?" —
           which used to be a step of its own with the cards out of sight. Same card
           machinery as the columns, so nothing learned on the board is lost in here. */}
      {focus && (() => {
        const theme = focus;
        const zone = `theme:${theme.id}`;
        const held = board.clusters.get(theme.id) ?? [];
        const at = board.themes.findIndex((t) => t.id === theme.id);
        const prev = board.themes[at - 1];
        const next = board.themes[at + 1];
        const state = clusterProgress(board, theme.id);
        // The next theme still empty, wrapping past the end, so a pass over every theme
        // stays a pass.
        const nextUnfinished = (() => {
          const n = board.themes.length;
          for (let k = 1; k < n; k++) {
            const t = board.themes[(at + k) % n];
            if (clusterProgress(board, t.id) !== "done") return t;
          }
          return null;
        })();
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
        const segBtn = (on: boolean) =>
          "rounded-[2px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] " +
          (on
            ? "border-ink bg-ink text-paper"
            : "border-[var(--rule)] bg-paper text-muted hover:border-ink hover:text-ink");
        return (
          <section className="flex flex-col gap-4">
            <ThemeLineagePanel
              theme={theme}
              implications={held}
              lineage={lineage}
              editable={editable}
              busy={busy}
              onEditTheme={(t) => onEditCard(theme, t)}
              onDescribeTheme={(d) => onDescribeCard(theme, d)}
              namePlaceholder="What is this theme about?"
              showImplications={false}
              showDescription={false}
              menu={
                editable ? (
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
                ) : undefined
              }
              note={
                editable ? (
                  <p className="mt-3 border-t border-black/10 pt-2.5 text-[11.5px] italic leading-[1.4] text-muted">
                    Click ✎ to edit the name. Say what these implications have in common.
                  </p>
                ) : undefined
              }
            >
              {/* ---- in this theme ----
                   Everything in it, as full cards, plus the ways to find more. The whole
                   block is the drop zone, like a column, so a card dragged off a rail
                   square still lands. Folds away (remembered per browser) once membership
                   is settled. */}
              <div
                {...zoneProps(zone)}
                className={
                  "border-t-2 border-dashed px-5 py-4 transition-colors " +
                  (zoneLit(zone) ? "border-ink bg-lime/40 " : "border-black/15 ")
                }
              >
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => themeCardsPref.write(cardsOpen ? "closed" : "open")}
                    aria-expanded={cardsOpen}
                    className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted hover:text-ink"
                  >
                    {cardsOpen ? "▾" : "▸"} In this theme ({held.length})
                  </button>
                  {!cardsOpen && (
                    <span className="text-[11px] italic text-muted">
                      {board.unclustered.length} still in the tray
                    </span>
                  )}
                  {editable && cardsOpen && addingTo !== theme.id && (
                    <button
                      onClick={() => setAddingTo(theme.id)}
                      className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-blue hover:underline"
                    >
                      ＋ Add an implication
                    </button>
                  )}
                  {cardsOpen && (
                    <span className="ml-auto flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                        Find more
                      </span>
                      <button
                        onClick={() => setFindMode("search")}
                        aria-pressed={findMode === "search"}
                        className={segBtn(findMode === "search")}
                      >
                        Search
                      </button>
                      {week2Cards.length > 0 && (
                        <button
                          onClick={() => {
                            // Open on the branch most of this theme already comes from,
                            // not on whichever the cycler last showed — the point is to
                            // see this theme's shape and what sits next to it.
                            const tally = new Map<string, number>();
                            for (const c of held) {
                              const k = keyOf(c);
                              if (k) tally.set(k, (tally.get(k) ?? 0) + 1);
                            }
                            const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
                            if (best) {
                              setMapKey(best);
                              setFocusNode(null);
                              setZoom("fit");
                            }
                            setFindMode("map");
                          }}
                          aria-pressed={findMode === "map"}
                          className={segBtn(findMode === "map")}
                        >
                          Map
                        </button>
                      )}
                    </span>
                  )}
                </div>

                {cardsOpen && (
                  <>
                    {editable && addingTo === theme.id && (
                      <div className="mt-3 max-w-[32rem]">
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
                        "mt-3 grid gap-2 rounded-[3px] border-2 border-dashed p-2 sm:grid-cols-2 xl:grid-cols-3 " +
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
                            Nothing in it yet — drop implications here, or find them below
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3">
                      {findMode === "map" ? (
                        renderMap(theme)
                      ) : (
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
                      )}
                    </div>
                  </>
                )}
              </div>
            </ThemeLineagePanel>

            {/* Where you are in the pass, and the way to the next theme — the next one
                still owing a reading first, since that is what the pass is for. */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                Theme {at + 1} of {board.themes.length}
              </span>
              <span
                className={
                  "flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] " +
                  STATE_DOT[state]
                }
              >
                <span aria-hidden>{stateGlyph(state)}</span>
                {STATE_LABEL[state]}
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-1">
                <button disabled={!prev} onClick={() => prev && onPickTheme(prev.id)} className={navBtn}>
                  ← Prev
                </button>
                <button disabled={!next} onClick={() => next && onPickTheme(next.id)} className={navBtn}>
                  Next →
                </button>
                {nextUnfinished && (
                  <button
                    onClick={() => onPickTheme(nextUnfinished.id)}
                    title={nextUnfinished.text}
                    className={navBtn + " border-ink bg-lime"}
                  >
                    Next unfinished: Theme {board.themes.indexOf(nextUnfinished) + 1} →
                  </button>
                )}
              </span>
            </div>
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
          {/* Cards|Map used to live here. It moved up to the "Working in" bar, which is
              outside this section and therefore still on screen while a theme is open —
              which is the whole point of it. */}
          {/* Nearly half a real board is third-order — two steps removed from any key
              change — so a group that wants to cluster the direct consequences first needs
              a way to see only those. It also makes a 146-card tray navigable at all. */}
          {orders.length > 1 && (
            <span className="flex flex-wrap items-center gap-1">
              {[null, ...orders].map((o) => {
                const on = orderFilter === o;
                const n = o === null ? board.unclustered.length : (orderCounts.get(o) ?? 0);
                // Each order's chip wears its colour — the same one its cards are stamped
                // with and its circles are ringed with on the map — solid when it is the
                // filter, as a dot and a tint otherwise.
                const colour = o === null ? null : orderColor(o);
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
                      "flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] " +
                      (colour === null
                        ? on
                          ? "border-ink bg-ink text-paper"
                          : "border-[var(--rule)] bg-paper text-muted hover:border-ink hover:text-ink"
                        : on
                          ? ""
                          : "text-ink hover:brightness-95")
                    }
                    style={
                      o === null || colour === null
                        ? undefined
                        : on
                          ? { background: colour, borderColor: colour, color: orderOnText(o) }
                          : { background: orderTint(o), borderColor: colour }
                    }
                  >
                    {colour !== null && !on && (
                      <span aria-hidden className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: colour }} />
                    )}
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
                    onClick={() => {
                      setKeyFilter(k);
                      // A chip means both: filter the tray AND take the map there. Without
                      // this the map would stay wherever the cycler last left it.
                      setMapKey(k);
                      setFocusNode(null);
                    }}
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
        {view === "map" ? renderMap(null) : (
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
        )}
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
                  label="What is this theme about?"
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
                  Or click to name one yourself. Say what the implications in it have in
                  common.
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
                      <span
                        title={`Theme ${board.themes.indexOf(theme) + 1}`}
                        className="mt-[1px] shrink-0 rounded-[2px] bg-ink px-1.5 py-px text-[10px] font-bold leading-none text-paper"
                      >
                        {board.themes.indexOf(theme) + 1}
                      </span>
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
                                  onPickTheme(theme.id);
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
                      label="What is this theme about?"
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
