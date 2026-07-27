"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UncertaintyRow } from "@/lib/cards";
import type { DriverLite } from "@/lib/drivers-shared";

const inputCls =
  "w-full rounded-[2px] border border-[var(--rule)] bg-paper px-2 py-1.5 text-[13px] focus:border-ink focus:outline-none";
const labelCls = "block text-[10px] font-bold uppercase tracking-[0.08em] text-muted";
const ROLES = ["Core", "Edge", "Wildcard"] as const;

type OutcomeForm = { code?: string; role: string; title: string; description: string };
type FormState = {
  slug: string;
  number: string;
  domain: string;
  title: string;
  question: string;
  sourceDriverIds: string[];
  outcomes: OutcomeForm[];
};

function toForm(u?: UncertaintyRow): FormState {
  return {
    slug: u?.id ?? "",
    number: String(u?.number ?? 0),
    domain: u?.domain ?? "",
    title: u?.title ?? "",
    question: u?.question ?? "",
    sourceDriverIds: u?.sourceDriverIds ?? [],
    outcomes: u?.outcomes.length
      ? u.outcomes.map((o) => ({ code: o.code, role: o.role, title: o.title, description: o.description }))
      : [{ role: "Core", title: "", description: "" }],
  };
}

function UncertaintyForm({
  initial,
  isNew,
  drivers,
  onDone,
  onCancel,
}: {
  initial?: UncertaintyRow;
  isNew: boolean;
  drivers: DriverLite[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<FormState>(toForm(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }
  function setOutcome(i: number, patch: Partial<OutcomeForm>) {
    setF((prev) => ({
      ...prev,
      outcomes: prev.outcomes.map((o, j) => (j === i ? { ...o, ...patch } : o)),
    }));
  }
  function addOutcome() {
    setF((prev) => ({ ...prev, outcomes: [...prev.outcomes, { role: "Core", title: "", description: "" }] }));
  }
  function removeOutcome(i: number) {
    setF((prev) => ({ ...prev, outcomes: prev.outcomes.filter((_, j) => j !== i) }));
  }
  function toggleDriver(slug: string) {
    setF((prev) => ({
      ...prev,
      sourceDriverIds: prev.sourceDriverIds.includes(slug)
        ? prev.sourceDriverIds.filter((s) => s !== slug)
        : [...prev.sourceDriverIds, slug],
    }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    const url = isNew ? "/api/admin/uncertainties" : `/api/admin/uncertainties/${initial!.id}`;
    const res = await fetch(url, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, number: Number(f.number) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Save failed.");
      setBusy(false);
      return;
    }
    setBusy(false);
    onDone();
  }

  return (
    <div className="rounded-[3px] border border-ink bg-card p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[80px_1fr_1fr]">
        <label className="block">
          <span className={labelCls}>Number</span>
          <input
            className={inputCls}
            type="number"
            value={f.number}
            onChange={(e) => set("number", e.target.value)}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Slug</span>
          <input
            className={inputCls + (isNew ? "" : " opacity-60")}
            value={f.slug}
            readOnly={!isNew}
            placeholder="shape-of-the-public"
            onChange={(e) => set("slug", e.target.value)}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Domain</span>
          <input className={inputCls} value={f.domain} onChange={(e) => set("domain", e.target.value)} />
        </label>
      </div>
      <label className="mt-3 block">
        <span className={labelCls}>Title</span>
        <input className={inputCls} value={f.title} onChange={(e) => set("title", e.target.value)} />
      </label>
      <label className="mt-3 block">
        <span className={labelCls}>Seeding question</span>
        <textarea
          className={inputCls + " min-h-[56px]"}
          value={f.question}
          onChange={(e) => set("question", e.target.value)}
        />
      </label>

      <div className="mt-4">
        <span className={labelCls}>Source drivers</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {drivers.map((d) => {
            const on = f.sourceDriverIds.includes(d.slug);
            return (
              <button
                key={d.slug}
                type="button"
                onClick={() => toggleDriver(d.slug)}
                className={
                  "rounded-[2px] border px-2 py-1 text-[11px] font-semibold tracking-[0.02em] " +
                  (on
                    ? "border-ink bg-ink text-white"
                    : "border-[var(--rule)] bg-paper text-muted hover:border-ink hover:text-ink")
                }
              >
                {d.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <span className={labelCls}>Outcome cards</span>
          <button
            type="button"
            onClick={addOutcome}
            className="text-[11px] font-bold uppercase tracking-[0.06em] text-blue underline hover:text-ink"
          >
            + Add outcome
          </button>
        </div>
        <ul className="mt-2 space-y-2">
          {f.outcomes.map((o, i) => (
            <li key={o.code ?? `new-${i}`} className="rounded-[2px] border border-[var(--hairline)] bg-paper p-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold tabular-nums text-muted">{o.code ?? "new"}</span>
                <select
                  className="rounded-[2px] border border-[var(--rule)] bg-paper px-1.5 py-1 text-[12px]"
                  value={o.role}
                  onChange={(e) => setOutcome(i, { role: e.target.value })}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <input
                  className={inputCls + " flex-1"}
                  placeholder="Outcome title"
                  value={o.title}
                  onChange={(e) => setOutcome(i, { title: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => removeOutcome(i)}
                  className="text-[11px] font-bold uppercase tracking-[0.06em] text-coral underline hover:text-ink"
                >
                  Remove
                </button>
              </div>
              <textarea
                className={inputCls + " mt-2 min-h-[48px]"}
                placeholder="Description"
                value={o.description}
                onChange={(e) => setOutcome(i, { description: e.target.value })}
              />
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="mt-3 text-[12px] font-semibold text-coral">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-[2px] border border-ink bg-ink px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-white enabled:hover:bg-blue disabled:opacity-40"
        >
          {busy ? "Saving…" : isNew ? "Create uncertainty" : "Save changes"}
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

export function AdminUncertaintiesManager({
  uncertainties,
  drivers,
}: {
  uncertainties: UncertaintyRow[];
  drivers: DriverLite[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...uncertainties].sort((a, b) => a.number - b.number);
  const driverName = new Map(drivers.map((d) => [d.slug, d.name]));

  function done() {
    setEditing(null);
    setCreating(false);
    router.refresh();
  }

  async function remove(u: UncertaintyRow) {
    if (!confirm(`Delete "${u.title}" and its ${u.outcomes.length} outcome cards? This can't be undone.`))
      return;
    setBusy(u.id);
    setError(null);
    const res = await fetch(`/api/admin/uncertainties/${u.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Delete failed.");
    }
    setBusy(null);
    router.refresh();
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
            + New uncertainty
          </button>
        )}
        <span className="text-[12px] text-muted">
          {uncertainties.length} uncertainties ·{" "}
          {uncertainties.reduce((n, u) => n + u.outcomes.length, 0)} outcomes
        </span>
        {error && <span className="text-[12px] font-semibold text-coral">{error}</span>}
      </div>

      {creating && (
        <div className="mt-4">
          <UncertaintyForm isNew drivers={drivers} onDone={done} onCancel={() => setCreating(false)} />
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {sorted.map((u) => (
          <li key={u.id}>
            {editing === u.id ? (
              <UncertaintyForm
                initial={u}
                isNew={false}
                drivers={drivers}
                onDone={done}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex items-start justify-between gap-3 rounded-[3px] border border-[var(--hairline)] bg-paper px-4 py-3 hover:bg-card">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold tabular-nums text-muted">
                      {String(u.number).padStart(2, "0")}
                    </span>
                    <span className="text-[14px] font-bold">{u.title}</span>
                    {u.domain && (
                      <span className="rounded-[2px] bg-[var(--hairline)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                        {u.domain}
                      </span>
                    )}
                  </div>
                  {u.question && <p className="mt-1 text-[13px] text-ink">{u.question}</p>}
                  <p className="mt-1 text-[11px] text-muted">
                    {u.id} · {u.outcomes.length} outcomes
                    {u.sourceDriverIds.length
                      ? " · " +
                        u.sourceDriverIds.map((s) => driverName.get(s) ?? s).join(", ")
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    onClick={() => {
                      setEditing(u.id);
                      setCreating(false);
                    }}
                    className="text-[11px] font-bold uppercase tracking-[0.06em] text-blue underline hover:text-ink"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(u)}
                    disabled={busy === u.id}
                    className="text-[11px] font-bold uppercase tracking-[0.06em] text-coral underline hover:text-ink disabled:opacity-40"
                  >
                    {busy === u.id ? "…" : "Delete"}
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
