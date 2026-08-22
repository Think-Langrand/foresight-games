"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DesignGroupStatus } from "@/lib/design-groups";

export interface AdminDesignGroup {
  id: string;
  name: string;
  sort: number;
  color: string | null;
  scenarioRef: string | null;
  scenarioTitle: string | null;
  sessionCode: string | null;
  status: DesignGroupStatus;
  implications: number;
}

export interface AdminScenarioOption {
  id: string;
  title: string;
  headline: string;
}

const inputCls =
  "w-full rounded-[2px] border border-[var(--rule)] bg-paper px-2 py-1.5 text-[13px] focus:border-ink focus:outline-none";
const btn =
  "rounded-[2px] border border-ink px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] disabled:opacity-40";

const STATUS_STYLE: Record<DesignGroupStatus, string> = {
  DRAFT: "bg-[var(--hairline)] text-muted",
  OPEN: "bg-lime text-ink",
  FINALIZED: "bg-blue text-white",
};

async function api(url: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || "Request failed");
  return json as Record<string, unknown>;
}

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
  // API is keyed by project id (route param); slug is only for the board links.
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

  const patch = (id: string, g: Partial<AdminDesignGroup>) =>
    setGroups((prev) => prev.map((x) => (x.id === id ? { ...x, ...g } : x)));

  async function addGroup() {
    const name = newName.trim();
    if (!name) return;
    await run("new", async () => {
      const { group } = (await api(base, "POST", { name })) as { group: AdminDesignGroup };
      setGroups((prev) => [...prev, { ...group, implications: 0 }]);
      setNewName("");
    });
  }

  async function saveName(g: AdminDesignGroup) {
    await run(g.id, async () => {
      await api(`${base}/${g.id}`, "PATCH", { name: g.name });
    });
  }

  async function assign(g: AdminDesignGroup, scenarioRef: string) {
    if (!scenarioRef) return;
    await run(g.id, async () => {
      const send = async (force: boolean) => {
        const res = await fetch(`${base}/${g.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(force ? { scenarioRef, force: true } : { scenarioRef }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          group?: AdminDesignGroup;
          error?: string;
          needsConfirm?: boolean;
        };
        return { res, json };
      };
      let { res, json } = await send(false);
      // 409 = would overwrite the premise under built implications; confirm & retry.
      if (res.status === 409 && json.needsConfirm) {
        if (!confirm(json.error || "Reassign will change the premise under existing work. Continue?"))
          return;
        ({ res, json } = await send(true));
      }
      if (!res.ok) throw new Error(json.error || "Failed to assign scenario");
      if (json.group) patch(g.id, json.group);
      router.refresh();
    });
  }

  async function finalize(g: AdminDesignGroup, action: "finalize" | "reopen") {
    await run(g.id, async () => {
      const { group } = (await api(`${base}/${g.id}/finalize`, "POST", { action })) as {
        group: AdminDesignGroup;
      };
      patch(g.id, group);
    });
  }

  async function remove(g: AdminDesignGroup) {
    if (!confirm(`Delete "${g.name}"? The backing map is left intact.`)) return;
    await run(g.id, async () => {
      await api(`${base}/${g.id}`, "DELETE");
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
    });
  }

  return (
    <div className="mt-3">
      {!configured && (
        <p className="mb-3 rounded-[3px] border border-coral bg-card px-4 py-3 text-[13px] text-muted">
          The scenario platform isn&rsquo;t configured, so no scenarios can be assigned yet.
        </p>
      )}
      {error && <p className="mb-3 text-[13px] font-semibold text-coral">{error}</p>}

      <div className="flex flex-col gap-3">
        {groups.map((g) => {
          const busy = busyId === g.id;
          return (
            <article
              key={g.id}
              className="rounded-[3px] border border-[var(--hairline)] bg-card p-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="inline-block h-4 w-4 shrink-0 rounded-[2px] border border-ink"
                  style={{ background: g.color ?? "#ccc" }}
                />
                <input
                  value={g.name}
                  onChange={(e) => patch(g.id, { name: e.target.value })}
                  onBlur={() => saveName(g)}
                  className={inputCls + " max-w-[220px]"}
                />
                <span
                  className={
                    "rounded-[2px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] " +
                    STATUS_STYLE[g.status]
                  }
                >
                  {g.status}
                </span>
                <span className="text-[12px] text-muted">
                  {g.implications} implication{g.implications === 1 ? "" : "s"}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {g.sessionCode && (
                    <Link
                      href={`/project/${slug}/workshop/s/${g.sessionCode}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] font-bold uppercase tracking-[0.06em] text-blue underline hover:text-ink"
                    >
                      Open board →
                    </Link>
                  )}
                  <button
                    onClick={() => remove(g)}
                    disabled={busy}
                    className={btn + " border-coral text-coral hover:bg-coral hover:text-white"}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="flex-1 min-w-[240px]">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                    Scenario
                  </span>
                  <select
                    value={g.scenarioRef ?? ""}
                    disabled={busy || !configured || scenarios.length === 0}
                    onChange={(e) => assign(g, e.target.value)}
                    className={inputCls + " mt-1"}
                  >
                    <option value="" disabled>
                      {scenarios.length === 0 ? "No scenarios found" : "Choose a scenario…"}
                    </option>
                    {scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                        {s.headline ? ` — ${s.headline}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                {g.sessionCode &&
                  (g.status === "FINALIZED" ? (
                    <button
                      onClick={() => finalize(g, "reopen")}
                      disabled={busy}
                      className={btn + " bg-paper hover:bg-card"}
                    >
                      Reopen for building
                    </button>
                  ) : (
                    <button
                      onClick={() => finalize(g, "finalize")}
                      disabled={busy}
                      className={btn + " bg-lime hover:bg-lime-deep"}
                    >
                      Finalize map
                    </button>
                  ))}
              </div>
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
        <button
          onClick={addGroup}
          disabled={busyId === "new" || !newName.trim()}
          className={btn + " bg-lime hover:bg-lime-deep"}
        >
          Add group
        </button>
      </div>
    </div>
  );
}
