"use client";

import { CARD_DESCRIPTION_MAX, type RippleCard } from "@/lib/ripples-types";
import type { Week2Lineage } from "@/lib/synthesis-shape";
import { InlineText } from "@/components/workshop/synthesis/SynthesisCard";

// The theme you are writing hopes and fears about, at the head of the step: its name, what
// the group said it means, and — folded away — the implications it was built from.
//
// The name and description are the point, so they are plain and open. The implications are
// reference material you dip into, so they are the one thing behind a disclosure.
//
// Each implication carries its Week 2 trail where there is one. Three cases legitimately
// have none, and each simply shows no trail: a card typed here by hand, a seed whose Week 2
// source was deleted (source_card_id is ON DELETE SET NULL), and a group whose Week 2 is
// still a placeholder.

export function ThemeLineagePanel({
  theme,
  implications,
  lineage,
  editable,
  busy,
  onEditTheme,
  onDescribeTheme,
}: {
  theme: RippleCard;
  implications: RippleCard[];
  lineage: Record<string, Week2Lineage>;
  editable: boolean;
  busy: boolean;
  onEditTheme: (text: string) => void;
  onDescribeTheme: (description: string) => void;
}) {
  return (
    <div className="rounded-[4px] border-2 border-ink bg-[rgba(196,255,103,0.16)] px-5 py-4">
      <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">Theme</div>

      <h2 className="mt-1 text-[20px] font-extrabold uppercase leading-[1.1] tracking-tight">
        <InlineText
          text={theme.text}
          editable={editable}
          busy={busy}
          onSave={onEditTheme}
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
          onSave={onDescribeTheme}
        />
      </div>

      {implications.length > 0 && (
        <details className="mt-3 border-t border-black/10 pt-2.5">
          <summary className="cursor-pointer list-none text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted hover:text-ink">
            ▸ Built from {implications.length} implication
            {implications.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {implications.map((c) => {
              const from = c.sourceCardId ? lineage[c.sourceCardId] : undefined;
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
  );
}
