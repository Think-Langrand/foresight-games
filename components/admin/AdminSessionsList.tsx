"use client";

import { useMemo, useState } from "react";
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

export function AdminSessionsList({
  sessions,
  projectNameById = {},
}: {
  sessions: SessionSummary[];
  projectNameById?: Record<string, string>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codes = useMemo(() => sessions.map((s) => s.session.code), [sessions]);
  const byCode = useMemo(
    () => new Map(sessions.map((s) => [s.session.code, s])),
    [sessions]
  );
  const allSelected = selected.size > 0 && selected.size === codes.length;

  // A session has real results worth protecting if any team submitted (Cards),
  // any team joined a Ripples board, or any text submission landed (Full/Single).
  function hasResults(summary: SessionSummary): boolean {
    if (summary.session.scope === "Cards") return summary.submittedTeamCount > 0;
    if (summary.session.scope === "Ripples") return summary.rippleTeamCount > 0;
    return summary.submissionCount > 0;
  }

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === codes.length ? new Set() : new Set(codes)));
  }

  async function bulkDelete() {
    const targets = [...selected];
    if (targets.length === 0) return;
    if (
      !confirm(
        `Delete ${targets.length} session${targets.length === 1 ? "" : "s"} and everything in ` +
          `${targets.length === 1 ? "it" : "them"}? This can't be undone.`
      )
    )
      return;

    // Second, explicit gate: if any selected session has submitted results,
    // name them and require a separate confirmation before wiping them out.
    const withResults = targets
      .map((code) => byCode.get(code))
      .filter((s): s is SessionSummary => Boolean(s) && hasResults(s!));
    if (withResults.length > 0) {
      const list = withResults
        .map((s) => {
          const n =
            s.session.scope === "Cards"
              ? s.submittedTeamCount
              : s.session.scope === "Ripples"
                ? s.rippleTeamCount
                : s.submissionCount;
          const kind =
            s.session.scope === "Cards"
              ? "submitted team(s)"
              : s.session.scope === "Ripples"
                ? "team(s)"
                : "submission(s)";
          return `  • ${s.session.code}${s.session.title ? ` — ${s.session.title}` : ""}: ${n} ${kind}`;
        })
        .join("\n");
      if (
        !confirm(
          `⚠️ ${withResults.length} of the selected session${
            withResults.length === 1 ? " has" : "s have"
          } SUBMITTED RESULTS that will be permanently deleted:\n\n${list}\n\n` +
            `Are you sure you want to delete these results too?`
        )
      )
        return;
    }

    setBusy(true);
    setError(null);
    const results = await Promise.allSettled(
      targets.map(async (code) => {
        const res = await fetch(`/api/sessions/${code}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to delete ${code}`);
        }
      })
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      setError(`${failed} of ${targets.length} could not be deleted.`);
    }
    setSelected(new Set());
    setBusy(false);
    router.refresh();
  }

  if (sessions.length === 0) {
    return <p className="mt-10 text-[14px] text-muted">No sessions yet.</p>;
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={bulkDelete}
          disabled={busy || selected.size === 0}
          className="rounded-[2px] border border-ink bg-paper px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] enabled:hover:bg-coral enabled:hover:text-white disabled:opacity-40"
        >
          {busy ? "Deleting…" : `Delete selected${selected.size ? ` (${selected.size})` : ""}`}
        </button>
        {selected.size > 0 && (
          <button
            onClick={() => setSelected(new Set())}
            disabled={busy}
            className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted underline hover:text-ink"
          >
            Clear
          </button>
        )}
        {error && <span className="text-[12px] font-semibold text-coral">{error}</span>}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[var(--rule)] text-left text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
              <th className="py-2 pr-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all sessions"
                  className="align-middle accent-[var(--coral)]"
                />
              </th>
              <th className="py-2 pr-3">Code</th>
              <th className="py-2 pr-3">Title</th>
              <th className="py-2 pr-3">Project</th>
              <th className="py-2 pr-3">Scope</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3 text-right" title="Submitted teams / total teams">
                Submitted / teams
              </th>
              <th className="py-2 pr-3 text-right">Subs</th>
              <th className="py-2 pr-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(({ session: s, teamCount, submittedTeamCount, submissionCount, rippleTeamCount }) => {
              const checked = selected.has(s.code);
              return (
                <tr
                  key={s.id}
                  className={
                    "border-b border-[var(--hairline)] align-middle hover:bg-card " +
                    (checked ? "bg-card" : "")
                  }
                >
                  <td className="py-2.5 pr-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(s.code)}
                      aria-label={`Select session ${s.code}`}
                      className="align-middle accent-[var(--coral)]"
                    />
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex flex-col">
                      <Link
                        href={`/admin/s/${s.code}`}
                        className="font-bold tracking-[0.08em] text-blue underline"
                      >
                        {s.code}
                      </Link>
                      <Link
                        href={`/sessions/${s.code}/analysis`}
                        className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted hover:text-ink hover:underline"
                      >
                        Analysis →
                      </Link>
                    </div>
                  </td>
                  <td className="max-w-[280px] truncate py-2.5 pr-3" title={s.title}>
                    {s.title || <span className="text-muted">—</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    {s.projectId ? (
                      <span className="text-[12px] font-semibold text-blue">
                        {projectNameById[s.projectId] ?? "Project"}
                      </span>
                    ) : (
                      <span className="text-muted">Global</span>
                    )}
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
                  <td
                    className="py-2.5 pr-3 text-right tabular-nums"
                    title={`${submittedTeamCount} submitted of ${teamCount} teams`}
                  >
                    {s.scope === "Cards" ? (
                      submittedTeamCount > 0 ? (
                        <span className="font-bold">
                          {submittedTeamCount}
                          <span className="font-normal text-muted">/{teamCount}</span>
                        </span>
                      ) : (
                        // No submissions — safe to clean up.
                        <span className="text-muted">0/{teamCount}</span>
                      )
                    ) : s.scope === "Ripples" ? (
                      <span className={rippleTeamCount > 0 ? "font-bold" : "text-muted"}>
                        {rippleTeamCount} team{rippleTeamCount === 1 ? "" : "s"}
                      </span>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
