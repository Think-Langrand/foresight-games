"use client";

import { useLayoutEffect } from "react";

// Lines the theme rail up with the board. The rail is fixed to the viewport and starts at
// the top of the page; the board's workspace — the map or the cards — starts wherever the
// header rows and the toolbar leave it. This measures that distance from the top of the document and
// hands it to the rail as `--rail-band`, which the rail spends on its top band (the
// "selected implication" read-out, as a minimum) so the themes below it begin level with the map.
//
// A DOM write, not state: nothing React renders depends on the number, and writing it
// straight to the body is what lets a fixed element outside the board read it. Re-measured
// on resize and whenever the body's size changes — the session tabs wrap, a banner appears
// above the toolbar, the rail padding transitions — each of which moves the toolbar.
//
// Takes an element, not a ref: a callback ref hands the element over when it mounts, so a
// mark that renders in a different branch (theme open / closed) is still the one
// measured. A null element, or one with no size (the board inside a hidden past-week tab),
// clears the variable rather than writing a stale one.
const VAR = "--rail-band";

export function useRailBand(el: HTMLElement | null) {
  useLayoutEffect(() => {
    if (!el) {
      document.body.style.removeProperty(VAR);
      return;
    }
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        document.body.style.removeProperty(VAR);
        return;
      }
      document.body.style.setProperty(VAR, `${Math.max(0, Math.round(r.top + window.scrollY))}px`);
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(document.body);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
      document.body.style.removeProperty(VAR);
    };
  }, [el]);
}
