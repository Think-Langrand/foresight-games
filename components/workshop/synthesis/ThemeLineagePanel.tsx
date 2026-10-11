"use client";

import type { RippleCard } from "@/lib/ripples-types";
import { InlineText } from "@/components/workshop/synthesis/SynthesisCard";

// The theme's head card, everywhere a theme is worked on: its name, and whatever the step
// wants to hang under it.
//
// The name is the point, so it is plain and open: this is where a theme minted by a drop
// gets named, and an unnamed one says so in its place.
//
// It used to carry a folded list of the implications the theme was built from, but both
// steps outgrew it — step 1 draws them as full draggable cards and step 2 as
// ThemeImplications — so it is purely the head now.
//
// A description used to be asked for under the name. Groups wrote the name and left it
// blank, so the ask is gone; one already written still shows, and the export and the
// facilitator's summary still read it.

export function ThemeLineagePanel({
  theme,
  editable,
  busy,
  onEditTheme,
  namePlaceholder,
  menu,
  note,
  children,
}: {
  theme: RippleCard;
  editable: boolean;
  busy: boolean;
  onEditTheme: (text: string) => void;
  namePlaceholder?: string;
  // Drawn top-right of the name — the theme's own actions menu, where a step has one.
  menu?: React.ReactNode;
  // A line under the fields: step 1 uses it to teach what a theme is.
  note?: React.ReactNode;
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

      </div>

      {children}
    </div>
  );
}
