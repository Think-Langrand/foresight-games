"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SessionSummary } from "@/lib/workshop";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AdminSessionsList({ sessions }: { sessions: SessionSummary[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function remove(code: string) {
    if (!confirm(`Delete session ${code} and all its data? This cannot be undone.`)) return;
    setDeleting(code);
    try {
      const res = await fetch(`/api/sessions/${code}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Delete failed");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  if (sessions.length === 0) {
    return <p className="mt-10 text-[14px] text-muted">No sessions yet.</p>;
  }

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[var(--rule)] text-left text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
            <th className="py-2 pr-3">Code</th>
            <th className="py-2 pr-3">Title</th>
            <th className="py-2 pr-3">Scope</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3 text-right">Teams</th>
            <th className="py-2 pr-3 text-right">Subs</th>
            <th className="py-2 pr-3">Created</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {sessions.map(({ session: s, teamCount, submittedTeamCount, submissionCount }) => (
            <tr
              key={s.id}
              className="border-b border-[var(--hairline)] align-middle hover:bg-card"
            >
              <td className="py-2.5 pr-3">
                <Link
                  href={`/admin/s/${s.code}`}
                  className="font-bold tracking-[0.08em] text-blue underline"
                >
                  {s.code}
                </Link>
              </td>
              <td className="max-w-[280px] truncate py-2.5 pr-3" title={s.title}>
                {s.title || <span className="text-muted">—</span>}
              </td>
              <td className="py-2.5 pr-3">{s.scope}</td>
              <td className="py-2.5 pr-3">
                <span
                  className={
                    "rounded-[2px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] " +
                    (s.status === "Closed"
                      ? "bg-[var(--hairline)] text-muted"
                      : "bg-lime text-ink")
                  }
                >
                  {s.status}
                </span>
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums">
                {s.scope === "Cards" ? (
                  <>
                    {submittedTeamCount}/{teamCount}
                  </>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums">
                {s.scope === "Cards" ? (
                  <span className="text-muted">—</span>
                ) : (
                  submissionCount
                )}
              </td>
              <td className="whitespace-nowrap py-2.5 pr-3 text-muted">
                {fmtDate(s.createdTime)}
              </td>
              <td className="py-2.5 text-right">
                <button
                  onClick={() => remove(s.code)}
                  disabled={deleting === s.code}
                  className="text-[11px] font-bold uppercase tracking-[0.06em] text-coral hover:underline disabled:opacity-50"
                >
                  {deleting === s.code ? "Deleting…" : "Delete"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
