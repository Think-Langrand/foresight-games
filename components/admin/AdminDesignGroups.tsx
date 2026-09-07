"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EXERCISE_TYPES,
  exerciseStatus,
  getExerciseType,
  newSectionKey,
  supportsSections,
  type ExerciseStatus,
  type WorksheetSection,
} from "@/lib/exercise-types";
import type {
  ProgramDTO,
  ProgramWeekDTO,
  ProgramGroupDTO,
} from "@/lib/design-program-shape";
import { ExerciseQuestionEditor } from "@/components/admin/ExerciseQuestionEditor";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { AdminTemplate } from "@/components/admin/AdminTemplates";

export interface AdminScenarioOption {
  id: string;
  title: string;
  headline: string;
}

// A program week held in local editor state — the DTO plus a stable client key so React
// keys survive a reorder. `slots` carries each group's row id (the board-safe identity).
interface WeekDraft extends ProgramWeekDTO {
  key: string;
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

// The questions a week actually shows: its own snapshot, or the type's code template when
// it was never customized. Seeds the editor and the "save as template" capture.
function effectiveSections(w: { sections: WorksheetSection[]; type: string }): WorksheetSection[] {
  return w.sections.length > 0 ? w.sections : getExerciseType(w.type)?.sections ?? [];
}

// Total answers a week has collected across all groups. A "started" week (> 0) locks its
// questions + type behind an explicit "Edit anyway" so answers aren't orphaned by accident.
function weekCardTotal(w: { cardsByGroup: Record<string, number> }): number {
  return Object.values(w.cardsByGroup).reduce((n, c) => n + (c ?? 0), 0);
}

// Give each week a stable client key. Derive it from the slot ids deterministically (the
// lexicographically smallest), so it's invariant under group reorder/refresh — using
// Object.values()[0] would depend on insertion order and remount rows (losing open editors,
// forcedKeys, etc.) whenever group order changed. New weeks (no slots) get a fresh id.
function withKey(w: ProgramWeekDTO): WeekDraft {
  const ids = Object.values(w.slots);
  return { ...w, key: ids.length ? [...ids].sort()[0] : newSectionKey() };
}

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
  initialProgram,
  scenarios,
  configured,
}: {
  projectId: string;
  slug: string;
  initialProgram: ProgramDTO;
  scenarios: AdminScenarioOption[];
  configured: boolean;
}) {
  const router = useRouter();
  const [weeks, setWeeks] = useState<WeekDraft[]>(() => initialProgram.weeks.map(withKey));
  const [groups, setGroups] = useState<ProgramGroupDTO[]>(initialProgram.groups);
  const [divergent, setDivergent] = useState(initialProgram.divergent);
  const [version, setVersion] = useState(initialProgram.version); // optimistic-concurrency token
  const [dirty, setDirty] = useState(false);

  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false); // program save in flight
  const [groupBusyId, setGroupBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null); // week whose questions are open
  const [forcedKeys, setForcedKeys] = useState<Set<string>>(new Set()); // started weeks the admin unlocked for editing
  const [addingWeek, setAddingWeek] = useState(false);
  const [templates, setTemplates] = useState<AdminTemplate[] | null>(null); // lazy
  const [pendingDelete, setPendingDelete] = useState<
    { kind: "group"; group: ProgramGroupDTO } | { kind: "week"; week: WeekDraft } | null
  >(null);

  const base = `/api/admin/projects/${projectId}/design-groups`;
  const [now] = useState(() => Date.now());

  // ----- program refresh (after a group op that reshapes the fan-out) -----
  async function refreshProgram() {
    const res = await api(`/api/admin/projects/${projectId}/program`, "GET");
    if (res._ok) {
      setWeeks(((res.weeks as ProgramWeekDTO[]) ?? []).map(withKey));
      setGroups((res.groups as ProgramGroupDTO[]) ?? []);
      setDivergent(res.divergent === true);
      setVersion((res.version as string) ?? "");
      setForcedKeys(new Set());
      setDirty(false);
    }
  }

  // ----- local program edits (persist together via "Save program") -----
  const patchWeek = (key: string, patch: Partial<WeekDraft>) => {
    setWeeks((prev) => prev.map((w) => (w.key === key ? { ...w, ...patch } : w)));
    setDirty(true);
  };
  const moveWeek = (i: number, dir: -1 | 1) => {
    setWeeks((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  };
  const addWeek = (tpl: { type: string; sections: WorksheetSection[]; title?: string }) => {
    setAddingWeek(false);
    setWeeks((prev) => [
      ...prev,
      {
        key: newSectionKey(),
        title: tpl.title || `Session ${prev.length + 1}`,
        type: tpl.type,
        opensAt: null,
        locked: false,
        sections: tpl.sections,
        slots: {},
        cardsByGroup: {},
        sessionByGroup: {},
      },
    ]);
    setDirty(true);
  };
  const removeWeek = (key: string) => {
    setWeeks((prev) => prev.filter((w) => w.key !== key));
    if (editingKey === key) setEditingKey(null);
    setDirty(true);
  };

  // Unlock a started week for destructive editing (questions/type), discarding answers tied
  // to removed/renamed questions. Explicit and per-week — the default is to protect answers.
  function unlockWeek(w: WeekDraft) {
    const total = weekCardTotal(w);
    if (
      confirm(
        `"${w.title}" already has ${total} answer${total === 1 ? "" : "s"} across started groups.\n\n` +
          `Editing its questions or type can permanently discard answers tied to a removed or renamed question. Edit anyway?`
      )
    ) {
      setForcedKeys((prev) => new Set(prev).add(w.key));
      if (supportsSections(w.type)) setEditingKey(w.key);
    }
  }
  function relockWeek(key: string) {
    setForcedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    if (editingKey === key) setEditingKey(null);
  }

  async function saveProgram(forceAll = false) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        version,
        weeks: weeks.map((w) => ({
          title: w.title,
          type: w.type,
          opensAt: w.opensAt,
          locked: w.locked,
          sections: w.sections,
          slots: w.slots,
          force: forceAll || forcedKeys.has(w.key),
        })),
      };
      const res = await api(`/api/admin/projects/${projectId}/program`, "PUT", payload);
      // Another admin changed the program since we loaded it: reload the latest so we don't
      // clobber their edit. (Local changes are discarded — reapply on the fresh program.)
      if (res._status === 409 && res.conflict) {
        await refreshProgram();
        setError((res.error as string) || "This program was changed by someone else — reloaded the latest.");
        return;
      }
      // A started week would be edited destructively without a per-week unlock (e.g. aligning
      // a divergent started group). Confirm once, then re-save discarding the affected answers.
      if (res._status === 409 && res.needsConfirm) {
        if (confirm((res.error as string) || "Some weeks have answers. Save anyway?")) {
          return await saveProgram(true);
        }
        return;
      }
      if (!res._ok) throw new Error((res.error as string) || "Failed to save program");
      const program = res.program as ProgramDTO;
      setWeeks(program.weeks.map(withKey));
      setGroups(program.groups);
      setDivergent(program.divergent);
      setVersion(program.version);
      setDirty(false);
      setEditingKey(null);
      setForcedKeys(new Set());
      setNotice(`Program saved to all ${program.groups.length} group${program.groups.length === 1 ? "" : "s"}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save program");
    } finally {
      setBusy(false);
    }
  }

  // Capture a week's current blocks into the global template library.
  async function saveAsTemplate(w: WeekDraft) {
    const name = window.prompt("Save this week to the template library as…", w.title)?.trim();
    if (!name) return;
    setError(null);
    setNotice(null);
    try {
      const res = await api(`/api/admin/templates`, "POST", {
        name,
        type: w.type,
        sections: effectiveSections(w),
      });
      if (!res._ok) throw new Error((res.error as string) || "Failed to save template");
      setTemplates((prev) => (prev ? [...prev, res.template as AdminTemplate] : prev));
      setNotice(`Saved "${name}" to the template library.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save template");
    }
  }

  async function openAddMenu() {
    setAddingWeek(true);
    if (templates === null) {
      try {
        const res = await api(`/api/admin/templates`, "GET");
        setTemplates(res._ok ? ((res.templates as AdminTemplate[]) ?? []) : []);
      } catch {
        setTemplates([]);
      }
    }
  }

  // ----- group ops (persist immediately via the existing endpoints) -----
  const runGroup = async (id: string, fn: () => Promise<void>) => {
    setGroupBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setGroupBusyId(null);
    }
  };
  const setGroup = (id: string, patch: Partial<ProgramGroupDTO>) =>
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  async function saveGroupName(g: ProgramGroupDTO) {
    await runGroup(g.id, async () => {
      const res = await api(`${base}/${g.id}`, "PATCH", { name: g.name });
      if (!res._ok) throw new Error((res.error as string) || "Failed to rename group");
    });
  }

  async function assignScenario(g: ProgramGroupDTO, scenarioRef: string) {
    if (!scenarioRef) return;
    await runGroup(g.id, async () => {
      const send = (force: boolean) =>
        api(`${base}/${g.id}`, "PATCH", force ? { scenarioRef, force: true } : { scenarioRef });
      let res = await send(false);
      if (res._status === 409 && res.needsConfirm) {
        if (!confirm((res.error as string) || "Reassigning changes the premise under existing work. Continue?"))
          return;
        res = await send(true);
      }
      if (!res._ok) throw new Error((res.error as string) || "Failed to assign scenario");
      // Assigning may seed this group's program and provision boards → slots change.
      await refreshProgram();
      router.refresh();
    });
  }

  async function moveGroup(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= groups.length) return;
    const next = [...groups];
    [next[i], next[j]] = [next[j], next[i]];
    setGroups(next.map((g, idx) => ({ ...g, sort: idx })));
    await runGroup("reorder", async () => {
      const r1 = await api(`${base}/${next[i].id}`, "PATCH", { sort: i });
      const r2 = await api(`${base}/${next[j].id}`, "PATCH", { sort: j });
      if (!r1._ok || !r2._ok) {
        // api() never throws, so check explicitly — otherwise a failed PATCH would look
        // successful and the optimistic local order would drift from the server.
        await refreshProgram();
        throw new Error((r1.error as string) || (r2.error as string) || "Failed to reorder groups");
      }
    });
  }

  async function removeGroup(g: ProgramGroupDTO) {
    await runGroup(g.id, async () => {
      const res = await api(`${base}/${g.id}`, "DELETE");
      if (!res._ok) throw new Error((res.error as string) || "Failed to delete group");
      await refreshProgram();
    });
  }

  async function addGroup() {
    const name = newName.trim();
    if (!name) return;
    await runGroup("new", async () => {
      const res = await api(base, "POST", { name });
      if (!res._ok) throw new Error((res.error as string) || "Failed to create group");
      setNewName("");
      // Bring the new (scenario-less) group into lockstep with the current program. Reuse
      // saveProgram so the started-week 409/confirm + refresh flow is applied consistently
      // (a divergent, already-started project can otherwise 409 here). No program yet →
      // just refresh so the new empty group shows.
      if (weeks.length > 0) await saveProgram();
      else await refreshProgram();
    });
  }

  const anyScenario = groups.some((g) => g.scenarioRef);

  return (
    <div className="mt-3">
      {!configured && (
        <p className="mb-3 rounded-[3px] border border-coral bg-card px-4 py-3 text-[13px] text-muted">
          The scenario platform isn&rsquo;t configured, so no scenarios can be assigned yet.
        </p>
      )}
      {error && <p className="mb-3 text-[13px] font-semibold text-coral">{error}</p>}
      {notice && <p className="mb-3 text-[13px] font-semibold text-lime-deep">{notice}</p>}

      {/* ============================ PROGRAM ============================ */}
      <div className="rounded-[3px] border border-[var(--hairline)] bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="eyebrow ink">Program · shared by every group</span>
          <span className="text-[11px] text-muted">
            Edited once; applies to all {groups.length} group{groups.length === 1 ? "" : "s"}. Only the scenario differs.
          </span>
        </div>

        {divergent && (
          <p className="mt-3 rounded-[2px] border border-amber bg-paper px-3 py-2 text-[12px] text-ink">
            These groups aren&rsquo;t in sync yet. Saving the program will align every group to the list below.
          </p>
        )}

        {weeks.length === 0 ? (
          <p className="mt-3 text-[12px] italic text-muted">
            No program yet. Assign a scenario to a group below to seed the default program, or add a week here.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-muted">
                  <th className="py-1 pr-2"></th>
                  <th className="py-1 pr-2">Session</th>
                  <th className="py-1 pr-2">Type</th>
                  <th className="py-1 pr-2">Opens</th>
                  <th className="py-1 pr-2">Lock</th>
                  <th className="py-1 pr-2">Status</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w, i) => {
                  const anySession = Object.values(w.sessionByGroup).some(Boolean);
                  const st = exerciseStatus(
                    { type: w.type, sessionCode: anySession ? "x" : null, locked: w.locked, opensAt: w.opensAt },
                    now
                  );
                  const cardTotal = weekCardTotal(w);
                  const started = cardTotal > 0;
                  const forced = forcedKeys.has(w.key);
                  const qLocked = started && !forced; // questions + type protected until unlocked
                  return (
                    <Fragment key={w.key}>
                      <tr className="border-t border-[var(--hairline)] align-top">
                        <td className="py-1.5 pr-2">
                          <div className="flex flex-col">
                            <button
                              className={btn + " !px-2 !py-0.5"}
                              disabled={i === 0 || busy}
                              onClick={() => moveWeek(i, -1)}
                              aria-label="Move up"
                            >
                              ↑
                            </button>
                            <button
                              className={btn + " mt-0.5 !px-2 !py-0.5"}
                              disabled={i === weeks.length - 1 || busy}
                              onClick={() => moveWeek(i, 1)}
                              aria-label="Move down"
                            >
                              ↓
                            </button>
                          </div>
                        </td>
                        <td className="py-1.5 pr-2">
                          <div className="flex items-center gap-1.5">
                            <input
                              value={w.title}
                              onChange={(e) => patchWeek(w.key, { title: e.target.value })}
                              className={inputCls + " w-[200px]"}
                            />
                            {started && (
                              <span
                                title={`${cardTotal} answer${cardTotal === 1 ? "" : "s"} already collected`}
                                className={
                                  "whitespace-nowrap rounded-[2px] px-1.5 py-0.5 text-[10px] font-bold " +
                                  (forced ? "bg-coral text-white" : "bg-[var(--hairline)] text-muted")
                                }
                              >
                                {forced ? `⚠ ${cardTotal}` : `🔒 ${cardTotal}`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-1.5 pr-2">
                          <select
                            value={w.type}
                            disabled={busy || qLocked}
                            title={qLocked ? "Has answers — use “Edit anyway” to change the type" : undefined}
                            onChange={(e) => patchWeek(w.key, { type: e.target.value })}
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
                            value={toDateInput(w.opensAt)}
                            onChange={(e) => patchWeek(w.key, { opensAt: fromDateInput(e.target.value) })}
                            className={inputCls}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <button
                            onClick={() => patchWeek(w.key, { locked: !w.locked })}
                            className={"sq-toggle" + (w.locked ? " on" : "")}
                            role="switch"
                            aria-checked={w.locked}
                            aria-label={w.locked ? "Locked" : "Unlocked"}
                          >
                            <span className="knob" />
                          </button>
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
                        <td className="py-1.5">
                          <div className="flex items-center justify-end gap-2">
                            {supportsSections(w.type) &&
                              (qLocked ? (
                                <button
                                  onClick={() => unlockWeek(w)}
                                  disabled={busy}
                                  title="This week has answers — editing its questions may discard some"
                                  className={btn + " border-amber text-amber"}
                                >
                                  Edit anyway
                                </button>
                              ) : (
                                <button
                                  onClick={() => setEditingKey((v) => (v === w.key ? null : w.key))}
                                  disabled={busy}
                                  className={btn + (editingKey === w.key ? " bg-lime" : " bg-paper")}
                                >
                                  {editingKey === w.key ? "Close" : "Edit Qs"}
                                </button>
                              ))}
                            {started && forced && (
                              <button
                                onClick={() => relockWeek(w.key)}
                                disabled={busy}
                                title="Re-protect this week's answers"
                                className={btn + " bg-paper"}
                              >
                                Re-lock
                              </button>
                            )}
                            {supportsSections(w.type) && (
                              <button
                                onClick={() => saveAsTemplate(w)}
                                disabled={busy}
                                title="Save this week's blocks to the template library"
                                className={btn + " bg-paper"}
                              >
                                Save as tmpl
                              </button>
                            )}
                            <button
                              onClick={() => setPendingDelete({ kind: "week", week: w })}
                              disabled={busy || weeks.length === 1}
                              aria-label="Delete week"
                              title={
                                weeks.length === 1
                                  ? "A program needs at least one week — delete the group instead"
                                  : "Delete week"
                              }
                              className={btn + " border-coral text-coral"}
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Per-group boards/answers for this week — read straight off slots. */}
                      <tr className="border-t border-dashed border-[var(--hairline)]">
                        <td></td>
                        <td colSpan={6} className="py-1 pb-2">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                            {groups.length === 0 && <span className="italic">No groups yet.</span>}
                            {groups.map((g) => {
                              const exId = w.slots[g.id];
                              const code = w.sessionByGroup[g.id];
                              const cards = w.cardsByGroup[g.id] ?? 0;
                              return (
                                <span key={g.id} className="inline-flex items-center gap-1.5">
                                  <span
                                    className="inline-block h-2.5 w-2.5 rounded-[2px] border border-ink"
                                    style={{ background: g.color ?? "#ccc" }}
                                  />
                                  <span className="font-semibold text-ink">{g.name}</span>
                                  {exId && code ? (
                                    <Link
                                      href={`/project/${slug}/design-groups/${g.id}/${exId}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-blue underline hover:text-ink"
                                    >
                                      board
                                    </Link>
                                  ) : (
                                    <span className="italic">no board</span>
                                  )}
                                  {exId && (
                                    <Link
                                      href={`/admin/projects/${slug}/design-groups/${g.id}/answers?exercise=${exId}`}
                                      className="text-blue underline hover:text-ink"
                                    >
                                      answers
                                    </Link>
                                  )}
                                  <span className="tabular-nums">· {cards}</span>
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      </tr>

                      {editingKey === w.key && (
                        <tr className="border-t border-[var(--hairline)]">
                          <td colSpan={7} className="py-2">
                            <ExerciseQuestionEditor
                              initial={effectiveSections(w)}
                              busy={busy}
                              onSave={(sections) => {
                                patchWeek(w.key, { sections });
                                setEditingKey(null);
                              }}
                              onCancel={() => setEditingKey(null)}
                            />
                            <p className="mt-1 text-[11px] italic text-muted">
                              Questions apply when you click <span className="font-semibold">Save program</span>.
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {addingWeek ? (
            <div className="w-full rounded-[2px] border border-[var(--hairline)] bg-paper p-2">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                Start new week from…
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button className={btn + " bg-paper"} disabled={busy} onClick={() => addWeek({ type: "worksheet", sections: [] })}>
                  Blank worksheet
                </button>
                {templates === null ? (
                  <span className="text-[11px] italic text-muted">Loading templates…</span>
                ) : (
                  templates.map((t) => (
                    <button
                      key={t.id}
                      className={btn + " bg-paper"}
                      disabled={busy}
                      title={t.description || undefined}
                      onClick={() => addWeek({ type: t.type, sections: t.sections, title: t.name })}
                    >
                      {t.name}
                    </button>
                  ))
                )}
                <button className={btn + " bg-paper"} disabled={busy} onClick={() => addWeek({ type: "placeholder", sections: [] })}>
                  Placeholder
                </button>
                <button className={btn + " ml-auto border-coral text-coral"} onClick={() => setAddingWeek(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={openAddMenu} disabled={busy} className={btn + " bg-paper"}>
              + Add week
            </button>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3 border-t border-[var(--hairline)] pt-3">
          <button
            onClick={() => saveProgram()}
            disabled={busy || !dirty}
            className={btn + " bg-lime hover:bg-lime-deep"}
          >
            {busy ? "Saving…" : "Save program"}
          </button>
          {dirty && <span className="text-[11px] text-muted">Unsaved changes</span>}
        </div>
      </div>

      {/* ============================ GROUPS ============================ */}
      <div className="mt-6 rounded-[3px] border border-[var(--hairline)] bg-card p-4">
        <span className="eyebrow ink">Groups · scenario per group</span>
        <div className="mt-3 flex flex-col gap-2">
          {groups.map((g, i) => {
            const gBusy = groupBusyId === g.id || groupBusyId === "reorder";
            return (
              <div
                key={g.id}
                className="flex flex-wrap items-center gap-3 rounded-[2px] border border-[var(--hairline)] bg-paper p-2.5"
              >
                <div className="flex flex-col">
                  <button
                    className={btn + " !px-2 !py-0.5"}
                    disabled={i === 0 || gBusy}
                    onClick={() => moveGroup(i, -1)}
                    aria-label="Move group up"
                  >
                    ↑
                  </button>
                  <button
                    className={btn + " mt-0.5 !px-2 !py-0.5"}
                    disabled={i === groups.length - 1 || gBusy}
                    onClick={() => moveGroup(i, 1)}
                    aria-label="Move group down"
                  >
                    ↓
                  </button>
                </div>
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
                    disabled={gBusy || !configured || scenarios.length === 0}
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
                  onClick={() => setPendingDelete({ kind: "group", group: g })}
                  disabled={gBusy}
                  aria-label="Delete group"
                  title="Delete group"
                  className={btn + (g.scenarioRef ? "" : " ml-auto") + " border-coral text-coral hover:bg-coral hover:text-white"}
                >
                  🗑
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGroup()}
            placeholder="New group name (e.g. Group A)"
            className={inputCls + " max-w-[280px]"}
          />
          <button
            onClick={addGroup}
            disabled={groupBusyId === "new" || !newName.trim()}
            className={btn + " bg-lime hover:bg-lime-deep"}
          >
            Add group
          </button>
        </div>
        {!anyScenario && groups.length > 0 && (
          <p className="mt-2 text-[11px] italic text-muted">
            Assign a scenario to a group to provision its boards. Program structure is shared regardless.
          </p>
        )}
      </div>

      <ConfirmModal
        open={pendingDelete !== null}
        busy={busy || groupBusyId !== null}
        title={pendingDelete?.kind === "group" ? "Delete group" : "Delete week"}
        message={
          pendingDelete?.kind === "group" ? (
            <>
              Delete <strong>{pendingDelete.group.name}</strong> and its exercises? Backing boards are left intact.
            </>
          ) : pendingDelete?.kind === "week" ? (
            <>
              Remove <strong>{pendingDelete.week.title}</strong> from the program for every group? Saving will delete
              the week; any answers already built are kept in the database.
            </>
          ) : (
            ""
          )
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const p = pendingDelete;
          setPendingDelete(null);
          if (!p) return;
          if (p.kind === "group") await removeGroup(p.group);
          else removeWeek(p.week.key);
        }}
      />
    </div>
  );
}
