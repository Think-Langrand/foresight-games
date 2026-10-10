"use client";

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
// It replaces the "▸ Built from N implications" fold this grew out of, which showed the
// text and the Week 2 trail. The ordinal stamp and the twin badge come across from step 1,
// because both answer questions a group actually asks while reading a theme: how much of
// this is third-order speculation, and is this one also counted somewhere else.

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
              return (
                <li
                  key={c.id}
                  className="relative rounded-[3px] border border-black/15 bg-paper p-2.5 pb-5"
                >
                  <div className="text-[12.5px] leading-[1.4]">{c.text}</div>

                  {from && (
                    <div className="mt-1.5 text-[10.5px] leading-[1.4] text-muted">
                      <span className="font-bold uppercase tracking-[0.06em]">{from.keyChange}</span>
                      {from.chain.length > 1 && <> · {from.chain.slice(1).join(" → ")}</>}
                    </div>
                  )}

                  {inThemes > 1 && (
                    <div
                      className="mt-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.05em] text-blue"
                      title={info?.themeIds
                        .map((id) => themes.find((t) => t.id === id)?.text ?? "")
                        .filter(Boolean)
                        .join("  ·  ")}
                    >
                      <span aria-hidden>⧉</span>
                      Also in {inThemes - 1} other theme{inThemes === 2 ? "" : "s"}
                    </div>
                  )}

                  {order !== null && (
                    <span
                      title={`${ordinal(order)}-order implication — ${order} step${order === 1 ? "" : "s"} from its key change`}
                      className="pointer-events-none absolute bottom-1 right-1 rounded-[2px] px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] text-ink"
                      style={{ background: orderTint(order) }}
                    >
                      {ordinal(order)}
                    </span>
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
