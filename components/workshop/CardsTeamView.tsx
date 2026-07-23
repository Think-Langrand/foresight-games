"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useCardsView, postTeam, patchTeam } from "@/components/workshop/hooks";
import { CardArtBand, DriverChips, roleHex } from "@/components/workshop/CardArt";
import { ScenarioWizard } from "@/components/workshop/ScenarioWizard";
import type { DriverLite } from "@/lib/drivers-shared";
import {
  DOMAIN_ORDER,
  teamTriadIds,
  type Card,
  type Deck,
  type Team,
  type UncertaintyLite,
} from "@/lib/workshop-types";

// Which team (if any) this device has joined — persisted per session/device.
function useJoinedTeam(code: string) {
  const key = `fpw:${code}:team`;
  const [teamId, setTeamId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setTeamId(localStorage.getItem(key));
    } catch {
      setTeamId(null);
    }
  }, [key]);
  const join = useCallback(
    (id: string) => {
      setTeamId(id);
      localStorage.setItem(key, id);
    },
    [key]
  );
  const leave = useCallback(() => {
    setTeamId(null);
    localStorage.removeItem(key);
  }, [key]);
  return { teamId, join, leave };
}

export function CardsTeamView({
  code,
  deck,
  drivers,
}: {
  code: string;
  deck: Deck;
  drivers: DriverLite[];
}) {
  const { view, error, loading, refresh } = useCardsView(code, 4000);
  const { teamId, join, leave } = useJoinedTeam(code);
  const byId = useMemo(() => new Map(deck.cards.map((c) => [c.id, c])), [deck]);
  const uncById = useMemo(
    () => new Map(deck.uncertainties.map((u) => [u.id, u])),
    [deck]
  );
  const driversBySlug = useMemo(() => new Map(drivers.map((d) => [d.slug, d])), [drivers]);

  if (loading && !view) return <Centered>Loading session…</Centered>;
  if (error && !view)
    return (
      <Centered>
        <div className="text-center">
          <div className="text-[18px] font-bold">Session {code} not found</div>
          <div className="mt-2 text-[13px] text-muted">{error}</div>
          <Link href="/workshop" className="mt-4 inline-block text-blue underline">
            Try another code
          </Link>
        </div>
      </Centered>
    );
  if (!view) return null;

  const { session, teams } = view;
  const closed = session.status === "Closed";
  const myTeam = teams.find((t) => t.id === teamId) ?? null;

  if (!myTeam) {
    return (
      <TeamLobby
        code={code}
        prompt={session.prompt}
        teams={teams}
        closed={closed}
        onJoin={join}
        onCreated={(id) => {
          join(id);
          refresh();
        }}
      />
    );
  }

  return (
    <TeamPlay
      code={code}
      prompt={session.prompt}
      team={myTeam}
      byId={byId}
      uncertainties={deck.uncertainties}
      uncById={uncById}
      driversBySlug={driversBySlug}
      closed={closed}
      onLeave={leave}
      onChange={refresh}
    />
  );
}

// ---------------------------------------------------------------- lobby
function TeamLobby({
  code,
  prompt,
  teams,
  closed,
  onJoin,
  onCreated,
}: {
  code: string;
  prompt: string;
  teams: Team[];
  closed: boolean;
  onJoin: (id: string) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const { team } = await postTeam(code, { name: name.trim() });
      onCreated(team.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create team");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-[560px] px-5 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <span className="eyebrow blue">Scenario cards</span>
        <span className="rounded-[2px] border border-ink bg-lime px-2 py-1 text-[11px] font-bold uppercase tracking-[0.14em]">
          {code}
        </span>
      </div>
      <h1 className="mt-3 text-[26px] font-extrabold uppercase leading-[1.06] tracking-tight">
        Join a team
      </h1>
      <p className="serif mt-2 text-[17px] italic leading-[1.35] text-muted">{prompt}</p>

      {closed && <Banner>This session is closed.</Banner>}

      {teams.length > 0 && (
        <div className="mt-6">
          <span className="eyebrow ink">Teams in play</span>
          <div className="mt-3 flex flex-col gap-2">
            {teams.map((t) => (
              <button
                key={t.id}
                onClick={() => onJoin(t.id)}
                className="flex items-center gap-3 rounded-[2px] border border-[var(--hairline)] bg-card px-4 py-3 text-left transition-colors hover:border-ink"
              >
                <Swatch hex={t.color} />
                <span className="flex-1 text-[15px] font-bold">{t.name}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                  {t.status === "Submitted" ? "Submitted" : "Drafting"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!closed && (
        <div className="mt-6 rounded-[3px] border border-[var(--hairline)] bg-card p-4">
          <span className="eyebrow">Start a new team</span>
          <div className="mt-3 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Team ${teams.length + 1}`}
              maxLength={60}
              className="flex-1 rounded-[2px] border border-[var(--hairline)] bg-paper px-3 py-2.5 text-[14px] outline-none focus:border-ink"
            />
            <button
              onClick={create}
              disabled={busy}
              className="rounded-[2px] border border-ink bg-lime px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-lime-deep disabled:opacity-50"
            >
              {busy ? "Dealing…" : "Deal in →"}
            </button>
          </div>
          {err && <div className="mt-2 text-[13px] font-semibold text-coral">{err}</div>}
          <p className="mt-2 text-[12px] leading-[1.5] text-muted">
            Your team gets one locked uncertainty to start, then picks two more to build a
            three-card world. One shared device or a phone each.
          </p>
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------- play
type PickerState = { slot: 1 | 2 | 3; uncertaintyId: string | null };

function TeamPlay({
  code,
  prompt,
  team,
  byId,
  uncertainties,
  uncById,
  driversBySlug,
  closed,
  onLeave,
  onChange,
}: {
  code: string;
  prompt: string;
  team: Team;
  byId: Map<string, Card>;
  uncertainties: UncertaintyLite[];
  uncById: Map<string, UncertaintyLite>;
  driversBySlug: Map<string, DriverLite>;
  closed: boolean;
  onLeave: () => void;
  onChange: () => void;
}) {
  const submitted = team.status === "Submitted";
  const locked = closed || submitted;
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [busy, setBusy] = useState(false);

  const seedUnc = uncById.get(team.seedUncertaintyId);
  const slot1 = team.seedCardId ? byId.get(team.seedCardId) : undefined;
  const slot2 = team.keptIds[0] ? byId.get(team.keptIds[0]) : undefined;
  const slot3 = team.keptIds[1] ? byId.get(team.keptIds[1]) : undefined;

  // Uncertainty ids already used across the filled slots.
  const usedUncIds = (exceptSlot: 1 | 2 | 3) => {
    const s = new Set<string>([team.seedUncertaintyId]);
    if (exceptSlot !== 2 && slot2) s.add(slot2.uncertaintyId);
    if (exceptSlot !== 3 && slot3) s.add(slot3.uncertaintyId);
    return s;
  };

  const save = useCallback(
    async (body: { seedCardId?: string; keptIds?: string[] }) => {
      setBusy(true);
      try {
        await patchTeam(code, team.id, body);
        onChange();
      } finally {
        setBusy(false);
      }
    },
    [code, team.id, onChange]
  );

  async function chooseOutcome(slot: 1 | 2 | 3, cardId: string) {
    if (slot === 1) await save({ seedCardId: cardId });
    else {
      const kept = [team.keptIds[0], team.keptIds[1]];
      kept[slot - 2] = cardId;
      await save({ keptIds: kept.filter(Boolean) as string[] });
    }
    setPicker(null);
  }

  const triadReady = Boolean(team.seedCardId) && team.keptIds.length === 2;
  const triadCards = teamTriadIds(team)
    .map((id) => byId.get(id))
    .filter((c): c is Card => Boolean(c));
  const hasEdge = triadCards.some((c) => c.role === "Edge" || c.role === "Wildcard");

  const slotDefs = [
    { slot: 1 as const, card: slot1, lockedUnc: seedUnc },
    { slot: 2 as const, card: slot2, lockedUnc: undefined },
    { slot: 3 as const, card: slot3, lockedUnc: undefined },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-[640px] px-5 pb-28 pt-6 lg:max-w-[1080px]">
      <div className="lg:mx-auto lg:max-w-[720px]">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <Swatch hex={team.color} />
            <span className="text-[15px] font-extrabold">{team.name}</span>
          </span>
          <span className="rounded-[2px] border border-ink bg-lime px-2 py-1 text-[11px] font-bold uppercase tracking-[0.14em]">
            {code}
          </span>
        </div>
        <p className="serif mt-3 text-[17px] italic leading-[1.35] text-muted">{prompt}</p>

        {closed && <Banner>This session is closed.</Banner>}
        {submitted && !closed && <Banner>Scenario submitted. Scroll down to review it.</Banner>}
      </div>

      {/* Three slots — stacked on mobile, spread across on desktop */}
      <div className="mt-6">
        <div className="lg:mx-auto lg:max-w-[720px]">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow ink">Build your three-card world</span>
            <span className="text-[11px] font-bold text-muted">
              {[slot1, slot2, slot3].filter(Boolean).length}/3 chosen
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-[1.5] text-muted">
            Slot one is locked to your uncertainty — choose an outcome for it. Then pick two more
            uncertainties and an outcome for each.
          </p>
        </div>
        <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-3">
          {slotDefs.map(({ slot, card, lockedUnc }) => {
            const prevFilled = slot === 1 || (slot === 2 ? Boolean(slot1) : Boolean(slot1 && slot2));
            return (
              <SlotButton
                key={slot}
                index={slot}
                card={card}
                lockedUnc={lockedUnc}
                disabled={locked || !prevFilled}
                onOpen={() =>
                  setPicker({ slot, uncertaintyId: slot === 1 ? team.seedUncertaintyId : null })
                }
              />
            );
          })}
        </div>
      </div>

      {/* Triad → scenario wizard */}
      <div className="lg:mx-auto lg:max-w-[760px]">
        {triadReady && (
          <ScenarioWizard
            code={code}
            team={team}
            triad={triadCards}
            hasEdge={hasEdge}
            wildcard={team.wildcardId ? byId.get(team.wildcardId) ?? null : null}
            locked={locked}
            driversBySlug={driversBySlug}
            onChange={onChange}
          />
        )}

        <button
          onClick={onLeave}
          className="mt-10 text-[11px] font-bold uppercase tracking-[0.08em] text-muted underline"
        >
          Leave this team on this device
        </button>
      </div>

      {picker && !locked && (
        <PickerModal
          picker={picker}
          setPicker={setPicker}
          uncertainties={uncertainties}
          uncById={uncById}
          byId={byId}
          driversBySlug={driversBySlug}
          excludeUncIds={usedUncIds(picker.slot)}
          busy={busy}
          onChoose={chooseOutcome}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------- slot
function SlotButton({
  index,
  card,
  lockedUnc,
  disabled,
  onOpen,
}: {
  index: number;
  card?: Card;
  lockedUnc?: UncertaintyLite;
  disabled: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      disabled={disabled}
      className="flex h-full w-full flex-col text-left disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-paper">
          {index}
        </span>
        {index === 1 && (
          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">
            Locked uncertainty
          </span>
        )}
      </div>
      {card ? (
        <div className="flex-1 rounded-[6px] ring-2 ring-ink ring-offset-2 ring-offset-paper">
          <CardFace card={card} tone="kept" />
        </div>
      ) : lockedUnc ? (
        // Slot 1 empty: show the locked uncertainty, prompt to choose an outcome.
        <div className="flex flex-1 flex-col rounded-[6px] border-2 border-dashed border-ink bg-card p-4 transition-colors hover:bg-lime">
          <div className="text-[8.5px] font-bold uppercase tracking-[0.14em] text-blue">
            Uncertainty
          </div>
          <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-muted">
            {lockedUnc.domain}
          </div>
          <div className="mt-1 text-[16px] font-extrabold leading-[1.15]">{lockedUnc.title}</div>
          <p className="serif mt-2 text-[15.5px] italic leading-[1.35]">{lockedUnc.question}</p>
          <div className="mt-auto pt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-blue">
            Tap to choose an outcome →
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-[6px] border-2 border-dashed border-[var(--hairline)] bg-card px-4 py-7 text-center transition-colors hover:border-ink hover:bg-lime">
          <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
            + Pick an uncertainty
          </span>
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------- picker modal
function PickerModal({
  picker,
  setPicker,
  uncertainties,
  uncById,
  byId,
  driversBySlug,
  excludeUncIds,
  busy,
  onChoose,
}: {
  picker: PickerState;
  setPicker: (p: PickerState | null) => void;
  uncertainties: UncertaintyLite[];
  uncById: Map<string, UncertaintyLite>;
  byId: Map<string, Card>;
  driversBySlug: Map<string, DriverLite>;
  excludeUncIds: Set<string>;
  busy: boolean;
  onChoose: (slot: 1 | 2 | 3, cardId: string) => void;
}) {
  const activeUnc = picker.uncertaintyId ? uncById.get(picker.uncertaintyId) : null;
  const showBoard = picker.slot !== 1 && !activeUnc;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(20,20,18,0.5)] sm:items-center"
      onClick={() => setPicker(null)}
    >
      <div
        className="max-h-[88vh] w-full max-w-[600px] overflow-y-auto rounded-t-[8px] border border-ink bg-paper p-5 sm:rounded-[8px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="eyebrow ink">
            {showBoard
              ? `Slot ${picker.slot} · pick an uncertainty`
              : `Slot ${picker.slot} · pick an outcome`}
          </span>
          <button
            onClick={() => setPicker(null)}
            className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted hover:text-ink"
          >
            Close ✕
          </button>
        </div>

        {showBoard ? (
          <UncertaintyBoard
            uncertainties={uncertainties}
            excludeUncIds={excludeUncIds}
            onPick={(id) => setPicker({ ...picker, uncertaintyId: id })}
          />
        ) : (
          activeUnc && (
            <div className="mt-3">
              {picker.slot !== 1 && (
                <button
                  onClick={() => setPicker({ ...picker, uncertaintyId: null })}
                  className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted hover:text-ink"
                >
                  ← All uncertainties
                </button>
              )}
              <div className="text-[8.5px] font-bold uppercase tracking-[0.14em] text-blue">
                Uncertainty
              </div>
              <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-muted">
                {activeUnc.domain}
              </div>
              <div className="mt-1 text-[18px] font-extrabold leading-[1.12]">{activeUnc.title}</div>
              <p className="serif mt-1.5 text-[16px] italic leading-[1.35]">{activeUnc.question}</p>
              <DriverChips
                sourceDriverIds={activeUnc.sourceDriverIds}
                driversBySlug={driversBySlug}
              />
              <div className="mt-3 flex flex-col gap-2.5">
                {activeUnc.outcomeCodes.map((code, i) => {
                  const c = byId.get(code);
                  if (!c) return null;
                  return (
                    <button
                      key={code}
                      onClick={() => onChoose(picker.slot, code)}
                      disabled={busy}
                      className="animate-deal block text-left disabled:opacity-50"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <CardFace card={c} tone="hand" hideQuestion />
                    </button>
                  );
                })}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function UncertaintyBoard({
  uncertainties,
  excludeUncIds,
  onPick,
}: {
  uncertainties: UncertaintyLite[];
  excludeUncIds: Set<string>;
  onPick: (id: string) => void;
}) {
  const domains = DOMAIN_ORDER.filter((d) => uncertainties.some((u) => u.domain === d));
  return (
    <div className="mt-3 flex flex-col gap-4">
      {domains.map((domain) => {
        const items = uncertainties.filter((u) => u.domain === domain);
        return (
          <div key={domain}>
            <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-blue">
              {domain}
            </div>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {items.map((u) => {
                const used = excludeUncIds.has(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => !used && onPick(u.id)}
                    disabled={used}
                    className={
                      "rounded-[2px] border px-3 py-2 text-left transition-colors " +
                      (used
                        ? "border-[var(--hairline)] bg-card opacity-40"
                        : "border-[var(--hairline)] bg-card hover:border-ink hover:bg-lime")
                    }
                  >
                    <div className="text-[14px] font-bold leading-[1.15]">{u.title}</div>
                    <div className="serif text-[12.5px] italic leading-[1.25] text-muted">
                      {u.question}
                    </div>
                    {used && (
                      <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-muted">
                        Already in play
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- card face
function CardFace({
  card,
  tone,
  hideQuestion,
}: {
  card: Card;
  tone: "hand" | "kept";
  hideQuestion?: boolean;
}) {
  const base =
    tone === "kept" ? "border-ink bg-lime" : "border-[var(--hairline)] bg-card hover:border-ink";
  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-[6px] border transition-all ${base}`}>
      <div className="relative">
        <CardArtBand dimension={card.dimension} height={52} />
        <div className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: roleHex(card.role) }} />
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        {/* Uncertainty — the open question this card answers */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[8.5px] font-bold uppercase tracking-[0.14em] text-blue">
              Uncertainty
            </div>
            <div className="mt-0.5 text-[11.5px] font-bold uppercase leading-[1.15] tracking-[0.03em] text-muted">
              {card.dimension}
            </div>
          </div>
          <RoleBadge role={card.role} />
        </div>
        {!hideQuestion && card.seedingQuestion && (
          <p className="serif mt-2 text-[15.5px] italic leading-[1.35]">{card.seedingQuestion}</p>
        )}
        {/* Outcome — one way that uncertainty could resolve */}
        <div className="mt-3 border-t border-[var(--hairline)] pt-3">
          <div className="text-[8.5px] font-bold uppercase tracking-[0.14em] text-ink">Outcome</div>
          <div className="mt-1 text-[16px] font-extrabold leading-[1.15]">{card.title}</div>
          <div className="mt-1.5 text-[13.5px] leading-[1.45]">{card.condition}</div>
        </div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: Card["role"] }) {
  if (role === "Core") return null;
  return (
    <span
      className="rounded-[2px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white"
      style={{ background: roleHex(role) }}
    >
      {role}
    </span>
  );
}

function Swatch({ hex }: { hex: string }) {
  return (
    <span
      className="inline-block h-4 w-4 flex-none rounded-[2px] border border-ink"
      style={{ background: hex }}
    />
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-[2px] border border-[var(--hairline)] bg-lime px-4 py-3 text-[13px] font-semibold">
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-[15px] text-muted">
      {children}
    </main>
  );
}
