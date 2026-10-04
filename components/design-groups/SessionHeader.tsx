"use client";

import { createContext, useContext } from "react";
import { createPortal } from "react-dom";

// The one header line a design-group session page has: the session tabs on the left and,
// on the right, whatever the live board wants up there (its scenario ↔ worksheet toggle).
//
// The board used to draw a second header under the tabs — eyebrow, the same title the
// active tab already shows, a rule — and put its toggle in that. Two headers saying one
// thing. Now SessionTabs owns the line and lends the board the right-hand end of it through
// this context: `slot` is the element to portal into. Outside SessionTabs (the standalone
// /workshop pages) there is no context, so a board keeps drawing its own header.

const SessionHeaderContext = createContext<{ slot: HTMLElement | null } | null>(null);

export const SessionHeaderProvider = SessionHeaderContext.Provider;

// Is this board inside a SessionTabs page? Decides whether it draws its own header.
export function useInSessionTabs(): boolean {
  return useContext(SessionHeaderContext) !== null;
}

// Render children at the right-hand end of the session header line. Until the slot element
// has mounted (server render, first client paint) nothing is drawn, which keeps the two
// renders identical; the slot's callback ref then triggers the portal.
export function SessionHeaderActions({ children }: { children: React.ReactNode }) {
  const ctx = useContext(SessionHeaderContext);
  if (!ctx?.slot) return null;
  return createPortal(children, ctx.slot);
}
