"use client";

import { useEffect, useId } from "react";

// Deleting a theme is not one decision, it is two: whether to delete it, and what happens
// to what it holds. `parent_card_id` is ON DELETE CASCADE, so "just delete it" would take
// the group's clustered implications with it — which is exactly what the route refuses.
// Rather than let that refusal surface as an error after the card has already vanished,
// the choice is made here, before anything is written.

export type DeleteThemeMode = "move" | "purge";

export function DeleteThemeModal({
  open,
  themeText,
  implications,
  chainCards,
  busy,
  onChoose,
  onCancel,
}: {
  open: boolean;
  themeText: string;
  implications: number;
  chainCards: number; // hopes, fears, assumptions, risks, opportunities, tensions
  busy: boolean;
  onChoose: (mode: DeleteThemeMode) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const empty = implications === 0 && chainCards === 0;
  const n = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onCancel}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] rounded-[4px] border border-ink bg-card p-5 shadow-[4px_6px_0_rgba(36,36,34,0.18)]"
      >
        <h2 id={titleId} className="text-[16px] font-extrabold uppercase tracking-tight">
          Delete &ldquo;{themeText.slice(0, 60)}&rdquo;?
        </h2>

        <div className="mt-2 text-[13.5px] leading-[1.5] text-muted">
          {empty ? (
            <>This theme is empty, so nothing else goes with it.</>
          ) : (
            <>
              It holds{" "}
              {implications > 0 && (
                <strong className="text-ink">{n(implications, "implication", "implications")}</strong>
              )}
              {implications > 0 && chainCards > 0 && " and "}
              {chainCards > 0 && (
                <>
                  <strong className="text-ink">
                    {n(chainCards, "other card", "other cards")}
                  </strong>{" "}
                  written on it — hopes, fears, risks, opportunities
                </>
              )}
              .
            </>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2">
          {implications > 0 && (
            <button
              onClick={() => onChoose("move")}
              disabled={busy}
              className="rounded-[2px] border border-ink bg-lime px-4 py-2 text-left text-[12px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep disabled:opacity-40"
            >
              Move the implications back to the tray, then delete
              {chainCards > 0 && (
                <span className="mt-0.5 block text-[10.5px] font-normal normal-case tracking-normal text-ink/70">
                  Its {n(chainCards, "other card", "other cards")} will still be deleted —
                  the hopes, fears, risks and opportunities belong to the theme.
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => onChoose("purge")}
            disabled={busy}
            className="rounded-[2px] border border-coral bg-paper px-4 py-2 text-left text-[12px] font-bold uppercase tracking-[0.06em] text-coral hover:bg-coral hover:text-white disabled:opacity-40"
          >
            {empty ? "Delete this theme" : "Delete the theme and everything in it"}
            {!empty && (
              <span className="mt-0.5 block text-[10.5px] font-normal normal-case tracking-normal opacity-80">
                This cannot be undone.
              </span>
            )}
          </button>

          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-[2px] border border-ink bg-paper px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-[var(--hairline)] disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
