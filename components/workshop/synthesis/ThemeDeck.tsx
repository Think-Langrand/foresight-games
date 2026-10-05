"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import { themeAnswers, type SynthesisBoard } from "@/lib/synthesis-shape";
import { READING_QUESTIONS } from "@/components/workshop/synthesis/ReadingBoard";
import { makePrefStore, usePref } from "@/components/workshop/synthesis/prefStore";

// The themes, one card at a time, to read while writing hopes and fears. Step 3 is the
// board's, not a theme's, so the rail is gone — but a hope or fear is meant to come off
// what the group worked out in steps 1–2, and this keeps that within reach without
// leaving the step. Prev/Next, the dots, or the arrow keys turn the deck.
//
// Folds to one line, remembered per browser like the other rails: once the group has read
// through, the walls want the room back.

const deckPref = makePrefStore("synthesis.themeDeck", "open", ["open", "closed"] as const);

const navBtn =
  "rounded-[2px] border border-ink bg-paper px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] hover:bg-lime disabled:opacity-30";

export function ThemeDeck({ board }: { board: SynthesisBoard }) {
  const open = usePref(deckPref) === "open";
  const [index, setIndex] = useState(0);
  const themes = board.themes;
  if (themes.length === 0) return null;

  // Clamped on every render, not synced: a theme deleted live out from under the deck
  // simply shows the last one.
  const at = Math.min(index, themes.length - 1);
  const theme: RippleCard = themes[at];
  const answers = themeAnswers(board, theme.id);
  const risks = board.risks.get(theme.id) ?? [];
  const opportunities = board.opportunities.get(theme.id) ?? [];
  const go = (n: number) => setIndex(Math.max(0, Math.min(themes.length - 1, n)));

  return (
    <section
      aria-label="The themes, one at a time"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(at - 1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          go(at + 1);
        }
      }}
      className="overflow-hidden rounded-[4px] border-2 border-ink bg-[rgba(196,255,103,0.16)] outline-none focus-visible:ring-2 focus-visible:ring-ink"
    >
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <button
          onClick={() => deckPref.write(open ? "closed" : "open")}
          aria-expanded={open}
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted hover:text-ink"
        >
          {open ? "▾" : "▸"} Theme {at + 1} of {themes.length}
        </button>
        {!open && (
          <span className="min-w-0 truncate text-[13px] font-bold" title={theme.text}>
            {theme.text}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button disabled={at === 0} onClick={() => go(at - 1)} className={navBtn} aria-label="Previous theme">
            ← Prev
          </button>
          <span className="mx-1 flex items-center gap-1" aria-hidden>
            {themes.map((t, i) => (
              <button
                key={t.id}
                onClick={() => go(i)}
                title={t.text}
                className={
                  "h-[8px] w-[8px] rounded-full border border-ink " + (i === at ? "bg-ink" : "bg-paper hover:bg-lime")
                }
              />
            ))}
          </span>
          <button
            disabled={at === themes.length - 1}
            onClick={() => go(at + 1)}
            className={navBtn}
            aria-label="Next theme"
          >
            Next →
          </button>
        </span>
      </div>

      {open && (
        <div className="border-t-2 border-dashed border-black/15 px-5 py-4">
          <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">What is this theme about</div>
          <h3 className="mt-1 text-[18px] font-extrabold uppercase leading-[1.1] tracking-tight">{theme.text}</h3>
          {theme.description && (
            <p className="mt-1.5 max-w-[70ch] text-[13px] leading-[1.5] text-ink/80">{theme.description}</p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {READING_QUESTIONS.map((q) => {
              const text = (answers[q.key]?.text ?? "").trim();
              return (
                <div key={q.key} className={"rounded-[3px] border border-black/15 border-l-4 bg-paper p-2.5 " + q.accent}>
                  <div className="text-[10.5px] font-bold leading-[1.3] text-ink/70">{q.question}</div>
                  {text ? (
                    <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-[1.45]">{text}</p>
                  ) : (
                    <p className="mt-1 text-[11.5px] italic text-muted">Not answered yet.</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[3px] border-l-4 border-coral bg-coral/10 p-2.5">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">▼ Risks ({risks.length})</div>
              {risks.length > 0 ? (
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {risks.map((r) => (
                    <li key={r.id} className="rounded-[2px] border border-coral/50 bg-paper px-1.5 py-0.5 text-[12px] leading-[1.35]">
                      {r.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[11.5px] italic text-muted">None yet.</p>
              )}
            </div>
            <div className="rounded-[3px] border-l-4 border-[var(--lime-deep)] bg-lime/15 p-2.5">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">
                ▲ Opportunities ({opportunities.length})
              </div>
              {opportunities.length > 0 ? (
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {opportunities.map((o) => (
                    <li
                      key={o.id}
                      className="rounded-[2px] border border-[var(--lime-deep)]/60 bg-paper px-1.5 py-0.5 text-[12px] leading-[1.35]"
                    >
                      {o.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[11.5px] italic text-muted">None yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
