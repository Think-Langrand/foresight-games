"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EXERCISE_TYPES,
  exerciseStatus,
  getExerciseType,
  type ExerciseStatus,
  type WorksheetSection,
} from "@/lib/exercise-types";
import { ExerciseQuestionEditor } from "@/components/admin/ExerciseQuestionEditor";
import { ConfirmModal } from "@/components/ConfirmModal";

export interface AdminExercise {
  id: string;
  sort: number;
  title: string;
  type: string;
  sessionCode: string | null;
  locked: boolean;
  opensAt: string | null;
  sections: WorksheetSection[];
  cards: number;
}

export interface AdminDesignGroup {
  id: string;
  name: string;
  sort: number;
  color: string | null;
  scenarioRef: string | null;
  scenarioTitle: string | null;
  exercises: AdminExercise[];
}

export interface AdminScenarioOption {
  id: string;
  title: string;
  headline: string;
}

const inputCls =
  "rounded-[2px] border border-[var(--rule)] bg-paper px-2 py-1.5 text-[13px] focus:border-ink focus:outline-none";
const btn =
  "rounded-[2px] border border-ink px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] disabled:opacity-40";

const STATUS_STYLE: Record<ExerciseStatus, string> = {
  placeholder: "bg-[var(--hairline)] text-muted",
  scheduled: "bg-amber text-ink",
  locked: "bg-blue text-white",
  open: "bg-lime text-ink",
};

const TYPE_OPTIONS = Object.values(EXERCISE_TYPES).map((t) => ({ id: t.id, label: t.label }));

// The questions an exercise actually shows: its own snapshot, or the code template when
// it was never customized. Used both to seed the editor and to "copy" a week's questions.
function effectiveSections(ex: AdminExercise): WorksheetSection[] {
  return ex.sections.length > 0 ? ex.sections : getExerciseType(ex.type)?.sections ?? [];
}

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

// ISO <-> <input type=date> (day granularity is enough for a biweekly schedule).
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const fromDateInput = (d: string) => (d ? `${d}T00:00:00.000Z` : null);

export function AdminDesignGroups({
  projectId,
  slug,
  initialGroups,
  scenarios,
  configured,
}: {
  projectId: string;
  slug: string;
  initialGroups: AdminDesignGroup[];
  scenarios: AdminScenarioOption[];
  configured: boolean;
}) {
  const router = useRouter();
  const [groups, setGroups] = useState<AdminDesignGroup[]>(initialGroups);
  const [newName, setNewName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); // exercise whose questions are open
  const [addingFor, setAddingFor] = useState<string | null>(null); // group showing the "add week" template menu
  const [pendingDelete, setPendingDelete] = useState<
    { kind: "group" | "exercise"; g: AdminDesignGroup; ex?: AdminExercise } | null
  >(null);
  const base = `/api/admin/projects/${projectId}/design-groups`;

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
  const setGroup = (id: string, patch: Partial<AdminDesignGroup>) =>
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  async function refreshExercises(groupId: string) {
    const res = await api(`${base}/${groupId}/exercises`, "GET");
    if (res._ok) setGroup(groupId, { exercises: (res.exercises as AdminExercise[]) ?? [] });
  }

  async function addGroup() {
    const name = newName.trim();
    if (!name) return;
    await run("new", async () => {
      const res = await api(base, "POST", { name });
      if (!res._ok) throw new Error((res.error as string) || "Failed");
      setGroups((prev) => [...prev, { ...(res.group as AdminDesignGroup), exercises: [] }]);
      setNewName("");
    });
  }

  async function saveGroupName(g: AdminDesignGroup) {
    await run(g.id, async () => {
      const res = await api(`${base}/${g.id}`, "PATCH", { name: g.name });
      if (!res._ok) throw new Error((res.error as string) || "Failed to rename group");
    });
  }

  async function assignScenario(g: AdminDesignGroup, scenarioRef: string) {
    if (!scenarioRef) return;
    await run(g.id, async () => {
      const send = (force: boolean) =>
        api(`${base}/${g.id}`, "PATCH", force ? { scenarioRef, force: true } : { scenarioRef });
      let res = await send(false);
      if (res._status === 409 && res.needsConfirm) {
        if (!confirm((res.error as string) || "Reassigning changes the premise under existing work. Continue?"))
          return;
        res = await send(true);
      }
      if (!res._ok) throw new Error((res.error as string) || "Failed to assign scenario");
      setGroup(g.id, res.group as AdminDesignGroup);
      await refreshExercises(g.id); // assigning seeds the program on first assign
      router.refresh();
    });
  }

  async function removeGroup(g: AdminDesignGroup) {
    await run(g.id, async () => {
      const res = await api(`${base}/${g.id}`, "DELETE");
      if (!res._ok) throw new Error((res.error as string) || "Failed to delete group");
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
    });
  }

  // ----- exercise ops -----
  async function addExercise(g: AdminDesignGroup, tpl: { type: string; sections: WorksheetSection[] }) {
    setAddingFor(null);
    await run(g.id, async () => {
      const res = await api(`${base}/${g.id}/exercises`, "POST", {
        title: `Week ${g.exercises.length + 1}`,
        type: tpl.type,
        sections: tpl.sections,
      });
      if (!res._ok) throw new Error((res.error as string) || "Failed");
      await refreshExercises(g.id);
    });
  }
  async function saveSections(g: AdminDesignGroup, ex: AdminExercise, sections: WorksheetSection[]) {
    await run(ex.id, async () => {
      const res = await api(`${base}/${g.id}/exercises/${ex.id}`, "PATCH", { sections });
      if (!res._ok) throw new Error((res.error as string) || "Failed");
      await refreshExercises(g.id);
      setEditingId(null);
    });
  }
  async function patchExercise(g: AdminDesignGroup, ex: AdminExercise, patch: Partial<AdminExercise>) {
    await run(ex.id, async () => {
      const res = await api(`${base}/${g.id}/exercises/${ex.id}`, "PATCH", patch);
      if (!res._ok) throw new Error((res.error as string) || "Failed");
      await refreshExercises(g.id);
    });
  }
  async function toggleLock(g: AdminDesignGroup, ex: AdminExercise) {
    await run(ex.id, async () => {
      const res = await api(`${base}/${g.id}/exercises/${ex.id}/lock`, "POST", {
        action: ex.locked ? "unlock" : "lock",
      });
      if (!res._ok) throw new Error((res.error as string) || "Failed");
      await refreshExercises(g.id);
    });
  }
  async function removeExercise(g: AdminDesignGroup, ex: AdminExercise) {
    await run(ex.id, async () => {
      const res = await api(`${base}/${g.id}/exercises/${ex.id}`, "DELETE");
      if (!res._ok) throw new Error((res.error as string) || "Failed to delete exercise");
      await refreshExercises(g.id);
    });
  }

  // Captured once at mount — admin status pills don't need to tick live.
  const [now] = useState(() => Date.now());

  return (
    <div className="mt-3">
      {!configured && (
        <p className="mb-3 rounded-[3px] border border-coral bg-card px-4 py-3 text-[13px] text-muted">
          The scenario platform isn&rsquo;t configured, so no scenarios can be assigned yet.
        </p>
      )}
      {error && <p className="mb-3 text-[13px] font-semibold text-coral">{error}</p>}

      <div className="flex flex-col gap-4">
        {groups.map((g) => {
          const busy = busyId === g.id;
          return (
            <article key={g.id} className="rounded-[3px] border border-[var(--hairline)] bg-card p-4">
              {/* group header */}
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="inline-block h-4 w-4 shrink-0 rounded-[2px] border border-ink"
                  style={{ background: g.color ?? "#ccc" }}
                />
                <input
                  value={g.name}
                  onChange={(e) => setGroup(g.id, { name: e.target.value })}
                  onBlur={() => saveGroupName(g)}
                  className={inputCls + " max-w-[200px]"}
                />
                <label className="flex items-center gap-1 text-[12px] text-muted">
                  Scenario
                  <select
                    value={g.scenarioRef ?? ""}
                    disabled={busy || !configured || scenarios.length === 0}
                    onChange={(e) => assignScenario(g, e.target.value)}
                    className={inputCls}
                  >
                    <option value="" disabled>
                      {scenarios.length === 0 ? "none found" : "Choose…"}
                    </option>
                    {scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </label>
                {g.scenarioRef && (
                  <Link
                    href={`/admin/projects/${slug}/design-groups/${g.id}/answers`}
                    className={btn + " ml-auto bg-paper hover:bg-lime"}
                  >
                    View answers →
                  </Link>
                )}
                <button
                  onClick={() => setPendingDelete({ kind: "group", g })}
                  disabled={busy}
                  aria-label="Delete group"
                  title="Delete group"
                  className={btn + (g.scenarioRef ? "" : " ml-auto") + " border-coral text-coral hover:bg-coral hover:text-white"}
                >
                  🗑
                </button>
              </div>

              {/* exercises */}
              {!g.scenarioRef ? (
                <p className="mt-3 text-[12px] italic text-muted">
                  Assign a scenario to seed this group&rsquo;s program of exercises.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-muted">
                        <th className="py-1 pr-2">Week</th>
                        <th className="py-1 pr-2">Type</th>
                        <th className="py-1 pr-2">Opens</th>
                        <th className="py-1 pr-2">Status</th>
                        <th className="py-1 pr-2">Cards</th>
                        <th className="py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.exercises.map((ex) => {
                        const st = exerciseStatus(ex, now);
                        const exBusy = busyId === ex.id;
                        return (
                          <Fragment key={ex.id}>
                          <tr className="border-t border-[var(--hairline)]">
                            <td className="py-1.5 pr-2">
                              <input
                                defaultValue={ex.title}
                                onBlur={(e) =>
                                  e.target.value !== ex.title && patchExercise(g, ex, { title: e.target.value })
                                }
                                className={inputCls + " w-[200px]"}
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <select
                                value={ex.type}
                                disabled={exBusy}
                                onChange={(e) => patchExercise(g, ex, { type: e.target.value })}
                                className={inputCls}
                              >
                                {TYPE_OPTIONS.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                type="date"
                                defaultValue={toDateInput(ex.opensAt)}
                                onChange={(e) => patchExercise(g, ex, { opensAt: fromDateInput(e.target.value) })}
                                className={inputCls}
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <span
                                className={
                                  "rounded-[2px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] " +
                                  STATUS_STYLE[st]
                                }
                              >
                                {st}
                              </span>
                            </td>
                            <td className="py-1.5 pr-2 text-muted">{ex.cards}</td>
                            <td className="py-1.5">
                              <div className="flex items-center justify-end gap-2">
                                {ex.sessionCode && (
                                  <Link
                                    // The exercise route dispatches by type (worksheet vs
                                    // implications); /workshop/s/[code] would always render
                                    // implications for any Ripples session.
                                    href={`/project/${slug}/design-groups/${g.id}/${ex.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-bold uppercase tracking-[0.06em] text-blue underline hover:text-ink"
                                  >
                                    Board →
                                  </Link>
                                )}
                                {isWorksheet(ex.type) && (
                                  <button
                                    onClick={() => setEditingId((v) => (v === ex.id ? null : ex.id))}
                                    disabled={exBusy}
                                    className={btn + (editingId === ex.id ? " bg-lime" : " bg-paper")}
                                  >
                                    {editingId === ex.id ? "Close" : "Edit Qs"}
                                  </button>
                                )}
                                {ex.sessionCode && (
                                  <button
                                    onClick={() => toggleLock(g, ex)}
                                    disabled={exBusy}
                                    className={btn + (ex.locked ? " bg-paper" : " bg-lime hover:bg-lime-deep")}
                                  >
                                    {ex.locked ? "Unlock" : "Lock"}
                                  </button>
                                )}
                                <button
                                  onClick={() => setPendingDelete({ kind: "exercise", g, ex })}
                                  disabled={exBusy}
                                  aria-label="Delete week"
                                  title="Delete week"
                                  className={btn + " border-coral text-coral"}
                                >
                                  🗑
                                </button>
                              </div>
                            </td>
                          </tr>
                          {editingId === ex.id && (
                            <tr className="border-t border-[var(--hairline)]">
                              <td colSpan={6} className="py-2">
                                <ExerciseQuestionEditor
                                  initial={effectiveSections(ex)}
                                  busy={exBusy}
                                  onSave={(sections) => saveSections(g, ex, sections)}
                                  onCancel={() => setEditingId(null)}
                                />
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  {addingFor === g.id ? (
                    <div className="mt-2 rounded-[2px] border border-[var(--hairline)] bg-paper p-2">
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                        Start new week from…
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          className={btn + " bg-paper"}
                          disabled={busy}
                          onClick={() => addExercise(g, { type: "worksheet", sections: [] })}
                        >
                          Blank worksheet
                        </button>
                        {Object.values(EXERCISE_TYPES)
                          .filter((t) => t.render === "worksheet" && (t.sections?.length ?? 0) > 0)
                          .map((t) => (
                            <button
                              key={t.id}
                              className={btn + " bg-paper"}
                              disabled={busy}
                              onClick={() => addExercise(g, { type: "worksheet", sections: t.sections ?? [] })}
                            >
                              Copy: {t.label}
                            </button>
                          ))}
                        {g.exercises
                          .filter((ex) => isWorksheet(ex.type) && effectiveSections(ex).length > 0)
                          .map((ex) => (
                            <button
                              key={ex.id}
                              className={btn + " bg-paper"}
                              disabled={busy}
                              onClick={() => addExercise(g, { type: "worksheet", sections: effectiveSections(ex) })}
                            >
                              Copy: {ex.title}
                            </button>
                          ))}
                        <button
                          className={btn + " bg-paper"}
                          disabled={busy}
                          onClick={() => addExercise(g, { type: "placeholder", sections: [] })}
                        >
                          Placeholder
                        </button>
                        <button className={btn + " ml-auto border-coral text-coral"} onClick={() => setAddingFor(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddingFor(g.id)} disabled={busy} className={btn + " mt-2 bg-paper"}>
                      + Add week
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addGroup()}
          placeholder="New group name (e.g. Group A)"
          className={inputCls + " max-w-[280px]"}
        />
        <button onClick={addGroup} disabled={busyId === "new" || !newName.trim()} className={btn + " bg-lime hover:bg-lime-deep"}>
          Add group
        </button>
      </div>

      <ConfirmModal
        open={pendingDelete !== null}
        busy={pendingDelete ? busyId === (pendingDelete.ex?.id ?? pendingDelete.g.id) : false}
        title={pendingDelete?.kind === "group" ? "Delete group" : "Delete week"}
        message={
          pendingDelete?.kind === "group" ? (
            <>
              Delete <strong>{pendingDelete.g.name}</strong> and its exercises? Backing boards are left intact.
            </>
          ) : pendingDelete?.ex ? (
            <>
              Delete <strong>{pendingDelete.ex.title}</strong>?
              {pendingDelete.ex.cards > 0
                ? ` Its ${pendingDelete.ex.cards} answer${pendingDelete.ex.cards === 1 ? "" : "s"} will be kept in the database.`
                : ""}
            </>
          ) : (
            ""
          )
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const p = pendingDelete;
          if (!p) return;
          if (p.kind === "group") await removeGroup(p.g);
          else if (p.ex) await removeExercise(p.g, p.ex);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
