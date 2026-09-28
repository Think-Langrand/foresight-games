"use client";

import { useRef, useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import { insertionPoint, type SynthesisBoard } from "@/lib/synthesis-shape";
import { AddCardForm, InlineText } from "@/components/workshop/synthesis/SynthesisCard";

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
  editable,
  busy,
  onAddTheme,
  onAddImplication,
  onEditCard,
  onMoveCard,
  onMoveTheme,
  onStartTheme,
  onPark,
  onDeleteCard,
  onMerge,
}: {
  board: SynthesisBoard;
  editable: boolean;
  busy: boolean;
  onAddTheme: (text: string) => void;
  onAddImplication: (text: string, themeId: string | null) => void;
  onEditCard: (card: RippleCard, text: string) => void;
  // Put `card` in `themeId` (null = the tray), immediately before `beforeId` (null = last).
  onMoveCard: (card: RippleCard, themeId: string | null, beforeId: string | null) => void;
  onMoveTheme: (theme: RippleCard, beforeId: string | null) => void;
  // Dropped on empty theme space: make a theme and put the card straight into it.
  onStartTheme: (card: RippleCard) => void;
  onPark: (card: RippleCard, parked: boolean) => void;
  onDeleteCard: (card: RippleCard) => void;
  onMerge: (survivor: RippleCard, absorbed: RippleCard) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [addingTheme, setAddingTheme] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null); // theme id, or "tray"
  const [mergeFrom, setMergeFrom] = useState<RippleCard | null>(null);
  const [showParked, setShowParked] = useState(false);
  const columnRefs = useRef(new Map<string, HTMLDivElement | null>());

  const byId = new Map<string, RippleCard>();
  for (const c of [
    ...board.themes,
    ...board.unclustered,
    ...board.parked,
    ...[...board.clusters.values()].flat(),
  ])
    byId.set(c.id, c);

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
  const renderCard = (
    card: RippleCard,
    zone: string,
    themeId: string | null,
    axis: Axis,
    list: RippleCard[]
  ) => {
    const dragging = drag?.id === card.id;
    const merging = mergeFrom !== null && mergeFrom.id !== card.id;
    const hasChildren = (board.clusters.get(card.id)?.length ?? 0) > 0;
    return (
      <div
        {...dragProps(card.id, "card")}
        {...slotProps(zone, card.id, axis, list)}
        className={
          "group relative w-full rounded-[2px] border bg-paper p-2 text-[12.5px] leading-[1.4] shadow-[1px_2px_0_rgba(36,36,34,0.08)] " +
          (editable ? "cursor-grab active:cursor-grabbing " : "") +
          (dragging ? "rotate-1 opacity-40 " : "") +
          (merging ? "border-blue " : "border-black/10 ")
        }
      >
        <InlineText
          text={card.text}
          editable={editable}
          busy={busy}
          onSave={(next) => onEditCard(card, next)}
        />

        {/* Where this implication came from in Week 2, when it was seeded rather than typed. */}
        {card.sourceLabel && (
          <div className="mt-1 text-[10px] uppercase tracking-[0.06em] text-muted">
            ↳ from {card.sourceLabel}
          </div>
        )}

        {editable && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {merging ? (
              <button
                onClick={() => {
                  onMerge(card, mergeFrom!);
                  setMergeFrom(null);
                }}
                className="rounded-[2px] border border-blue px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.05em] text-blue"
              >
                Merge into this
              </button>
            ) : (
              <>
                {!hasChildren && (
                  <button
                    onClick={() => setMergeFrom(card)}
                    className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-muted hover:text-ink"
                  >
                    Merge…
                  </button>
                )}
                <button
                  onClick={() => onPark(card, !card.parked)}
                  className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-muted hover:text-ink"
                >
                  {card.parked ? "Restore" : "Park"}
                </button>
                {themeId !== null && (
                  <button
                    onClick={() => onMoveCard(card, null, null)}
                    className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-muted hover:text-ink"
                  >
                    Remove from theme
                  </button>
                )}
                <button
                  onClick={() => onDeleteCard(card)}
                  aria-label="Delete card"
                  className="ml-auto text-[11px] font-bold text-muted hover:text-coral"
                >
                  ✕
                </button>
              </>
            )}
          </div>
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
          {board.unclustered.length === 0 && addingTo !== "tray" && (
            <p className="m-auto py-4 text-[12px] italic text-muted">
              {board.themes.length > 0
                ? "Everything has been sorted into a theme."
                : "A facilitator seeds last session's implications here."}
            </p>
          )}
          {board.unclustered.map((c) => renderSlot(c, "tray", null, "x", board.unclustered, "w-56"))}
        </div>
      </section>

      {/* ---- the themes ---- */}
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
            Themes ({board.themes.length})
          </h2>
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
                  label="Name this theme…"
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
                <p className="text-[12.5px] text-muted">
                  Or click to name one yourself. Group the implications that belong
                  together, then give the group a name.
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
                      <div className="min-w-0 flex-1 text-[13.5px] font-bold">
                        <InlineText
                          text={theme.text}
                          editable={editable}
                          busy={busy}
                          onSave={(next) => onEditCard(theme, next)}
                        />
                      </div>
                      {editable && (
                        <button
                          onClick={() => onDeleteCard(theme)}
                          aria-label="Delete theme"
                          title={
                            held.length > 0
                              ? "Move its implications out first"
                              : chainCount > 0
                                ? "Also deletes its hopes & fears"
                                : "Delete theme"
                          }
                          className="shrink-0 text-[11px] font-bold text-muted hover:text-coral"
                        >
                          ✕
                        </button>
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
                      label="Name this theme…"
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
    </div>
  );
}
