"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import "./analysis.css";
import type { AnalysisData } from "@/lib/analysis/view-data";
import {
  NARRATIVE_FIELDS,
  NARRATIVE_LABELS,
  type KernelEntry,
  type PairStat,
  type Tone,
} from "@/lib/analysis/types";

// ---------------------------------------------------------------- tooltip

interface Tip {
  x: number;
  y: number;
  head: string;
  sub?: string;
  body?: string;
}

function useTooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const move = (e: React.MouseEvent, t: Omit<Tip, "x" | "y">) => {
    // Flip away from the right / bottom viewport edges.
    const pad = 16;
    const flipX = e.clientX > window.innerWidth - 340;
    const flipY = e.clientY > window.innerHeight - 140;
    setTip({
      ...t,
      x: flipX ? e.clientX - 340 + pad : e.clientX + pad,
      y: flipY ? e.clientY - 120 : e.clientY + pad,
    });
  };
  const node = tip ? (
    <div className="av-tooltip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      <div className="av-tooltip-head">{tip.head}</div>
      {tip.sub && <div className="av-tooltip-sub">{tip.sub}</div>}
      {tip.body && <div>{tip.body}</div>}
    </div>
  ) : null;
  return { move, hide: () => setTip(null), node };
}

// ---------------------------------------------------------------- bars

interface BarDatum {
  label: string;
  value: number;
  tip: Omit<Tip, "x" | "y">;
}

function Bars({
  data,
  max,
  tt,
}: {
  data: BarDatum[];
  max: number;
  tt: ReturnType<typeof useTooltip>;
}) {
  const safeMax = Math.max(max, 1);
  return (
    <div className="av-bars">
      {data.map((d) => (
        <div
          key={d.label}
          className={`av-bar-row${d.value === 0 ? " is-zero" : ""}`}
          onMouseMove={(e) => tt.move(e, d.tip)}
          onMouseLeave={tt.hide}
        >
          <div className="av-bar-label">{d.label}</div>
          <div className="av-bar-track">
            <div
              className="av-bar-fill"
              style={{ width: `${(d.value / safeMax) * 100}%` }}
            />
          </div>
          <div className="av-bar-value av-num">{d.value}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- tone chip

function ToneChip({ tone }: { tone: Tone }) {
  return (
    <span className="av-tone">
      <span className={`av-tone-dot is-${tone}`} aria-hidden />
      {tone === "hopeful" ? "Hopeful" : "Darker"}
    </span>
  );
}

// ---------------------------------------------------------------- inline tag editor

function TagEditor({
  entry,
  families,
}: {
  entry: KernelEntry;
  families: string[];
}) {
  const router = useRouter();
  const [tone, setTone] = useState<string>(entry.tone ?? "");
  const [family, setFamily] = useState<string>(entry.family ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{ tone: Tone; family: string } | null>(null);

  const dirty = (tone || "") !== (entry.tone ?? "") || (family || "") !== (entry.family ?? "");

  async function save() {
    if (!entry.id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/analysis/tag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teamId: entry.id,
          tone: tone || null,
          family: family.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (${res.status}).`);
      }
      setSuggestion(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function suggest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/analysis/suggest-tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          convergence: entry.convergence,
          definingCharacteristics: entry.definingCharacteristics,
          centralTension: entry.centralTension,
          newNormal: entry.newNormal,
          brokenAssumption: entry.brokenAssumption,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Suggestion failed (${res.status}).`);
      setSuggestion({ tone: data.tone, family: data.family });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suggestion failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="av-tag-input">
      <label>
        Tone{" "}
        <select value={tone} onChange={(e) => setTone(e.target.value)} disabled={busy}>
          <option value="">—</option>
          <option value="hopeful">Hopeful</option>
          <option value="dark">Darker</option>
        </select>
      </label>
      <label>
        Family{" "}
        <input
          list="av-families"
          value={family}
          onChange={(e) => setFamily(e.target.value)}
          placeholder="e.g. Localized trust"
          disabled={busy}
          size={16}
        />
      </label>
      <datalist id="av-families">
        {families.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <button className="av-btn" onClick={save} disabled={busy || !dirty}>
        Save
      </button>
      <button className="av-btn" onClick={suggest} disabled={busy} title="LLM suggestion — review before saving">
        Suggest
      </button>
      {suggestion && (
        <span className="av-suggestion">
          Suggested: <b>{suggestion.tone}</b> · <b>{suggestion.family}</b>{" "}
          <button
            className="av-btn"
            onClick={() => {
              setTone(suggestion.tone);
              setFamily(suggestion.family);
            }}
          >
            Apply
          </button>
        </span>
      )}
      {error && <span className="av-suggestion" style={{ color: "var(--av-dark)" }}>{error}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- bulk tag bar

function BulkTagBar({ untaggedIds }: { untaggedIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    if (untaggedIds.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/analysis/suggest-tags/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamIds: untaggedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Auto-tag failed (${res.status}).`);
      setMsg(`Tagged ${data.tagged} of ${data.eligible} untagged kernels.`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Auto-tag failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="av-filters" style={{ marginBottom: 0 }}>
      <button className="av-btn" onClick={run} disabled={busy || untaggedIds.length === 0}>
        {busy ? "Auto-tagging…" : `Auto-tag ${untaggedIds.length} untagged (GPT-5)`}
      </button>
      {msg && <span className="av-suggestion">{msg}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- kernel card

function KernelCard({
  entry,
  families,
  canEdit,
}: {
  entry: KernelEntry;
  families: string[];
  canEdit: boolean;
}) {
  const cards = Array.isArray(entry.cards) ? entry.cards : [];
  return (
    <div className="av-kernel">
      <div>
        <div className="av-kernel-title">{entry.worldTitle || "Untitled world"}</div>
        <div className="av-kernel-meta">
          {[entry.code, entry.name, entry.family].filter(Boolean).join(" · ")}
        </div>
      </div>
      {entry.tone && <ToneChip tone={entry.tone} />}
      <div>
        {NARRATIVE_FIELDS.map((f) => {
          const text = (entry[f] ?? "").trim();
          if (!text) return null;
          return (
            <div key={f}>
              <div className="av-field-label">{NARRATIVE_LABELS[f]}</div>
              <div className="av-field-text">{text}</div>
            </div>
          );
        })}
      </div>
      <div className="av-chips">
        {cards.map((c, i) => (
          <span
            key={`${c.title}-${i}`}
            className={`av-cardchip${c.role === "Edge" ? " is-edge" : ""}`}
            title={c.condition}
          >
            {c.title}
            {c.role === "Edge" && <span className="av-cardchip-edge"> (edge)</span>}
          </span>
        ))}
      </div>
      {canEdit && entry.id && <TagEditor entry={entry} families={families} />}
    </div>
  );
}

// ---------------------------------------------------------------- browser

function KernelBrowser({
  kept,
  codes,
  families,
  hasTones,
  canEdit,
}: {
  kept: KernelEntry[];
  codes: string[];
  families: string[];
  hasTones: boolean;
  canEdit: boolean;
}) {
  const [code, setCode] = useState("");
  const [tone, setTone] = useState("");
  const [family, setFamily] = useState("");

  const filtered = useMemo(
    () =>
      kept.filter(
        (e) =>
          (!code || e.code === code) &&
          (!tone || e.tone === tone) &&
          (!family || (e.family ?? "") === family)
      ),
    [kept, code, tone, family]
  );

  const untaggedIds = useMemo(
    () => kept.filter((e) => e.id && !e.tone).map((e) => e.id as string),
    [kept]
  );

  return (
    <div className="av-section">
      <div className="av-filters" style={{ justifyContent: "space-between" }}>
        <h2 className="av-section-title" style={{ margin: 0, border: 0, padding: 0 }}>
          Kernels ({filtered.length})
        </h2>
        {canEdit && untaggedIds.length > 0 && <BulkTagBar untaggedIds={untaggedIds} />}
      </div>
      <div className="av-filters">
        <select value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">All sessions</option>
          {codes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {hasTones && (
          <select value={tone} onChange={(e) => setTone(e.target.value)}>
            <option value="">Any tone</option>
            <option value="hopeful">Hopeful</option>
            <option value="dark">Darker</option>
          </select>
        )}
        {families.length > 0 && (
          <select value={family} onChange={(e) => setFamily(e.target.value)}>
            <option value="">Any family</option>
            {families.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="av-empty">No kernels match these filters.</p>
      ) : (
        <div className="av-grid">
          {filtered.map((e) => (
            <KernelCard key={e.id ?? e.code + e.worldTitle} entry={e} families={families} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- main view

export function AnalysisView({
  data,
  canEdit,
  scope,
  backHref,
}: {
  data: AnalysisData;
  canEdit: boolean;
  scope: string;
  backHref: string;
}) {
  const tt = useTooltip();
  const totalPicks = data.roleSplit.core + data.roleSplit.edge;
  const corePct = totalPicks > 0 ? Math.round((data.roleSplit.core / totalPicks) * 100) : 0;
  const hasTones = data.taggedCount > 0;

  const excludedByReason = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of data.excluded) m.set(x.reason, (m.get(x.reason) ?? 0) + 1);
    return m;
  }, [data.excluded]);

  const chartCards = data.cards.filter((c) => c.picks >= 2);
  const maxCard = data.cards[0]?.picks ?? 0;
  const maxDim = data.dimensions[0]?.picks ?? 0;

  const familyCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data.kept) {
      const f = (e.family ?? "").trim();
      if (f) m.set(f, (m.get(f) ?? 0) + 1);
    }
    return [...m.entries()].map(([family, count]) => ({ family, count })).sort((a, b) => b.count - a.count);
  }, [data.kept]);

  return (
    <main className="av">
      <div className="av-wrap">
        <Link href={backHref} className="av-backlink">
          ← Back
        </Link>
        <div style={{ marginTop: 16 }}>
          <span className="av-eyebrow">Facilitator analysis</span>
          <h1 className="av-h1">Scenario kernels</h1>
          <p className="av-lede">{scope}</p>
        </div>

        {/* caveats */}
        {(data.excluded.length > 0 || data.nearDuplicateGroups.length > 0) && (
          <div className="av-section">
            {data.nearDuplicateGroups.map((g, i) => (
              <div className="av-caveat" key={i}>
                <strong>Possible duplicate world.</strong> {g.length} entries (
                {g.map((e) => e.code).join(", ")}) look like the same world submitted under
                different codes — counts may be inflated. They are flagged, not removed.
              </div>
            ))}
            {data.excluded.length > 0 && (
              <details className="av-disclosure">
                <summary>Excluded {data.excluded.length} entries — why?</summary>
                <ul>
                  {[...excludedByReason.entries()].map(([reason, n]) => (
                    <li key={reason}>
                      <strong>{n}</strong> {reason.replace("-", " ")}
                    </li>
                  ))}
                  {data.excluded.map((x, i) => (
                    <li key={i}>
                      {x.entry.code} — {x.entry.worldTitle || x.entry.name || "untitled"} (
                      {x.reason.replace("-", " ")})
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {data.kept.length === 0 ? (
          <p className="av-empty">No analyzable kernels yet.</p>
        ) : (
          <>
            {/* stat tiles */}
            <div className="av-section av-tiles">
              <div className="av-tile">
                <div className="av-tile-num av-num">{data.kept.length}</div>
                <div className="av-tile-label">Kernels kept</div>
              </div>
              <div className="av-tile">
                <div className="av-tile-num av-num">{data.codes.length}</div>
                <div className="av-tile-label">Session codes</div>
              </div>
              <div className="av-tile">
                <div className="av-tile-num av-num">{corePct}%</div>
                <div className="av-tile-label">Core picks</div>
              </div>
              {hasTones && (
                <div className="av-tile">
                  <div className="av-tile-num av-num">
                    {data.toneCounts.hopeful}:{data.toneCounts.dark}
                  </div>
                  <div className="av-tile-label">Hopeful : darker</div>
                </div>
              )}
            </div>

            {/* card frequency */}
            <div className="av-section">
              <h2 className="av-section-title">Outcome cards (picked ≥ 2×)</h2>
              <div className="av-card">
                <Bars
                  tt={tt}
                  max={maxCard}
                  data={chartCards.map((c) => ({
                    label: c.title,
                    value: c.picks,
                    tip: {
                      head: c.title,
                      sub: `${c.dimension} · ${c.role}`,
                      body: c.condition,
                    },
                  }))}
                />
                {chartCards.length === 0 && (
                  <p className="av-empty">No card was picked more than once.</p>
                )}
                <details className="av-disclosure">
                  <summary>Full card table ({data.cards.length})</summary>
                  <div className="av-scroll">
                    <table className="av-table">
                      <thead>
                        <tr>
                          <th>Card</th>
                          <th>Dimension</th>
                          <th>Role</th>
                          <th className="av-num">Picks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.cards.map((c) => (
                          <tr key={c.title}>
                            <td>{c.title}</td>
                            <td>{c.dimension}</td>
                            <td>{c.role}</td>
                            <td className="av-num">{c.picks}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            </div>

            {/* dimensions + co-occurrence */}
            <div className="av-section av-twoup">
              <div>
                <h2 className="av-section-title">Uncertainty dimensions</h2>
                <div className="av-card">
                  <Bars
                    tt={tt}
                    max={maxDim}
                    data={data.dimensions.map((d) => ({
                      label: d.dimension,
                      value: d.picks,
                      tip: {
                        head: d.dimension,
                        sub: `${d.picks} of ${totalPicks} picks`,
                        body:
                          d.picks === 0
                            ? "No team chose this dimension."
                            : d.picks <= 1
                              ? "Nearly ignored."
                              : undefined,
                      },
                    }))}
                  />
                </div>
              </div>
              <div>
                <h2 className="av-section-title">Card pairs (together ≥ 2×)</h2>
                <div className="av-card">
                  <CoOccurrence pairs={data.cardPairs} />
                  {data.dimensionPairs.length > 0 && (
                    <details className="av-disclosure">
                      <summary>Dimension pairs ({data.dimensionPairs.length})</summary>
                      <div style={{ marginTop: 10 }}>
                        <CoOccurrence pairs={data.dimensionPairs} />
                      </div>
                    </details>
                  )}
                </div>
              </div>
            </div>

            {/* family (only when tagged) */}
            {familyCounts.length > 0 && (
              <div className="av-section">
                <h2 className="av-section-title">Scenario families</h2>
                <div className="av-card">
                  <Bars
                    tt={tt}
                    max={familyCounts[0].count}
                    data={familyCounts.map((f) => ({
                      label: f.family,
                      value: f.count,
                      tip: { head: f.family, sub: `${f.count} kernels` },
                    }))}
                  />
                </div>
              </div>
            )}

            <KernelBrowser
              kept={data.kept}
              codes={data.codes}
              families={data.families}
              hasTones={hasTones}
              canEdit={canEdit}
            />
          </>
        )}
      </div>
      {tt.node}
    </main>
  );
}

function CoOccurrence({ pairs }: { pairs: PairStat[] }) {
  if (pairs.length === 0) return <p className="av-empty">No repeated pairs.</p>;
  return (
    <div className="av-pairs">
      {pairs.map((p) => (
        <div className="av-pair" key={`${p.a}|${p.b}`}>
          <span>
            {p.a} <span className="av-pair-sub">+</span> {p.b}
          </span>
          <span className="av-pair-count av-num">{p.count}</span>
        </div>
      ))}
    </div>
  );
}
