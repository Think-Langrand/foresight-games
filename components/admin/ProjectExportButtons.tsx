"use client";

import { useState } from "react";
import { csvCell, download } from "@/components/admin/exportUtils";
import { CROSS_GROUP_CSV_HEADER, crossGroupCsvRows } from "@/lib/cohort-export-shape";
import type { ProjectExport } from "@/lib/cohort-export-shape";

// Export every design group's every week for one project, as one JSON file or one sheet.
//
// The per-group export (AdminGroupAnswers) produces one file per group, so comparing four
// groups meant opening four files and trusting that week 3 in one is week 3 in another.
// This resolves the week alignment server-side and says, per row, which group it came from.
//
// Each click re-fetches. An export is a record of what is on the boards now, and a cached
// payload from ten minutes ago is a quietly wrong record — worse than a second wait.

const btn =
  "rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime disabled:opacity-40";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}

export function ProjectExportButtons({ projectId, slug }: { projectId: string; slug: string }) {
  const [busy, setBusy] = useState<null | "json" | "csv">(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "json" | "csv") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/export`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Export failed (${res.status}).`);
      }
      const payload = (await res.json()) as ProjectExport;
      const base = `all-groups-${slugify(slug)}-${new Date().toISOString().slice(0, 10)}`;
      if (kind === "json") {
        download(JSON.stringify(payload, null, 2), `${base}.json`, "application/json");
      } else {
        const lines = [CROSS_GROUP_CSV_HEADER.map(csvCell).join(",")];
        for (const row of crossGroupCsvRows(payload)) lines.push(row.map(csvCell).join(","));
        // The BOM is what makes Excel read the UTF-8 — same as every other CSV here.
        download("﻿" + lines.join("\r\n"), `${base}.csv`, "text/csv;charset=utf-8;");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed — please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" className={btn} disabled={busy !== null} onClick={() => run("json")}>
        {busy === "json" ? "Exporting…" : "All groups · JSON"}
      </button>
      <button type="button" className={btn} disabled={busy !== null} onClick={() => run("csv")}>
        {busy === "csv" ? "Exporting…" : "All groups · CSV"}
      </button>
      {error ? <span className="text-[11px] font-semibold text-coral">{error}</span> : null}
    </span>
  );
}
