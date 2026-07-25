"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { roleHex } from "@/components/workshop/CardArt";
import { teamTriadIds, type Card, type Team } from "@/lib/workshop-types";

// Admin "view all teams" surface across every session, with delete controls.
// Public-facing viewing lives at /scenario-molecules; this is the managed copy.
export function AdminTeamsManager({ teams, deck }: { teams: Team[]; deck: Card[] }) {
  const router = useRouter();
  const byId = useMemo(() => new Map(deck.map((c) => [c.id, c])), [deck]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(team: Team) {
    if (!confirm(`Delete team "${team.name || "Team"}" (${team.code})? This can't be undone.`))
      return;
    setBusyId(team.id);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${team.code}/teams/${team.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete team");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  if (teams.length === 0) {
    return <p className="mt-6 text-[14px] text-muted">No teams have been built yet.</p>;
  }

  return (
    <>
      {error && <div className="mt-4 text-[13px] font-semibold text-coral">{error}</div>}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {teams.map((t) => {
          const triad = teamTriadIds(t)
            .map((id) => byId.get(id))
            .filter((c): c is Card => Boolean(c));
          const submitted = t.status === "Submitted";
          return (
            <div
              key={t.id}
              className="flex flex-col rounded-[3px] border border-[var(--hairline)] bg-card p-4"
              style={{ borderTop: `4px solid ${t.color}` }}
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-[2px] border border-ink"
                    style={{ background: t.color }}
                  />
                  <span className="text-[14px] font-extrabold">{t.name || "Team"}</span>
                </span>
                <Link
                  href={`/admin/s/${t.code}`}
                  className="text-[10px] font-bold uppercase tracking-[0.08em] text-blue underline"
                >
                  {t.code}
                </Link>
              </div>

              {t.worldTitle ? (
                <div className="mt-3 text-[17px] font-extrabold uppercase leading-[1.1] tracking-tight">
                  {t.worldTitle}
                </div>
              ) : (
                <div className="mt-3 text-[13px] italic text-muted">Untitled world</div>
              )}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {triad.map((c) => (
                  <span
                    key={c.id}
                    className="rounded-[2px] border border-[var(--hairline)] bg-paper px-2 py-1 text-[10.5px] font-semibold"
                    style={{ borderLeft: `3px solid ${roleHex(c.role)}` }}
                  >
                    {c.title}
                  </span>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[var(--hairline)] pt-3">
                <span
                  className={
                    "rounded-[2px] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] " +
                    (submitted ? "bg-lime text-ink" : "border border-[var(--hairline)] text-muted")
                  }
                >
                  {submitted ? "Submitted" : "Drafting"}
                </span>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/scenario-molecules/${t.id}`}
                    className="text-[11px] font-bold uppercase tracking-[0.06em] text-blue hover:underline"
                  >
                    View →
                  </Link>
                  <button
                    onClick={() => remove(t)}
                    disabled={busyId === t.id}
                    className="text-[11px] font-bold uppercase tracking-[0.06em] text-coral hover:underline disabled:opacity-50"
                  >
                    {busyId === t.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
