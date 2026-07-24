"use client";

import { useMemo, useState } from "react";
import { postTeam, patchTeam } from "@/components/workshop/hooks";
import { DOMAIN_ORDER, type Card, type Deck, type Team } from "@/lib/workshop-types";

/**
 * Facilitator-only setup, shown on the projector screen. Pre-creates breakout
 * teams and locks each team's slot-1 outcome in advance. Two teams may share an
 * uncertainty, but an outcome can only go to one team — enforced here (taken
 * outcomes are disabled) and again on the server.
 */
export function TeamSetupPanel({
  code,
  deck,
  teams,
  onChange,
}: {
  code: string;
  deck: Deck;
  teams: Team[];
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<Team | null>(null);

  const cardById = useMemo(() => new Map(deck.cards.map((c) => [c.id, c])), [deck]);
  // An outcome is "taken" the moment any team holds it as its seed card.
  const takenBy = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) if (t.seedCardId) m.set(t.seedCardId, t.name);
    return m;
  }, [teams]);

  const unassigned = teams.filter((t) => !t.seedLocked);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const addTeam = () =>
    run(async () => {
      await postTeam(code, { name: `Team ${teams.length + 1}` });
    });

  const assign = (team: Team, cardId: string) =>
    run(async () => {
      await patchTeam(code, team.id, { assignSeed: cardId });
      setAssigning(null);
    });

  const clear = (team: Team) =>
    run(async () => {
      await patchTeam(code, team.id, { assignSeed: "" });
    });

  const rename = (team: Team, name: string) =>
    run(async () => {
      if (name.trim() && name.trim() !== team.name) await patchTeam(code, team.id, { name });
    });

  // Fill every unassigned team with a distinct random outcome (Core/Edge only).
  const randomizeRest = () =>
    run(async () => {
      const taken = new Set(takenBy.keys());
      const pool = deck.cards.filter((c) => c.role !== "Wildcard" && !taken.has(c.id));
      for (const t of unassigned) {
        if (pool.length === 0) throw new Error("Not enough outcomes left to assign.");
        const i = Math.floor(Math.random() * pool.length);
        const [card] = pool.splice(i, 1);
        await patchTeam(code, t.id, { assignSeed: card.id });
      }
    });

  return (
    <section className="mt-6 rounded-[3px] border border-[var(--hairline)] bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="eyebrow ink">Set up teams</span>
          <p className="mt-1 text-[12px] leading-[1.5] text-muted">
            Pre-create breakout teams and lock each team&apos;s starting card. Same uncertainty is
            fine across teams — the outcome can only go to one.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addTeam}
            disabled={busy}
            className="rounded-[2px] border border-ink bg-lime px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-lime-deep disabled:opacity-50"
          >
            + Add team
          </button>
          {unassigned.length > 0 && (
            <button
              onClick={randomizeRest}
              disabled={busy}
              className="rounded-[2px] border border-ink bg-paper px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-lime disabled:opacity-50"
            >
              🎲 Fill {unassigned.length} randomly
            </button>
          )}
        </div>
      </div>

      {err && <div className="mt-3 text-[13px] font-semibold text-coral">{err}</div>}

      {teams.length === 0 ? (
        <div className="mt-4 text-[13px] text-muted">
          No teams yet. Add one per breakout room, then assign each a starting card.
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {teams.map((t) => {
            const card = t.seedCardId ? cardById.get(t.seedCardId) : undefined;
            return (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-3 rounded-[2px] border border-[var(--hairline)] bg-paper px-3 py-2.5"
              >
                <span
                  className="inline-block h-3.5 w-3.5 flex-none rounded-[2px] border border-ink"
                  style={{ background: t.color }}
                />
                <input
                  defaultValue={t.name}
                  onBlur={(e) => rename(t, e.target.value)}
                  className="w-28 rounded-[2px] border border-transparent bg-transparent px-1 py-0.5 text-[14px] font-bold outline-none hover:border-[var(--hairline)] focus:border-ink"
                />
                <div className="min-w-0 flex-1">
                  {t.seedLocked && card ? (
                    <div className="text-[12.5px] leading-[1.3]">
                      <span className="font-bold uppercase tracking-[0.04em] text-blue">
                        {card.dimension}
                      </span>
                      <span className="text-muted"> · </span>
                      <span className="font-semibold">{card.title}</span>
                    </div>
                  ) : (
                    <span className="text-[12.5px] italic text-muted">No starting card yet</span>
                  )}
                </div>
                {t.seedLocked ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAssigning(t)}
                      disabled={busy}
                      className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted underline hover:text-ink disabled:opacity-50"
                    >
                      Change
                    </button>
                    <button
                      onClick={() => clear(t)}
                      disabled={busy}
                      className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted underline hover:text-coral disabled:opacity-50"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAssigning(t)}
                    disabled={busy}
                    className="rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime disabled:opacity-50"
                  >
                    Assign card →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {assigning && (
        <AssignPicker
          team={assigning}
          deck={deck}
          takenBy={takenBy}
          busy={busy}
          onPick={(cardId) => assign(assigning, cardId)}
          onClose={() => setAssigning(null)}
        />
      )}
    </section>
  );
}

// Browse uncertainties → outcomes and lock one to the team. Outcomes already
// held by another team are shown disabled.
function AssignPicker({
  team,
  deck,
  takenBy,
  busy,
  onPick,
  onClose,
}: {
  team: Team;
  deck: Deck;
  takenBy: Map<string, string>;
  busy: boolean;
  onPick: (cardId: string) => void;
  onClose: () => void;
}) {
  const [uncId, setUncId] = useState<string | null>(null);
  const outcomes = useMemo(
    () =>
      uncId
        ? deck.cards.filter((c) => c.uncertaintyId === uncId && c.role !== "Wildcard")
        : [],
    [deck, uncId]
  );
  const domains = DOMAIN_ORDER.filter((d) => deck.uncertainties.some((u) => u.domain === d));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(20,20,18,0.5)] sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-[600px] overflow-y-auto rounded-t-[8px] border border-ink bg-paper p-5 sm:rounded-[8px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="eyebrow ink">
            {uncId ? `${team.name} · pick an outcome` : `${team.name} · pick an uncertainty`}
          </span>
          <button
            onClick={onClose}
            className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted hover:text-ink"
          >
            Close ✕
          </button>
        </div>

        {!uncId ? (
          <div className="mt-3 flex flex-col gap-4">
            {domains.map((domain) => (
              <div key={domain}>
                <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-blue">
                  {domain}
                </div>
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {deck.uncertainties
                    .filter((u) => u.domain === domain)
                    .map((u) => {
                      const total = deck.cards.filter(
                        (c) => c.uncertaintyId === u.id && c.role !== "Wildcard"
                      );
                      const free = total.filter((c) => !takenBy.has(c.id)).length;
                      return (
                        <button
                          key={u.id}
                          onClick={() => setUncId(u.id)}
                          className="rounded-[2px] border border-[var(--hairline)] bg-card px-3 py-2 text-left transition-colors hover:border-ink hover:bg-lime"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[14px] font-bold leading-[1.15]">{u.title}</div>
                            <div className="flex-none text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                              {free}/{total.length} left
                            </div>
                          </div>
                          <div className="serif text-[12.5px] italic leading-[1.25] text-muted">
                            {u.question}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3">
            <button
              onClick={() => setUncId(null)}
              className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted hover:text-ink"
            >
              ← All uncertainties
            </button>
            <div className="flex flex-col gap-2">
              {outcomes.map((c) => {
                const owner = takenBy.get(c.id);
                const takenByOther = owner && owner !== team.name;
                return (
                  <button
                    key={c.id}
                    onClick={() => !takenByOther && onPick(c.id)}
                    disabled={busy || Boolean(takenByOther)}
                    className={
                      "rounded-[2px] border px-3 py-2.5 text-left transition-colors " +
                      (takenByOther
                        ? "border-[var(--hairline)] bg-card opacity-45"
                        : "border-[var(--hairline)] bg-card hover:border-ink hover:bg-lime disabled:opacity-50")
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[14px] font-extrabold leading-[1.15]">{c.title}</div>
                      <OutcomeTag card={c} />
                    </div>
                    <div className="mt-0.5 text-[12.5px] leading-[1.4] text-muted">{c.condition}</div>
                    {takenByOther && (
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.07em] text-coral">
                        Taken by {owner}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OutcomeTag({ card }: { card: Card }) {
  if (card.role !== "Edge") return null;
  return (
    <span className="flex-none rounded-[2px] bg-amber px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white">
      Edge
    </span>
  );
}
