"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useSessionTabsHidden } from "@/components/design-groups/SessionHeader";

// How wide the right rail is, and how much of the page the rails are given. Both are one
// decision for the WEEK, not four decisions taken a step at a time.
//
// They used to be per step, and it showed: a facilitator's rail is wider, because step 1's
// rail also carries the suggested groupings, which need reading room — but only step 1
// said so, so the rail jumped 96px narrower on the way to step 2 and back on the way
// home. Step 4 had the matching problem on the other side: no theme rail, so the page kept
// nothing in reserve on the left and the board moved and resized under you.
//
// So the width is a context the view sets once, and the gutters are a hook every step
// calls. Two rails reading one fact cannot disagree about it.

const WideRail = createContext(false);

export function RailWidth({ wide, children }: { wide: boolean; children: ReactNode }) {
  return <WideRail value={wide}>{children}</WideRail>;
}

export function useWideRail() {
  return useContext(WideRail);
}

// Tell the page its rails are up, so the header and the board both yield to them. A DOM
// side effect in an effect is exactly what effects are for.
//
// Called by whatever holds the left gutter: the theme rail on steps 1–3, and step 4
// itself, which has no theme rail and holds the gutter anyway so that stepping into it
// does not move the board. Not while the board is hidden behind an earlier week's tab —
// the rails are hidden with it, and the read-only panel on show would be padded for rails
// that are not there.
export function useBoardGutters() {
  const wide = useWideRail();
  const hidden = useSessionTabsHidden();
  useEffect(() => {
    if (hidden) return;
    document.body.dataset.boardRails = wide ? "wide" : "1";
    return () => {
      delete document.body.dataset.boardRails;
    };
  }, [wide, hidden]);
}
