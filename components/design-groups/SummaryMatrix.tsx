"use client";

import { useState } from "react";
import { ImpactMatrix } from "@/components/workshop/ImpactMatrix";
import type { CardOrder, RippleCard } from "@/lib/ripples-types";

// The handoff deck's matrix. A CLIENT WRAPPER around the board's own ImpactMatrix, for two
// reasons that both come from GroupSummary being server-rendered:
//
//   1. ImpactMatrix takes `chipClassFor` and `onHover`, which are FUNCTIONS. Function props
//      cannot cross the server/client boundary, so the deck cannot pass them directly.
//   2. Hover is state. Keeping it here means the deck stays a server component and still
//      gets the grid's hover-to-name behaviour.
//
// It takes the SHAPED rows the summary already carries rather than raw cards, so a slide
// never has to reach back to the board for something the handoff has already projected.
export interface MatrixRow {
  id: string;
  text: string;
  plausibility: number | null;
  impact: number | null;
  // Week 4 puts risks and opportunities on one grid and they must be told apart. Absent on
  // Week 2's key changes, which are all one kind.
  kind?: "risk" | "opportunity";
}

// ImpactMatrix reads a RippleCard, but only five fields of one: id, text, parentId and
// order (together, isTreeRoot), the two scores, and createdTime for the unscored tiebreak.
// The rest are filled with the inert defaults a read-only grid never looks at. Building the
// card here rather than threading real ones through keeps the summary's own types as the
// deck's single source.
function toCard(r: MatrixRow, i: number): RippleCard {
  return {
    id: r.id,
    teamId: "",
    authorPlayerId: null,
    // FIRST + a null parent is what isTreeRoot wants; anything else and the grid drops it.
    order: "FIRST" as CardOrder,
    parentId: null,
    text: r.text,
    lensId: null,
    flagged: false,
    greyed: false,
    sort: 0,
    section: null,
    sourceCardId: null,
    sourceLabel: null,
    plausibility: r.plausibility,
    impact: r.impact,
    cardKind: null,
    parked: false,
    description: null,
    shortlisted: false,
    twinKey: null,
    // Index order, so two unscored rows keep the order the summary gave them instead of
    // sorting by a timestamp this wrapper would have to invent.
    createdTime: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
  };
}

export default function SummaryMatrix({
  rows,
  noun = "key change",
  axisLabels,
}: {
  rows: MatrixRow[];
  noun?: string;
  // What to call the two axes. Week 2 keeps Plausibility / Impact; Session 4 scored the
  // same stored axis as Likelihood. Passed straight through to ImpactMatrix.
  axisLabels?: { x: string; y: string };
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const cards = rows.map(toCard);
  const kinds = new Map(rows.map((r) => [r.id, r.kind]));
  // Only colour by kind when the rows actually carry one: Week 2's key changes pass none,
  // and ImpactMatrix's default chip is right for them.
  const mixed = rows.some((r) => r.kind);

  return (
    <ImpactMatrix
      cards={cards}
      noun={noun}
      axisLabels={axisLabels}
      hoveredId={hovered}
      onHover={setHovered}
      // PAPER FILL, COLOURED RING. The grid tints its own high/high quadrant lime, and a
      // lime-filled chip vanished into it — the opportunities were invisible in exactly the
      // cell where an opportunity matters most. A paper chip reads on every cell, tinted or
      // not, and the ring carries the kind.
      //
      // The olive is the one Session 3's opportunity wall already uses, rather than the
      // lime token, which has no contrast against its own background.
      chipClassFor={
        mixed
          ? (card) =>
              kinds.get(card.id) === "risk"
                ? "border-coral bg-paper text-coral"
                : "border-[#3f5209] bg-paper text-[#3f5209]"
          : undefined
      }
    />
  );
}
