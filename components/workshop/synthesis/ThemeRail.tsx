"use client";

import { useEffect, useRef, useState } from "react";
import { LeftRail } from "@/components/workshop/synthesis/LeftRail";
import { CARD_TEXT_MAX, type RippleCard } from "@/lib/ripples-types";
import { isUnnamedTheme, type SynthesisBoard, type ThemeProgress } from "@/lib/synthesis-shape";
import { STATE_DOT, STATE_LABEL, stateGlyph } from "@/components/workshop/synthesis/themeProgress";

// The theme rail: a fixed panel at the LEFT screen edge, outside the 1100px column, that
// picks a theme on every step of the week. One picker rather than one per step, so moving
// between steps never means learning where the themes went.
//
// Each square carries the theme's number, the step's progress glyph, its name and what is
// in it. Hovering a square shows the whole theme in a popover beside the rail (the squares
// truncate every line to fit); clicking opens it, clicking the lit one again closes it.
//
// Step 1 also uses the squares as DROP TARGETS and lets a selection be added by clicking:
// that wiring arrives through `squareProps` / `pickedCount` / `onAddPicked`, and the rail
// knows nothing about drag beyond "a drag is happening, hide the popover".
//
// It scrolls itself, because three big targets plus a group's real themes will outgrow a
// short viewport. Hidden below lg, where there is no gutter to live in and the stacked
// layout still reads. The page yields the width through a body data attribute, set for
// every step of the week by useBoardGutters (see boardGutters.tsx and globals.css).

// A very small bullet, for the places this week lists one line per implication. Those
// lines are short, tight and often truncated, and with nothing marking where each begins
// they read as one paragraph. Takes its colour from the text it sits beside.
export function Dot() {
  return (
    <span
      aria-hidden
      className="mt-[0.52em] h-[3px] w-[3px] shrink-0 rounded-full bg-current opacity-45"
    />
  );
}

// A theme's name, typed in its own square.
//
// A component of its own, at the top of the file, because it holds a DRAFT: a function
// nested in the render would be a new component type on every pass, and the rail rebuilds
// on every realtime message — which would throw away a half-typed name mid-sentence.
//
// A textarea rather than an input, and at 12px rather than the square's 10px uppercase:
// the names groups actually write are sentence-length, and the whole point of editing here
// is not having to go somewhere else to see what you are typing.
function RailName({
  text,
  onCommit,
  onCancel,
}: {
  text: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(text);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <textarea
      ref={ref}
      value={draft}
      rows={3}
      maxLength={CARD_TEXT_MAX}
      placeholder="What is this theme about?"
      onChange={(e) => setDraft(e.target.value)}
      // The square around this is a role="button" with its own click and keydown; a click
      // to place a caret is not a click on it.
      onClick={(e) => e.stopPropagation()}
      onBlur={() => onCommit(draft.trim())}
      onKeyDown={(e) => {
        // A theme name is one line's worth of thought, so Enter commits rather than
        // breaking the line. Escape abandons, and must not reach the step behind it.
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(draft.trim());
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className="mt-1.5 w-full resize-none rounded-[2px] border border-ink bg-paper p-1 text-[12px] font-bold leading-[1.3] outline-none"
    />
  );
}

export function ThemeRail({
  board,
  activeId,
  onPick,
  progressFor,
  progressLabel,
  hint,
  badge,
  dragging = false,
  squareProps,
  squareLit,
  squareReorderProps,
  squareInsert,
  pickedCount = 0,
  onAddPicked,
  onRename,
  footer,
  top,
}: {
  board: SynthesisBoard;
  // The theme open in the body; null = none. Clicking the lit square passes null back.
  activeId: string | null;
  onPick: (id: string | null) => void;
  // How far each theme has got on THIS step — the glyph beside its number.
  progressFor: (theme: RippleCard) => ThemeProgress;
  // Names what the glyph measures, e.g. "Reading", for the square's tooltip.
  progressLabel: string;
  hint: string;
  // A line under the hint: step 1's "aim for 3–5" counter, which used to sit over the
  // board's columns.
  badge?: React.ReactNode;
  // A card is being dragged: the popover gets out of the way.
  dragging?: boolean;
  // Step 1's drop-zone wiring on each square, and whether that square is lit by a drag.
  squareProps?: (theme: RippleCard) => React.HTMLAttributes<HTMLDivElement>;
  squareLit?: (theme: RippleCard) => boolean;
  // Step 1's drag-to-reorder. The squares are the only place themes can be put in order
  // once the board's columns are off at this width, so the square itself is the handle —
  // there is no room beside it for a grip, and the whole tile is a big enough target.
  squareReorderProps?: (theme: RippleCard) => React.HTMLAttributes<HTMLDivElement>;
  // Which edge of this square a dropped theme would land on, for the insertion bar.
  squareInsert?: (theme: RippleCard) => "before" | "after" | null;
  // Step 1's tick-and-click: with cards picked, a click adds them instead of opening.
  pickedCount?: number;
  onAddPicked?: (theme: RippleCard) => void;
  // Naming a theme in the rail, where its name is already being read — and where the
  // square says "still unnamed" in red without offering anything to do about it. Omitted
  // on a read-only board; the square is then just a picker, as it always was.
  onRename?: (theme: RippleCard, text: string) => void;
  // Below the squares — step 1's empty slots and "+ New theme" button.
  footer?: React.ReactNode;
  // Above the squares: the rail's top band, at least as tall as everything above the
  // board's toolbar (see useRailBand), ending in a rule the board's own rule continues.
  // The step's instruction goes here, set large (see LeftRail). Undefined = no band, and
  // the squares start at the top.
  top?: React.ReactNode;
}) {
  // The square under the pointer, and where to draw its full contents. Fixed to the
  // viewport rather than inside the rail, which scrolls and would clip it.
  const [hover, setHover] = useState<{ id: string; top: number } | null>(null);
  // Which square's name is being typed into. One at a time, by construction.
  const [renaming, setRenaming] = useState<string | null>(null);

  const hovered = hover ? (board.themes.find((t) => t.id === hover.id) ?? null) : null;

  return (
    <>
      <LeftRail top={top}>
        <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Themes</h2>
        <p className="mt-1 text-[11px] italic leading-[1.35] text-muted">{hint}</p>
        {badge && <div className="mt-1.5">{badge}</div>}

        <div className="mt-3 flex flex-col gap-2.5">
          {board.themes.map((t, i) => {
            const held = board.clusters.get(t.id) ?? [];
            const lit = squareLit?.(t) ?? false;
            const open = activeId === t.id;
            const state = progressFor(t);
            const insert = squareInsert?.(t) ?? null;
            const editing = renaming === t.id;
            return (
              <div key={t.id} className="relative">
                {insert && (
                  <span
                    aria-hidden
                    className={
                      "absolute inset-x-0 h-1 rounded bg-[var(--lime-deep)] " +
                      (insert === "before" ? "-top-1.5" : "-bottom-1.5")
                    }
                  />
                )}
              <div
                {...(squareProps?.(t) ?? {})}
                {...(squareReorderProps?.(t) ?? {})}
                // A div, not a button, because the name inside it is editable and a
                // button inside a button is not valid HTML. role + tabIndex + the Enter
                // and Space handler is the same shape the new-theme slot already uses.
                role="button"
                tabIndex={0}
                // Typing in the name must not be a drag handle: text selection inside a
                // draggable element is broken in Safari and Firefox.
                draggable={editing ? false : (squareReorderProps?.(t)?.draggable ?? undefined)}
                onClick={() => {
                  // Not while its own name is being typed into: the field is inside the
                  // square, so every click that places a caret is also a click on this.
                  if (editing) return;
                  // With nothing picked, a square opens its theme — or closes it, if it
                  // is the one already open: the rail is where your pointer is, so going
                  // back should not mean finding a button at the top of the body. With a
                  // selection it is the drop target it always was.
                  if (pickedCount > 0 && onAddPicked) {
                    onAddPicked(t);
                    return;
                  }
                  onPick(open ? null : t.id);
                }}
                onKeyDown={(e) => {
                  if (editing) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (pickedCount > 0 && onAddPicked) onAddPicked(t);
                    else onPick(open ? null : t.id);
                  }
                }}
                aria-pressed={open}
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  // Keep the popover on screen: anchor to the square's top, but never so
                  // low that a long list runs off the bottom.
                  const top = Math.max(8, Math.min(r.top, window.innerHeight - 380));
                  setHover({ id: t.id, top });
                }}
                onMouseLeave={() => setHover(null)}
                className={
                  "flex w-full flex-col rounded-[6px] border-2 p-2.5 text-left transition-all " +
                  // Square normally; while its name is being typed, as tall as the field
                  // needs. A theme name is a sentence-length thing and the square's own
                  // line is a 10px truncate, so editing in that line would be typing into
                  // a slot narrower than most of the names people write.
                  (editing ? "min-h-[9rem] " : "aspect-square ") +
                  (lit
                    ? "scale-[1.02] border-ink bg-lime shadow-[3px_4px_0_rgba(36,36,34,0.2)] "
                    : open
                      ? "border-ink bg-lime shadow-[3px_4px_0_rgba(36,36,34,0.2)] "
                      : "border-ink bg-[rgba(196,255,103,0.16)] hover:bg-lime/40 ") +
                  (pickedCount > 0 && !editing ? "cursor-copy" : "")
                }
              >
                <span className="flex items-baseline justify-between gap-1.5">
                  {/* The number is shown as well as the name, because the map labels a
                      clustered node "Theme 3" — and once a group renames a theme, a number
                      that appears nowhere on the theme itself refers to nothing. */}
                  <span className="shrink-0 rounded-[2px] bg-ink px-1 py-px text-[9.5px] font-bold text-paper">
                    {i + 1}
                  </span>
                  <span
                    aria-label={STATE_LABEL[state]}
                    title={`${progressLabel}: ${STATE_LABEL[state]}`}
                    className={"shrink-0 text-[10px] leading-none " + STATE_DOT[state]}
                  >
                    {stateGlyph(state)}
                  </span>
                  {/* The name, and — where the board is writable — the way to change it.
                      A named theme shows the name with a ✎ beside it; an unnamed one has
                      no text to click, so the slot offers the field instead. */}
                  {onRename && !t.text.trim() ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenaming(t.id);
                      }}
                      className="min-w-0 flex-1 text-left text-[10px] font-bold uppercase tracking-[0.05em] text-blue hover:underline"
                    >
                      ＋ Name
                    </button>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-[0.08em]">
                      {t.text}
                    </span>
                  )}
                  {onRename && t.text.trim() && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenaming(t.id);
                      }}
                      aria-label={`Rename ${t.text}`}
                      title="Rename"
                      className="shrink-0 rounded-[2px] border border-[var(--hairline)] bg-paper px-1 text-[10px] font-normal leading-[1.4] text-muted hover:border-ink hover:text-ink"
                    >
                      ✎
                    </button>
                  )}
                  <span className="shrink-0 text-[9.5px] font-bold text-muted">{held.length}</span>
                </span>

                {/* The field, under the number row rather than in it: the row is four
                    things wide already, and a name is the one of them worth a full line. */}
                {editing && onRename && (
                  <RailName
                    text={t.text}
                    onCommit={(next) => {
                      setRenaming(null);
                      // Empty is a cancel: the card route refuses a blank name, and
                      // "still unnamed" is already how the square says that.
                      if (next && next !== t.text) onRename(t, next);
                    }}
                    onCancel={() => setRenaming(null)}
                  />
                )}

                {/* A theme minted by a drop has no name, and an older one has a number for
                    one. Either way the square says so; the ＋ Name in the row above is
                    what to do about it, so this stays a cue rather than a second button. */}
                {isUnnamedTheme(t) && !editing && (
                  <span className="mt-0.5 shrink-0 text-[9.5px] font-bold uppercase tracking-[0.05em] text-coral underline">
                    still unnamed
                  </span>
                )}
                {/* What is actually in it, a line each. The square is the whole budget, so
                    anything past it is cut rather than stretching the rail. */}
                <span className="mt-1.5 flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                  {held.map((c) => (
                    <span
                      key={c.id}
                      className="flex min-w-0 items-start gap-1.5 text-[10.5px] leading-[1.35] text-ink/80"
                    >
                      <Dot />
                      <span className="min-w-0 truncate">{c.text}</span>
                    </span>
                  ))}
                  {held.length === 0 && (
                    <span className="text-[10.5px] italic leading-[1.35] text-muted">
                      Nothing in it yet.
                    </span>
                  )}
                </span>
                {pickedCount > 0 && (
                  <span className="mt-auto pt-1 text-[9.5px] font-bold uppercase tracking-[0.05em] text-blue">
                    ＋ Add {pickedCount}
                  </span>
                )}
              </div>
              </div>
            );
          })}
          {footer}
        </div>
      </LeftRail>

      {/* The hovered square, in full. Read-only and ignores the pointer, so it never gets
          between the cursor and the square that opened it, or a card being dragged. Never
          for the theme that is already open: it has answered "what is in this" in full,
          and the popover is drawn over the top-left of the body — where the way back out
          lives — while your pointer is still on the square you just clicked. */}
      {hovered && hover && !dragging && hovered.id !== activeId && (() => {
        const n = board.themes.indexOf(hovered) + 1;
        const held = board.clusters.get(hovered.id) ?? [];
        return (
          <div
            role="tooltip"
            className="pointer-events-none fixed left-[15.5rem] z-40 hidden w-[24rem] overflow-y-auto rounded-[4px] border-2 border-ink bg-card p-3.5 shadow-[4px_5px_0_rgba(36,36,34,0.2)] lg:block"
            style={{ top: hover.top, maxHeight: `calc(100vh - ${hover.top + 8}px)` }}
          >
            <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">
              Theme {n} · {held.length} implication{held.length === 1 ? "" : "s"}
            </div>
            <div className="mt-1 text-[14px] font-extrabold leading-[1.25]">{hovered.text}</div>
            {isUnnamedTheme(hovered) && (
              <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-coral">
                still unnamed
              </div>
            )}
            {hovered.description && (
              <p className="mt-1.5 text-[12px] leading-[1.45] text-ink/80">{hovered.description}</p>
            )}
            {held.length > 0 ? (
              <ul className="mt-2.5 flex flex-col gap-1.5 border-t border-black/10 pt-2.5">
                {held.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-[12px] leading-[1.4]">
                    <Dot />
                    <span className="min-w-0">{c.text}</span>
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
    </>
  );
}
