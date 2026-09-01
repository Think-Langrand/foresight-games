"use client";

import { useEffect } from "react";

// A small design-system confirm dialog — the second confirmation step for destructive
// actions (replaces window.confirm). Closes on backdrop click or Escape.
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Delete",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-[4px] border border-ink bg-card p-5 shadow-[4px_6px_0_rgba(36,36,34,0.18)]"
      >
        <h2 className="text-[16px] font-extrabold uppercase tracking-tight">{title}</h2>
        <div className="mt-2 text-[13.5px] leading-[1.5] text-muted">{message}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-[2px] border border-ink bg-paper px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-[var(--hairline)] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-[2px] border border-coral bg-coral px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-white hover:opacity-90 disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
