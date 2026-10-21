"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

// The handoff as a deck: one full-screen slide per section rather than one long scroll.
//
// WHY A DECK. This is read in a room, on a shared screen, a section at a time — and two of
// the sections are interactive (the Session 2 map, and whatever Session 4 becomes), which a
// scrolling page gives a third of a viewport to. A slide gives each one the whole screen.
//
// EVERY SLIDE STAYS MOUNTED, hidden rather than unmounted, so the map keeps its branch pick,
// its zoom and its wheel/tree choice while you step away and back. That is also why nav is
// index state and not a route.
//
// A slide that overflows scrolls inside itself. The alternative — splitting a group's seven
// themes across sub-slides — makes the deck's length depend on how much work a group did,
// and a nine-pair hopes-and-fears slide would silently become three.

export interface DeckSlide {
  id: string;
  label: string; // the dot's title and the counter's caption
  node: React.ReactNode;
}

export default function HandoffDeck({
  slides,
  groupName,
  projectSlug,
  groupId,
}: {
  slides: DeckSlide[];
  groupName: string;
  projectSlug: string;
  groupId: string;
}) {
  const [i, setI] = useState(0);
  const last = slides.length - 1;

  // Jump to an index, clamped. The arrow keys step relative to the current slide instead, so
  // they use the updater form directly.
  const go = useCallback(
    (next: number) => setI(Math.min(Math.max(next, 0), Math.max(last, 0))),
    [last]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Leave typing alone, and leave the browser's own shortcuts alone.
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        setI((c) => Math.min(c + 1, last));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setI((c) => Math.max(c - 1, 0));
      } else if (e.key === "Home") {
        e.preventDefault();
        setI(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setI(last);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  if (!slides.length) return null;
  const active = slides[Math.min(i, last)];

  return (
    // h-[100svh]: the small viewport unit, so a phone's collapsing toolbar cannot clip the
    // footer the way 100vh does.
    <div className="flex h-[100svh] flex-col overflow-hidden bg-paper">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink px-5 py-3 sm:px-8">
        <Link href={`/project/${projectSlug}/design-groups/${groupId}`} className="eyebrow blue shrink-0">
          ← {groupName}
        </Link>
        <p className="m-0 ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Handoff · draft
        </p>
      </header>

      <main className="min-h-0 flex-1 px-5 py-6 sm:px-8">
        {/* All of them stay in the DOM; only one is shown. */}
        {slides.map((s, n) => (
          <section
            key={s.id}
            hidden={n !== i}
            aria-hidden={n !== i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${s.label}, slide ${n + 1} of ${slides.length}`}
            className="mx-auto flex h-full min-h-0 w-full max-w-[1320px] flex-col"
          >
            {s.node}
          </section>
        ))}
      </main>

      <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-t border-ink px-5 py-3 sm:px-8">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {slides.map((s, n) => (
            <button
              key={s.id}
              onClick={() => go(n)}
              title={s.label}
              aria-label={`Go to ${s.label}`}
              aria-current={n === i}
              className={
                "h-2.5 rounded-full border transition-all " +
                (n === i
                  ? "w-7 border-ink bg-ink"
                  : "w-2.5 border-[var(--rule)] bg-paper hover:border-ink hover:bg-card")
              }
            />
          ))}
        </div>

        <p className="m-0 min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          {i + 1} / {slides.length} · {active.label}
        </p>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            onClick={() => go(i - 1)}
            disabled={i === 0}
            className="rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] enabled:hover:bg-lime disabled:opacity-35"
          >
            ← Prev
          </button>
          <button
            onClick={() => go(i + 1)}
            disabled={i === last}
            className="rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] enabled:hover:bg-lime disabled:opacity-35"
          >
            Next →
          </button>
        </div>
      </footer>

      {/* Announces the move for a screen reader without stealing focus. */}
      <div aria-live="polite" className="sr-only">
        {`${active.label}, slide ${i + 1} of ${slides.length}`}
      </div>
    </div>
  );
}
