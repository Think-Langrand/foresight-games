"use client";

import { useEffect, useState } from "react";

// Display-only countdown. Every client derives the same remaining time from the
// shared `phase_ends_at` timestamp, so there's no server tick and no drift. On
// expiry it shows "time's up" but input keeps flowing — the server validates by
// phase until the facilitator advances (soft expiry).
export function RippleCountdown({ endsAt }: { endsAt: string | null }) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  if (!endsAt) return null;
  const remainingMs = new Date(endsAt).getTime() - now;
  const expired = remainingMs <= 0;
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  const warn = !expired && total <= 60;

  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1 text-[13px] font-bold tabular-nums " +
        (expired
          ? "border-coral bg-coral text-white"
          : warn
            ? "border-ink bg-yellow text-ink"
            : "border-ink bg-card text-ink")
      }
    >
      {expired ? "Time's up" : `${mm}:${String(ss).padStart(2, "0")}`}
    </span>
  );
}
