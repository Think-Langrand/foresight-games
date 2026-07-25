"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { roleHex } from "@/components/workshop/CardArt";
import { teamTriadIds, type Card, type Team } from "@/lib/workshop-types";

type StatusFilter = "all" | "submitted" | "drafting";

// Admin "entries" surface across every session: filter by status, gather a
// selection into a group, and export that group as CSV or a JSON array. Public
// viewing lives at /scenario-molecules; this is the managed copy.
export function AdminTeamsManager({ teams, deck }: { teams: Team[]; deck: Card[] }) {
  const router = useRouter();
  const byId = useMemo(() => new Map(deck.map((c) => [c.id, c])), [deck]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const submittedCount = useMemo(
    () => teams.filter((t) => t.status === "Submitted").length,
    [teams]
  );
  const draftingCount = teams.length - submittedCount;

  const filtered = useMemo(() => {
    if (filter === "submitted") return teams.filter((t) => t.status === "Submitted");
    if (filter === "drafting") return teams.filter((t) => t.status !== "Submitted");
    return teams;
  }, [teams, filter]);

  // The export group: explicitly selected entries, or — if none are picked —
  // whatever the current filter is showing.
  const exportList = useMemo(() => {
    const chosen = teams.filter((t) => selected.has(t.id));
    return chosen.length ? chosen : filtered;
  }, [teams, selected, filtered]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((t) => next.add(t.id));
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  // A flattened export record — resolves the triad card ids to their titles.
  function record(t: Team) {
    const cards = teamTriadIds(t)
      .map((id) => byId.get(id))
      .filter((c): c is Card => Boolean(c))
      .map((c) => ({ title: c.title, role: c.role, dimension: c.dimension, condition: c.condition }));
    return {
      code: t.code,
      name: t.name,
      worldTitle: t.worldTitle,
      status: t.status,
      convergence: t.convergence,
      primaryCondition: t.primaryCondition,
      definingCharacteristics: t.definingCharacteristics,
      centralTension: t.centralTension,
      newNormal: t.newNormal,
      brokenAssumption: t.brokenAssumption,
      worldDescription: t.worldDescription,
      createdTime: t.createdTime,
      cards,
    };
  }

  function exportJson() {
    const data = exportList.map(record);
    download(JSON.stringify(data, null, 2), fileName("json"), "application/json");
  }

  function exportCsv() {
    const cols = [
      "code", "name", "worldTitle", "status",
      "card1", "card2", "card3",
      "convergence", "primaryCondition", "definingCharacteristics",
      "centralTension", "newNormal", "brokenAssumption",
      "worldDescription", "createdTime",
    ];
    const lines = [cols.join(",")];
    for (const t of exportList) {
      const r = record(t);
      const titles = r.cards.map((c) => c.title);
      lines.push(
        [
          r.code, r.name, r.worldTitle, r.status,
          titles[0] ?? "", titles[1] ?? "", titles[2] ?? "",
          r.convergence, r.primaryCondition, r.definingCharacteristics,
          r.centralTension, r.newNormal, r.brokenAssumption,
          r.worldDescription, r.createdTime,
        ]
          .map(csvCell)
          .join(",")
      );
    }
    // Prepend a BOM so Excel reads it as UTF-8.
    download("﻿" + lines.join("\r\n"), fileName("csv"), "text/csv;charset=utf-8;");
  }

  async function remove(team: Team) {
    if (!confirm(`Delete entry "${team.worldTitle || team.name || "Untitled"}" (${team.code})? This can't be undone.`))
      return;
    setBusyId(team.id);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${team.code}/teams/${team.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete entry");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  if (teams.length === 0) {
    return <p className="mt-6 text-[14px] text-muted">No entries have been built yet.</p>;
  }

  return (
    <>
      {/* Status filter */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
          All · {teams.length}
        </FilterPill>
        <FilterPill active={filter === "submitted"} onClick={() => setFilter("submitted")}>
          Submitted · {submittedCount}
        </FilterPill>
        <FilterPill active={filter === "drafting"} onClick={() => setFilter("drafting")}>
          Drafting · {draftingCount}
        </FilterPill>
      </div>

      {/* Group + export bar */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[3px] border border-[var(--hairline)] bg-card px-4 py-3">
        <span className="text-[12px] font-semibold">
          {selected.size > 0
            ? `${selected.size} in export group`
            : `${filtered.length} shown (no selection — export uses all shown)`}
        </span>
        <button
          onClick={selectAllFiltered}
          className="text-[11px] font-bold uppercase tracking-[0.06em] text-blue hover:underline"
        >
          Select all shown
        </button>
        {selected.size > 0 && (
          <button
            onClick={clearSelection}
            className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted hover:underline"
          >
            Clear group
          </button>
        )}
        <span className="grow" />
        <button
          onClick={exportCsv}
          disabled={exportList.length === 0}
          className="rounded-[2px] border border-ink bg-lime px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-lime-deep disabled:opacity-50"
        >
          Export CSV ({exportList.length})
        </button>
        <button
          onClick={exportJson}
          disabled={exportList.length === 0}
          className="rounded-[2px] border border-ink bg-paper px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-lime disabled:opacity-50"
        >
          Export JSON ({exportList.length})
        </button>
      </div>

      {error && <div className="mt-4 text-[13px] font-semibold text-coral">{error}</div>}

      {filtered.length === 0 ? (
        <p className="mt-6 text-[14px] text-muted">No entries match this filter.</p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => {
            const triad = teamTriadIds(t)
              .map((id) => byId.get(id))
              .filter((c): c is Card => Boolean(c));
            const submitted = t.status === "Submitted";
            const isSelected = selected.has(t.id);
            return (
              <div
                key={t.id}
                className={
                  "flex flex-col rounded-[3px] border bg-card p-4 " +
                  (isSelected ? "border-ink ring-2 ring-ink ring-offset-1 ring-offset-paper" : "border-[var(--hairline)]")
                }
                style={{ borderTop: `4px solid ${t.color}` }}
              >
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(t.id)}
                      className="h-4 w-4 accent-[var(--ink)]"
                    />
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-[2px] border border-ink"
                      style={{ background: t.color }}
                    />
                    <span className="text-[14px] font-extrabold">{t.name || "Entry"}</span>
                  </label>
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
      )}
    </>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-[2px] border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] transition-colors " +
        (active ? "border-ink bg-ink text-paper" : "border-[var(--hairline)] bg-card text-muted hover:border-ink")
      }
    >
      {children}
    </button>
  );
}

// ---------- export helpers ----------
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fileName(ext: string): string {
  const d = new Date().toISOString().slice(0, 10);
  return `foresight-entries-${d}.${ext}`;
}

function download(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
