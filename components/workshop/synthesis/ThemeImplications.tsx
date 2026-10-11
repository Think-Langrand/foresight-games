"use client";

import { useState } from "react";
import { orderTint } from "@/components/workshop/MapControls";
import { makePrefStore, usePref } from "@/components/workshop/synthesis/prefStore";
import {
  implicationKey,
  implicationOrder,
  ordinal,
  type TwinInfo,
  type Week2Lineage,
} from "@/lib/synthesis-shape";
import type { RippleCard } from "@/lib/ripples-types";

// What a theme was built from, read-only.
//
// Step 2 is about reflecting on a theme, and you cannot reflect on one without being able
// to see what is in it. This is the same list step 1 lets you drag around, minus every
// gesture: no drag, no tray, no menu, no composer. Changing WHAT is in a theme is step 1's
// job, and the link at the foot says so rather than quietly offering a second way to do it.
//
// Each row is the implication and nothing else: what it says, and what KIND of implication
// it is — first-order, second, third — which is the one thing about it that changes how
// much weight it carries. Everything else is behind "More about this one".
//
// What opens there is the chain it came down: the key change at the top, each step under
// the last, this implication in bold at the foot. It used to be one grey line —
// "KEY CHANGE · step → step → step" — which is the same information arranged so that
// nobody read it. The twin note ("also in another theme") moved in there too; it answers
// a question you ask about one card at a time, not while scanning a list.

const FOLD = ["open", "closed"] as const;
const cardsPref = makePrefStore("synthesis.exploreCards", "open", FOLD);

export function ThemeImplications({
  implications,
  lineage,
  twins,
  themes,
  onGoToCluster,
}: {
  implications: RippleCard[];
  // Week 2 ancestry, keyed by Week 2 card id.
  lineage: Record<string, Week2Lineage>;
  twins: Map<string, TwinInfo>;
  // To name the other themes in the twin badge's tooltip.
  themes: RippleCard[];
  onGoToCluster?: () => void;
}) {
  const open = usePref(cardsPref) === "open";
  // Which rows have their chain showing. Per visit, not remembered: it is a thing you open
  // to answer a question and close again, and several at once is fine.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  // A copy carries no sourceCardId of its own — it stays out of 0018's unique index — so
  // the trail is read from whichever copy does hold the Week 2 link.
  const sourceIdOf = (c: RippleCard) =>
    c.sourceCardId ?? twins.get(implicationKey(c))?.sourceCardId ?? null;

  return (
    <div className="border-t-2 border-dashed border-black/15 px-5 py-4">
      <button
        onClick={() => cardsPref.write(open ? "closed" : "open")}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted hover:text-ink"
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span>
        In this theme ({implications.length})
      </button>

      {open &&
        (implications.length === 0 ? (
          <p className="mt-2.5 text-[12px] italic leading-[1.4] text-muted">
            Nothing in it yet. Put implications in a theme back on step 1.
          </p>
        ) : (
          <ul className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
            {implications.map((c) => {
              const sourceId = sourceIdOf(c);
              const from = sourceId ? lineage[sourceId] : undefined;
              const order = implicationOrder(from);
              const info = twins.get(implicationKey(c));
              const inThemes = info?.themeIds.length ?? 1;
              const alsoIn = (info?.themeIds ?? [])
                .map((id) => themes.find((t) => t.id === id)?.text)
                .filter((t): t is string => Boolean(t));
              const hasMore = Boolean(from) || inThemes > 1;
              const isOpen = expanded.has(c.id);
              return (
                <li key={c.id} className="rounded-[3px] border border-black/15 bg-paper p-2.5">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-[12.5px] leading-[1.4]">{c.text}</span>
                    {order !== null && (
                      <span
                        title={`${ordinal(order)}-order implication — ${order} step${order === 1 ? "" : "s"} from its key change`}
                        className="shrink-0 rounded-[2px] px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] text-ink"
                        style={{ background: orderTint(order) }}
                      >
                        {ordinal(order)}
                      </span>
                    )}
                  </div>

                  {hasMore && (
                    <button
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (!next.delete(c.id)) next.add(c.id);
                          return next;
                        })
                      }
                      aria-expanded={isOpen}
                      className="mt-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.05em] text-blue hover:underline"
                    >
                      <span aria-hidden>{isOpen ? "▾" : "▸"}</span>
                      {isOpen ? "Less" : "More about this one"}
                    </button>
                  )}

                  {isOpen && (
                    <div className="mt-2 border-t border-black/10 pt-2.5">
                      {from && (
                        <>
                          <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">
                            Where it came from, in Week 2
                          </div>
                          {/* One step per line, down the page, so the chain reads as the
                              walk it was: the key change, what it led to, and so on down
                              to this card. */}
                          <ol className="mt-1.5 flex flex-col gap-1.5 border-l-2 border-black/10 pl-2.5">
                            {from.chain.map((step, i) => {
                              const last = i === from.chain.length - 1;
                              return (
                                <li key={i} className="flex items-start gap-1.5">
                                  <span
                                    className={
                                      "mt-px shrink-0 rounded-[2px] px-1 py-px text-[8.5px] font-bold uppercase tracking-[0.06em] " +
                                      // The root is the one step that is not an order, so
                                      // it is the one badge that is not an order's tint.
                                      (i === 0 ? "bg-ink text-paper" : "text-ink")
                                    }
                                    style={i === 0 ? undefined : { background: orderTint(i) }}
                                  >
                                    {i === 0 ? "Key change" : ordinal(i)}
                                  </span>
                                  <span
                                    className={
                                      "min-w-0 text-[11.5px] leading-[1.4] " +
                                      (last ? "font-bold text-ink" : "text-muted")
                                    }
                                  >
                                    {step}
                                  </span>
                                </li>
                              );
                            })}
                          </ol>
                        </>
                      )}

                      {inThemes > 1 && (
                        <div className="mt-2.5 text-[10.5px] leading-[1.4] text-blue">
                          <span aria-hidden className="mr-1">
                            ⧉
                          </span>
                          Also in {inThemes - 1} other theme{inThemes === 2 ? "" : "s"}
                          {alsoIn.length > 0 && (
                            <span className="text-muted"> — {alsoIn.join(" · ")}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ))}

      {open && onGoToCluster && (
        <button
          onClick={onGoToCluster}
          className="mt-3 text-[10.5px] font-bold uppercase tracking-[0.05em] text-blue hover:underline"
        >
          ← Change what is in this theme
        </button>
      )}
    </div>
  );
}
