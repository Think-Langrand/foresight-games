"use client";

import { useEffect } from "react";

/**
 * The theme and everything worked out about it, tucked into a right-edge slide-out.
 *
 * Step 3's job is to write hopes and fears. The theme card and its at-stake dossier are
 * there to be consulted while you do it — but inline they ran to 786px, which pushed the
 * cards you are actually filling in below the fold on a laptop. Here they are a handle.
 *
 * NON-MODAL ON DESKTOP IS THE POINT, not a detail. The dossier was carried into this step
 * so that a hope could say why one of *those* possibilities matters; hiding it behind a
 * modal would take that away. Open, it behaves as a sticky rail you chose to have: the
 * board behind stays fully interactive, so you can read a risk and edit a card with it up.
 * A backdrop appears only on mobile, where the panel is near-full and there is nothing
 * usable behind it anyway.
 *
 * Deliberately parallel to components/workshop/ReferenceDrawer.tsx, which is the same
 * shell with two tabs and fixed content. They are not shared because that one is mounted
 * on two live participant surfaces and this needed different content and one tab; if a
 * third slide-out ever appears, that is the moment to lift the shell out of both.
 */
export function ThemeDrawer({
  open,
  onToggle,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  // Named on the sticky header so the panel says which theme it belongs to.
  label: string;
  children: React.ReactNode;
}) {
  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    // Full-screen layer, click-through except on the tab, backdrop and panel. Under the
    // z-[100] confirm modals, so a delete confirmation still lands on top of this.
    <div className="pointer-events-none fixed inset-0 z-40">
      {open && (
        <div
          className="pointer-events-auto absolute inset-0 bg-[rgba(20,20,18,0.4)] sm:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* Panel and its tab slide together, so the tab rides out to the screen edge when
          closed and stays attached to the panel when open. */}
      <div
        className={
          "absolute inset-y-0 right-0 transition-transform duration-300 ease-out " +
          (open ? "translate-x-0" : "translate-x-full")
        }
      >
        <div className="pointer-events-auto absolute right-full top-1/2 -translate-y-1/2">
          <button
            onClick={onToggle}
            aria-expanded={open}
            className={
              "rounded-l-[6px] border border-r-0 border-ink py-3 pl-2 pr-1.5 text-[11px] font-bold uppercase tracking-[0.12em] shadow-sm transition-colors " +
              (open ? "bg-lime" : "bg-card hover:bg-lime")
            }
            style={{ writingMode: "vertical-rl" }}
          >
            Theme
          </button>
        </div>

        <aside
          className="pointer-events-auto h-full w-[86vw] max-w-[420px] overflow-y-auto border-l border-ink bg-paper"
          role="dialog"
          aria-label={`Theme: ${label}`}
          aria-hidden={!open}
          inert={!open}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--hairline)] bg-paper px-5 py-3">
            <span className="eyebrow ink">This theme</span>
            <button
              onClick={onClose}
              className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted hover:text-ink"
            >
              Close ✕
            </button>
          </div>

          <div className="px-5 py-4">{children}</div>
        </aside>
      </div>
    </div>
  );
}
