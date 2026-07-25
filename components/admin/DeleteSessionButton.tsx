"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Admin: delete a whole session (cascades its teams/submissions/responses).
export function DeleteSessionButton({ code }: { code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Delete session ${code} and everything in it? This can't be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${code}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete");
      }
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete session");
      setBusy(false);
    }
  }

  return (
    <button
      onClick={remove}
      disabled={busy}
      className="text-[11px] font-bold uppercase tracking-[0.06em] text-coral hover:underline disabled:opacity-50"
    >
      {busy ? "…" : "Delete"}
    </button>
  );
}
