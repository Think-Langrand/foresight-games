"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PROJECT_HOME_ITEMS,
  SCENARIO_PAGE2_SECTIONS,
  defaultHomeConfig,
  type HomeConfig,
  type HomeItem,
  type HomeItemKey,
  type ScenarioSectionKey,
} from "@/lib/project-home";

export interface AdminProject {
  id: string;
  slug: string;
  name: string;
  carmelitaProjectRef: string;
  homeConfig: HomeConfig;
  enabled: boolean;
  hasPassphrase: boolean;
}

const inputCls =
  "w-full rounded-[2px] border border-[var(--rule)] bg-paper px-2 py-1.5 text-[13px] focus:border-ink focus:outline-none";
const labelCls = "block text-[10px] font-bold uppercase tracking-[0.08em] text-muted";

const ITEM_LABELS: Record<HomeItemKey, string> = Object.fromEntries(
  PROJECT_HOME_ITEMS.map((i) => [i.key, i.label])
) as Record<HomeItemKey, string>;

type FormState = {
  slug: string;
  name: string;
  carmelitaProjectRef: string;
  password: string;
  clearPassphrase: boolean;
  enabled: boolean;
  items: HomeItem[];
  hiddenScenarioSections: ScenarioSectionKey[];
  defaultScenarioSetId: string | null;
};

function toForm(p?: AdminProject): FormState {
  const cfg = p?.homeConfig ?? defaultHomeConfig();
  return {
    slug: p?.slug ?? "",
    name: p?.name ?? "",
    carmelitaProjectRef: p?.carmelitaProjectRef ?? "",
    password: "",
    clearPassphrase: false,
    enabled: p?.enabled ?? true,
    items: cfg.items,
    hiddenScenarioSections: cfg.hiddenScenarioSections,
    defaultScenarioSetId: cfg.defaultScenarioSetId,
  };
}

interface ScenarioSetOption {
  id: string;
  domain: string;
  scenarioCount: number;
}

function ProjectForm({
  initial,
  isNew,
  onDone,
  onCancel,
}: {
  initial?: AdminProject;
  isNew: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<FormState>(toForm(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Scenario sets for the "default set" picker — fetched (debounced) for the current
  // Carmelita ref. Lazy + tolerant so a flaky platform can't block editing.
  const [sets, setSets] = useState<ScenarioSetOption[]>([]);
  const [setsError, setSetsError] = useState<string | null>(null);

  useEffect(() => {
    const ref = f.carmelitaProjectRef.trim();
    if (!ref) {
      setSets([]);
      setSetsError(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/scenario-sets?ref=${encodeURIComponent(ref)}`);
        const data = (await res.json().catch(() => ({}))) as { sets?: ScenarioSetOption[]; error?: string };
        if (cancelled) return;
        setSets(data.sets ?? []);
        setSetsError(data.error ?? null);
      } catch {
        if (!cancelled) {
          setSets([]);
          setSetsError("Could not load scenario sets.");
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [f.carmelitaProjectRef]);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  function toggleItem(key: HomeItemKey) {
    setF((prev) => ({
      ...prev,
      items: prev.items.map((it) =>
        it.key === key ? { ...it, visible: !it.visible } : it
      ),
    }));
  }

  // A scenario page-2 section is "on" when NOT in the hidden list.
  function toggleSection(key: ScenarioSectionKey) {
    setF((prev) => ({
      ...prev,
      hiddenScenarioSections: prev.hiddenScenarioSections.includes(key)
        ? prev.hiddenScenarioSections.filter((k) => k !== key)
        : [...prev.hiddenScenarioSections, key],
    }));
  }

  function move(index: number, dir: -1 | 1) {
    setF((prev) => {
      const items = [...prev.items];
      const j = index + dir;
      if (j < 0 || j >= items.length) return prev;
      [items[index], items[j]] = [items[j], items[index]];
      return { ...prev, items };
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    const url = isNew ? "/api/admin/projects" : `/api/admin/projects/${initial!.id}`;
    try {
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: f.slug,
          name: f.name,
          carmelitaProjectRef: f.carmelitaProjectRef,
          passphrase: f.password,
          clearPassphrase: f.clearPassphrase,
          enabled: f.enabled,
          homeConfig: {
            items: f.items,
            hiddenScenarioSections: f.hiddenScenarioSections,
            defaultScenarioSetId: f.defaultScenarioSetId,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Save failed.");
        setBusy(false);
        return;
      }
      onDone();
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[3px] border border-ink bg-card p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>Slug (route: /project/…)</span>
          <input
            className={inputCls + (isNew ? "" : " opacity-60")}
            value={f.slug}
            readOnly={!isNew}
            placeholder="acme-health"
            onChange={(e) => set("slug", e.target.value)}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Name</span>
          <input
            className={inputCls}
            value={f.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Carmelita project id</span>
          <input
            className={inputCls}
            value={f.carmelitaProjectRef}
            placeholder="slug or UUID"
            onChange={(e) => set("carmelitaProjectRef", e.target.value)}
          />
        </label>
        <label className="block">
          <span className={labelCls}>
            {isNew ? "Password (blank = open)" : "New password (blank = keep)"}
          </span>
          <input
            className={inputCls}
            type="password"
            autoComplete="new-password"
            value={f.password}
            onChange={(e) => set("password", e.target.value)}
            disabled={f.clearPassphrase}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-[12px] font-semibold text-ink">
          <input
            type="checkbox"
            checked={f.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
          />
          Enabled
        </label>
        {!isNew && initial?.hasPassphrase && (
          <label className="flex items-center gap-2 text-[12px] font-semibold text-ink">
            <input
              type="checkbox"
              checked={f.clearPassphrase}
              onChange={(e) => set("clearPassphrase", e.target.checked)}
            />
            Remove password (make open)
          </label>
        )}
      </div>

      {/* Home items — visibility + order. */}
      <div className="mt-4">
        <span className={labelCls}>Home page items — show &amp; order</span>
        <ul className="mt-2 space-y-1.5">
          {f.items.map((it, i) => (
            <li
              key={it.key}
              className="flex items-center gap-3 rounded-[2px] border border-[var(--hairline)] bg-paper px-3 py-1.5"
            >
              <label className="flex grow items-center gap-2 text-[13px] font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={it.visible}
                  onChange={() => toggleItem(it.key)}
                />
                {ITEM_LABELS[it.key]}
                {!it.visible && (
                  <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                    hidden
                  </span>
                )}
              </label>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${ITEM_LABELS[it.key]} up`}
                  className="rounded-[2px] border border-[var(--rule)] px-2 py-0.5 text-[12px] hover:border-ink disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === f.items.length - 1}
                  aria-label={`Move ${ITEM_LABELS[it.key]} down`}
                  className="rounded-[2px] border border-[var(--rule)] px-2 py-0.5 text-[12px] hover:border-ink disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Scenario "page 2" (what-it-means) sections — per-project on/off. */}
      <div className="mt-4">
        <span className={labelCls}>Scenario page 2 — sections to show</span>
        <p className="mt-1 text-[11px] leading-[1.4] text-muted">
          Uncheck to hide a section from the scenario reader&rsquo;s second page. Hiding all three
          removes the second page.
        </p>
        <ul className="mt-2 space-y-1.5">
          {SCENARIO_PAGE2_SECTIONS.map((s) => {
            const on = !f.hiddenScenarioSections.includes(s.key);
            return (
              <li
                key={s.key}
                className="flex items-center rounded-[2px] border border-[var(--hairline)] bg-paper px-3 py-1.5"
              >
                <label className="flex grow items-center gap-2 text-[13px] font-semibold text-ink">
                  <input type="checkbox" checked={on} onChange={() => toggleSection(s.key)} />
                  {s.label}
                  {!on && (
                    <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                      hidden
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {/* The scenario set the home "Scenarios" card opens directly. */}
      <div className="mt-4">
        <span className={labelCls}>Default scenario set</span>
        <p className="mt-1 text-[11px] leading-[1.4] text-muted">
          The home <span className="font-semibold">Scenarios</span> card opens this set directly.
          &ldquo;Auto&rdquo; uses the first set the platform returns.
        </p>
        <select
          className={inputCls + " mt-2"}
          value={f.defaultScenarioSetId ?? ""}
          onChange={(e) => set("defaultScenarioSetId", e.target.value || null)}
        >
          <option value="">Auto — first set</option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.domain} ({s.scenarioCount})
            </option>
          ))}
          {/* Keep a saved id selectable even if the list didn't load (platform down). */}
          {f.defaultScenarioSetId && !sets.some((s) => s.id === f.defaultScenarioSetId) && (
            <option value={f.defaultScenarioSetId}>Saved set ({f.defaultScenarioSetId.slice(0, 8)}…)</option>
          )}
        </select>
        {setsError && <p className="mt-1 text-[11px] text-coral">{setsError}</p>}
      </div>

      {error && <p className="mt-3 text-[12px] font-semibold text-coral">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-[2px] border border-ink bg-ink px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-white enabled:hover:bg-blue disabled:opacity-40"
        >
          {busy ? "Saving…" : isNew ? "Create project" : "Save changes"}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted underline hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function AdminProjectsManager({ projects }: { projects: AdminProject[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function done() {
    setEditing(null);
    setCreating(false);
    router.refresh();
  }

  async function remove(p: AdminProject) {
    if (!confirm(`Delete project "${p.name}"? This can't be undone.`)) return;
    setBusy(p.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${p.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Delete failed.");
        setBusy(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setBusy(null);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        {!creating && (
          <button
            onClick={() => {
              setCreating(true);
              setEditing(null);
            }}
            className="rounded-[2px] border border-ink bg-paper px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-blue hover:text-white"
          >
            + New project
          </button>
        )}
        <span className="text-[12px] text-muted">{projects.length} projects</span>
        {error && <span className="text-[12px] font-semibold text-coral">{error}</span>}
      </div>

      {creating && (
        <div className="mt-4">
          <ProjectForm isNew onDone={done} onCancel={() => setCreating(false)} />
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {projects.map((p) => (
          <li key={p.id}>
            {editing === p.id ? (
              <ProjectForm
                initial={p}
                isNew={false}
                onDone={done}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex items-start justify-between gap-3 rounded-[3px] border border-[var(--hairline)] bg-paper px-4 py-3 hover:bg-card">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-bold">{p.name}</span>
                    <span className="rounded-[2px] bg-[var(--hairline)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                      /project/{p.slug}
                    </span>
                    {p.hasPassphrase ? (
                      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-blue">
                        🔒 password
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                        open
                      </span>
                    )}
                    {!p.enabled && (
                      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-coral">
                        disabled
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] text-muted">
                    Carmelita id: <span className="font-semibold text-ink">{p.carmelitaProjectRef}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <a
                    href={`/admin/projects/${p.slug}`}
                    className="text-[11px] font-bold uppercase tracking-[0.06em] text-blue underline hover:text-ink"
                  >
                    Dashboard →
                  </a>
                  <a
                    href={`/project/${p.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted underline hover:text-ink"
                  >
                    Open →
                  </a>
                  <button
                    onClick={() => {
                      setEditing(p.id);
                      setCreating(false);
                    }}
                    className="text-[11px] font-bold uppercase tracking-[0.06em] text-blue underline hover:text-ink"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(p)}
                    disabled={busy === p.id}
                    className="text-[11px] font-bold uppercase tracking-[0.06em] text-coral underline hover:text-ink disabled:opacity-40"
                  >
                    {busy === p.id ? "…" : "Delete"}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
