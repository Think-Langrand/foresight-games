"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DriverLite } from "@/lib/drivers-shared";

const inputCls =
  "w-full rounded-[2px] border border-[var(--rule)] bg-paper px-2 py-1.5 text-[13px] focus:border-ink focus:outline-none";
const labelCls = "block text-[10px] font-bold uppercase tracking-[0.08em] text-muted";

type FormState = {
  slug: string;
  number: string;
  name: string;
  theme: string;
  headline: string;
  body: string;
};

function toForm(d?: DriverLite): FormState {
  return {
    slug: d?.slug ?? "",
    number: String(d?.number ?? 0),
    name: d?.name ?? "",
    theme: d?.theme ?? "",
    headline: d?.headline ?? "",
    body: d?.body ?? "",
  };
}

// Inline create/edit form. `isNew` controls whether slug is editable.
function DriverForm({
  initial,
  isNew,
  onDone,
  onCancel,
}: {
  initial?: DriverLite;
  isNew: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<FormState>(toForm(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(k: K, v: string) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    const url = isNew ? "/api/admin/drivers" : `/api/admin/drivers/${initial!.slug}`;
    try {
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
      onDone();
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
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
            placeholder="the-plural-public"
            onChange={(e) => set("slug", e.target.value)}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Theme</span>
          <input className={inputCls} value={f.theme} onChange={(e) => set("theme", e.target.value)} />
        </label>
      </div>
      <label className="mt-3 block">
        <span className={labelCls}>Name</span>
        <input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} />
      </label>
      <label className="mt-3 block">
        <span className={labelCls}>Headline</span>
        <input
          className={inputCls}
          value={f.headline}
          onChange={(e) => set("headline", e.target.value)}
        />
      </label>
      <label className="mt-3 block">
        <span className={labelCls}>Body</span>
        <textarea
          className={inputCls + " min-h-[80px]"}
          value={f.body}
          onChange={(e) => set("body", e.target.value)}
        />
      </label>
      {error && <p className="mt-3 text-[12px] font-semibold text-coral">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-[2px] border border-ink bg-ink px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-white enabled:hover:bg-blue disabled:opacity-40"
        >
          {busy ? "Saving…" : isNew ? "Create driver" : "Save changes"}
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

export function AdminDriversManager({ drivers }: { drivers: DriverLite[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...drivers].sort((a, b) => a.number - b.number);

  function done() {
    setEditing(null);
    setCreating(false);
    router.refresh();
  }

  async function remove(d: DriverLite) {
    if (!confirm(`Delete driver "${d.name}"? This can't be undone.`)) return;
    setBusy(d.slug);
    setError(null);
    try {
      const res = await fetch(`/api/admin/drivers/${d.slug}`, { method: "DELETE" });
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
            + New driver
          </button>
        )}
        <span className="text-[12px] text-muted">{drivers.length} drivers</span>
        {error && <span className="text-[12px] font-semibold text-coral">{error}</span>}
      </div>

      {creating && (
        <div className="mt-4">
          <DriverForm isNew onDone={done} onCancel={() => setCreating(false)} />
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {sorted.map((d) => (
          <li key={d.slug}>
            {editing === d.slug ? (
              <DriverForm
                initial={d}
                isNew={false}
                onDone={done}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex items-start justify-between gap-3 rounded-[3px] border border-[var(--hairline)] bg-paper px-4 py-3 hover:bg-card">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold tabular-nums text-muted">
                      {String(d.number).padStart(2, "0")}
                    </span>
                    <span className="text-[14px] font-bold">{d.name}</span>
                    {d.theme && (
                      <span className="rounded-[2px] bg-[var(--hairline)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                        {d.theme}
                      </span>
                    )}
                  </div>
                  {d.headline && (
                    <p className="mt-1 text-[13px] text-ink">{d.headline}</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-muted">{d.slug}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    onClick={() => {
                      setEditing(d.slug);
                      setCreating(false);
                    }}
                    className="text-[11px] font-bold uppercase tracking-[0.06em] text-blue underline hover:text-ink"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(d)}
                    disabled={busy === d.slug}
                    className="text-[11px] font-bold uppercase tracking-[0.06em] text-coral underline hover:text-ink disabled:opacity-40"
                  >
                    {busy === d.slug ? "…" : "Delete"}
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
