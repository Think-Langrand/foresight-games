"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import { keyChangeLabel, ordinal } from "@/lib/synthesis-shape";
import type { AdminTools, RankedCandidate } from "@/lib/analysis/implication-cluster-shape";
import { requestSimilar } from "@/lib/analysis/implication-cluster-client";

// "What else belongs in this theme?" — the theme view's second half.
//
// Two answers. A text search over everything not yet in the theme, for everyone: instant,
// no model, and most of the time what you are looking for is a word you remember. And for
// a facilitator, a similarity ranking: the Week 2 implications closest to what the theme
// already holds, for the cards nobody remembers to search for.
//
// A match from the tray is MOVED in. A match already sitting in another theme is COPIED
// in — clustering is not a partition (migration 0023), and taking a card out of someone
// else's theme from inside this one would be a surprise.

const MAX_MATCHES = 30;
const MAX_RANKED = 12;

export interface Elsewhere {
  card: RippleCard;
  themeText: string;
}

export function ThemeJoinSearch({
  members,
  tray,
  elsewhere,
  orderOf,
  keyOf,
  sourceIdOf,
  editable,
  busy,
  onMoveIn,
  onCopyIn,
  admin,
}: {
  members: RippleCard[]; // what the theme already holds
  tray: RippleCard[]; // not yet in any theme
  elsewhere: Elsewhere[]; // in another theme, and not already in this one
  orderOf: (c: RippleCard) => number | null;
  keyOf: (c: RippleCard) => string | null;
  sourceIdOf: (c: RippleCard) => string | null;
  editable: boolean;
  busy: boolean;
  onMoveIn: (card: RippleCard) => void;
  onCopyIn: (card: RippleCard) => void;
  admin?: AdminTools;
}) {
  const [query, setQuery] = useState("");
  const [ranked, setRanked] = useState<RankedCandidate[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState(admin?.clusterSources[0]?.exerciseId ?? "");

  const q = query.trim().toLowerCase();
  const hit = (c: RippleCard) =>
    c.text.toLowerCase().includes(q) ||
    (keyOf(c) ?? "").toLowerCase().includes(q) ||
    (c.description ?? "").toLowerCase().includes(q);

  type Row = { card: RippleCard; from: string | null };
  const rows: Row[] = q
    ? [
        ...tray.filter(hit).map((card) => ({ card, from: null })),
        ...elsewhere.filter((e) => hit(e.card)).map((e) => ({ card: e.card, from: e.themeText })),
      ].slice(0, MAX_MATCHES)
    : [];

  // Week 2 id → a candidate row, for mapping the ranking back onto board cards. Tray first,
  // so a card that is both in the tray and copied elsewhere is offered as a move.
  const bySource = new Map<string, Row>();
  for (const e of elsewhere) {
    const sid = sourceIdOf(e.card);
    if (sid && !bySource.has(sid)) bySource.set(sid, { card: e.card, from: e.themeText });
  }
  for (const c of tray) {
    const sid = sourceIdOf(c);
    if (sid) bySource.set(sid, { card: c, from: null });
  }
  const memberSources = members.map(sourceIdOf).filter((x): x is string => Boolean(x));

  async function suggest() {
    if (!admin || !sourceId) return;
    setRunning(true);
    setError(null);
    try {
      const res = await requestSimilar(admin.projectId, admin.groupId, {
        sourceExerciseId: sourceId,
        memberIds: memberSources,
        candidateIds: [...bySource.keys()],
      });
      setRanked(res.ranked.filter((r) => bySource.has(r.id)).slice(0, MAX_RANKED));
      setSkipped(res.skipped.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suggestions failed.");
    } finally {
      setRunning(false);
    }
  }

  const row = (r: Row, extra?: React.ReactNode) => {
    const o = orderOf(r.card);
    const k = keyOf(r.card);
    return (
      <li
        key={r.card.id}
        className="flex items-start gap-3 rounded-[3px] border border-black/15 bg-card px-3 py-2"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] leading-[1.4]">{r.card.text}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-[9.5px] font-bold uppercase tracking-[0.05em] text-muted">
            {o !== null && <span>{ordinal(o)} order</span>}
            {k && <span>{keyChangeLabel(k)}</span>}
            {r.from && <span className="text-blue">in {r.from}</span>}
          </div>
          {extra}
        </div>
        {editable && (
          <button
            onClick={() => (r.from ? onCopyIn(r.card) : onMoveIn(r.card))}
            disabled={busy}
            className="shrink-0 rounded-[2px] border border-ink bg-paper px-2 py-1 text-[10px] font-bold uppercase tracking-[0.05em] hover:bg-lime disabled:opacity-40"
          >
            {r.from ? "＋ Also add here" : "＋ Add"}
          </button>
        )}
      </li>
    );
  };

  const top = ranked?.[0]?.score ?? 0;

  return (
    <section className="rounded-[4px] border-2 border-[var(--rule)] bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
          Find more for this theme
        </h3>
        <span className="text-[11px] italic text-muted">
          {tray.length} in the tray · {elsewhere.length} in other themes
        </span>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search implications by a word, or by key change…"
        className="mt-2.5 w-full rounded-[2px] border border-ink bg-paper px-3 py-2 text-[13px]"
      />

      {q && rows.length === 0 && (
        <p className="mt-2 text-[12px] italic text-muted">Nothing matches “{query.trim()}”.</p>
      )}
      {rows.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {rows.map((r) => row(r))}
          {rows.length === MAX_MATCHES && (
            <li className="text-[11px] italic text-muted">Showing the first {MAX_MATCHES}. Narrow the search.</li>
          )}
        </ul>
      )}

      {admin && (
        <div className="mt-4 border-t border-[var(--hairline)] pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={suggest}
              disabled={running || memberSources.length === 0 || bySource.size === 0}
              title={
                memberSources.length === 0
                  ? "Put at least one implication from the Week 2 map in this theme first."
                  : "Rank what is left by how close it sits to what this theme already holds."
              }
              className="rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime disabled:opacity-40"
            >
              {running ? "Thinking…" : ranked ? "Suggest again" : "Suggest more"}
            </button>
            <span className="rounded-[2px] bg-blue px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.05em] text-paper">
              Facilitator
            </span>
            {admin.clusterSources.length > 1 && (
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="rounded-[2px] border border-ink bg-paper px-2 py-1 text-[11.5px]"
              >
                {admin.clusterSources.map((s) => (
                  <option key={s.exerciseId} value={s.exerciseId}>
                    {s.title}
                  </option>
                ))}
              </select>
            )}
            <span className="text-[11px] italic text-muted">
              Closest to what this theme already holds, by similarity. Hand-typed cards have no
              Week 2 text to compare and are left out.
            </span>
          </div>
          {error && <p className="mt-2 text-[12px] font-bold text-coral">{error}</p>}
          {ranked && (
            <>
              {ranked.length === 0 && (
                <p className="mt-2 text-[12px] italic text-muted">Nothing left to rank.</p>
              )}
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {ranked.map((r) => {
                  const match = bySource.get(r.id);
                  if (!match) return null;
                  const width = top > 0 ? Math.max(4, Math.round((Math.max(0, r.score) / top) * 100)) : 0;
                  return row(
                    match,
                    <div className="mt-1 flex items-center gap-2">
                      <span className="h-1 flex-1 overflow-hidden rounded bg-black/10">
                        <span className="block h-full bg-blue" style={{ width: `${width}%` }} />
                      </span>
                      <span className="text-[9.5px] tabular-nums text-muted">{r.score.toFixed(2)}</span>
                    </div>
                  );
                })}
              </ul>
              {skipped > 0 && (
                <p className="mt-1.5 text-[10.5px] italic text-muted">
                  {skipped} card{skipped === 1 ? "" : "s"} left out — not on the chosen week&rsquo;s map.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
