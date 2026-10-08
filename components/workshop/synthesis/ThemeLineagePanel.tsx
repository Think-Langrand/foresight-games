"use client";

import type { RippleCard } from "@/lib/ripples-types";
import type { Week2Lineage } from "@/lib/synthesis-shape";
import { InlineText } from "@/components/workshop/synthesis/SynthesisCard";

// The theme's head card, everywhere a theme is worked on: its name — and, folded away, the
// implications it was built from.
//
// The name is the point, so it is plain and open: this is where a theme minted by a drop
// gets named, and an unnamed one says so in its place. The implications are reference
// material you dip into, so they are the one thing behind a disclosure; step 1 shows them
// as full cards instead and turns the disclosure off.
//
// A description used to be asked for under the name. Groups wrote the name and left it
// blank, so the ask is gone; one already written still shows, and the export and the
// facilitator's summary still read it.
//
// Each implication carries its Week 2 trail where there is one. Three cases legitimately
// have none, and each simply shows no trail: a card typed here by hand, a seed whose Week 2
// source was deleted (source_card_id is ON DELETE SET NULL), and a group whose Week 2 is
// still a placeholder.

export function ThemeLineagePanel({
  theme,
  implications,
  lineage,
  sourceIdOf,
  editable,
  busy,
  onEditTheme,
  namePlaceholder,
  menu,
  note,
  showImplications = true,
  children,
}: {
  theme: RippleCard;
  implications: RippleCard[];
  lineage: Record<string, Week2Lineage>;
  // Which Week 2 card an implication came from. Defaults to its own sourceCardId; the
  // explore step passes a twin-aware resolver, since a copy's link lives on its sibling.
  sourceIdOf?: (card: RippleCard) => string | null;
  editable: boolean;
  busy: boolean;
  onEditTheme: (text: string) => void;
  namePlaceholder?: string;
  // Drawn top-right of the name — the theme's own actions menu, where a step has one.
  menu?: React.ReactNode;
  // A line under the fields: step 1 uses it to teach what a theme is.
  note?: React.ReactNode;
  showImplications?: boolean;
  // Rendered INSIDE the card, edge to edge. Step 1 puts the implications and the readings
  // here so the theme and everything being worked out about it read as one sheet rather
  // than a header and a form.
  children?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[4px] border-2 border-ink bg-[rgba(196,255,103,0.16)]">
      <div className="px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* The question the name answers, so the label does the teaching every time the
              card is seen, not only in step 1's composer. */}
          <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">
            What is this theme about
          </div>

          <h2 className="mt-1 text-[20px] font-extrabold uppercase leading-[1.1] tracking-tight">
            <InlineText
              text={theme.text}
              editable={editable}
              busy={busy}
              emptyLabel="＋ Name this theme"
              placeholder={namePlaceholder}
              onSave={onEditTheme}
              editIcon
            />
          </h2>

          {theme.description && (
            <div className="mt-1.5 max-w-[70ch] whitespace-pre-wrap break-words text-[13.5px] leading-[1.5] text-ink/80">
              {theme.description}
            </div>
          )}
        </div>
        {menu}
      </div>

      {note}

      {showImplications && implications.length > 0 && (
        <details className="mt-3 border-t border-black/10 pt-2.5">
          <summary className="cursor-pointer list-none text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted hover:text-ink">
            ▸ Built from {implications.length} implication
            {implications.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {implications.map((c) => {
              const sourceId = sourceIdOf ? sourceIdOf(c) : c.sourceCardId;
              const from = sourceId ? lineage[sourceId] : undefined;
              return (
                <li key={c.id} className="border-l-2 border-black/15 pl-3">
                  <div className="text-[12.5px] leading-[1.4]">{c.text}</div>
                  {from && (
                    <div className="mt-1 text-[10.5px] leading-[1.4] text-muted">
                      <span className="font-bold uppercase tracking-[0.06em]">
                        {from.keyChange}
                      </span>
                      {from.chain.length > 1 && <> · {from.chain.slice(1).join(" → ")}</>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
      </div>

      {children}
    </div>
  );
}
