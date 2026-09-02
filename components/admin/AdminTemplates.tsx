"use client";

import { useState } from "react";
import { EXERCISE_TYPES, getExerciseType, type WorksheetSection } from "@/lib/exercise-types";
import { ExerciseQuestionEditor } from "@/components/admin/ExerciseQuestionEditor";
import { ConfirmModal } from "@/components/ConfirmModal";

// Client shape of an exercise_templates row (see lib/exercise-templates.ts). Also imported
// by AdminDesignGroups to type the templates it lists in the "Add week" menu.
export interface AdminTemplate {
  id: string;
  slug: string | null;
  name: string;
  description: string;
  type: string;
  sections: WorksheetSection[];
  sort: number;
}

const inputCls =
  "rounded-[2px] border border-[var(--rule)] bg-paper px-2 py-1.5 text-[13px] focus:border-ink focus:outline-none";
const btn =
  "rounded-[2px] border border-ink px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] disabled:opacity-40";

const TYPE_OPTIONS = Object.values(EXERCISE_TYPES).map((t) => ({ id: t.id, label: t.label }));
const isWorksheet = (type: string) => getExerciseType(type)?.render === "worksheet";

async function api(url: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ...(json as object), _status: res.status, _ok: res.ok };
}

export function AdminTemplates({ initialTemplates }: { initialTemplates: AdminTemplate[] }) {
  const [templates, setTemplates] = useState<AdminTemplate[]>(initialTemplates);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("worksheet");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); // template whose blocks are open
  const [pendingDelete, setPendingDelete] = useState<AdminTemplate | null>(null);
  const base = "/api/admin/templates";

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };
  const setT = (id: string, patch: Partial<AdminTemplate>) =>
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  async function addTemplate() {
    const name = newName.trim();
    if (!name) return;
    await run("new", async () => {
      const res = await api(base, "POST", { name, type: newType });
      if (!res._ok) throw new Error((res.error as string) || "Failed");
      setTemplates((prev) => [...prev, res.template as AdminTemplate]);
      setNewName("");
      setNewType("worksheet");
    });
  }

  // name/description/type are saved on blur/change; sections have their own Save button.
  async function saveMeta(t: AdminTemplate) {
    await run(t.id, async () => {
      const res = await api(`${base}/${t.id}`, "PATCH", {
        name: t.name,
        description: t.description,
        type: t.type,
      });
      if (!res._ok) throw new Error((res.error as string) || "Failed to save template");
    });
  }

  async function saveSections(t: AdminTemplate, sections: WorksheetSection[]) {
    await run(t.id, async () => {
      const res = await api(`${base}/${t.id}`, "PATCH", { sections });
      if (!res._ok) throw new Error((res.error as string) || "Failed to save blocks");
      setT(t.id, { sections });
      setEditingId(null);
    });
  }

  async function removeTemplate(t: AdminTemplate) {
    await run(t.id, async () => {
      const res = await api(`${base}/${t.id}`, "DELETE");
      if (!res._ok) throw new Error((res.error as string) || "Failed to delete template");
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    });
  }

  return (
    <div className="mt-6">
      {error && <p className="mb-3 text-[13px] font-semibold text-coral">{error}</p>}

      <div className="flex flex-col gap-4">
        {templates.map((t) => {
          const busy = busyId === t.id;
          return (
            <article key={t.id} className="rounded-[3px] border border-[var(--hairline)] bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={t.name}
                  onChange={(e) => setT(t.id, { name: e.target.value })}
                  onBlur={() => saveMeta(t)}
                  className={inputCls + " max-w-[240px] font-bold"}
                />
                <select
                  value={t.type}
                  disabled={busy}
                  onChange={(e) => {
                    setT(t.id, { type: e.target.value });
                    void api(`${base}/${t.id}`, "PATCH", { type: e.target.value });
                  }}
                  className={inputCls}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="text-[12px] text-muted">
                  {isWorksheet(t.type)
                    ? `${t.sections.length} block${t.sections.length === 1 ? "" : "s"}`
                    : "no blocks"}
                </span>
                {isWorksheet(t.type) && (
                  <button
                    onClick={() => setEditingId((v) => (v === t.id ? null : t.id))}
                    disabled={busy}
                    className={btn + (editingId === t.id ? " bg-lime" : " bg-paper")}
                  >
                    {editingId === t.id ? "Close" : "Edit blocks"}
                  </button>
                )}
                <button
                  onClick={() => setPendingDelete(t)}
                  disabled={busy}
                  aria-label="Delete template"
                  title="Delete template"
                  className={btn + " ml-auto border-coral text-coral"}
                >
                  🗑
                </button>
              </div>
              <textarea
                value={t.description}
                onChange={(e) => setT(t.id, { description: e.target.value })}
                onBlur={() => saveMeta(t)}
                placeholder="Description (optional)"
                rows={2}
                className={inputCls + " mt-2 w-full resize-none"}
              />
              {editingId === t.id && isWorksheet(t.type) && (
                <div className="mt-3">
                  <ExerciseQuestionEditor
                    initial={t.sections}
                    busy={busy}
                    onSave={(sections) => saveSections(t, sections)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTemplate()}
          placeholder="New template name (e.g. Session 3 · Synthesis)"
          className={inputCls + " max-w-[320px]"}
        />
        <select value={newType} onChange={(e) => setNewType(e.target.value)} className={inputCls}>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          onClick={addTemplate}
          disabled={busyId === "new" || !newName.trim()}
          className={btn + " bg-lime hover:bg-lime-deep"}
        >
          Add template
        </button>
      </div>

      <ConfirmModal
        open={pendingDelete !== null}
        busy={pendingDelete ? busyId === pendingDelete.id : false}
        title="Delete template"
        message={
          pendingDelete ? (
            <>
              Delete <strong>{pendingDelete.name}</strong>? Groups already built from it keep their
              copy — only the library entry is removed.
            </>
          ) : (
            ""
          )
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const t = pendingDelete;
          if (!t) return;
          await removeTemplate(t);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
