"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ScenarioTabs } from "@/components/foresight/ScenarioTabs";
import { ScenarioPanel } from "@/components/workshop/ScenarioPanel";
import { ScenarioToggle } from "@/components/workshop/ScenarioToggle";
import { ImplicationTree } from "@/components/workshop/ImplicationTree";
import { FuturesWheel } from "@/components/workshop/FuturesWheel";
import { ImplicationList } from "@/components/workshop/ImplicationList";
import { RippleArtBand } from "@/components/workshop/RippleArt";
import { downloadRipplesExport } from "@/components/workshop/ripplesExport";
import type { PublicDriverCard, Scenario } from "@/lib/foresight/types";
import {
  useRipplesView,
  useOptimisticCards,
  patchSession,
  postRipplePlayer,
  postRippleCard,
  patchRippleCard,
  deleteRippleCard,
  reorderRippleCard,
  editRippleCard,
  postRippleSubmit,
} from "@/components/workshop/hooks";
import { useSharedBoardMembership } from "@/components/workshop/membership";
import { BrainstormSection } from "@/components/workshop/BrainstormSection";
import { WorksheetSections } from "@/components/workshop/WorksheetSections";
import {
  PHASE_LABELS,
  type CardOrder,
  type RippleArtImage,
  type RippleCard,
  type RipplesConfig,
  type RipplePhase,
} from "@/lib/ripples-types";
import { type WorksheetSection } from "@/lib/exercise-types";

const MIN_KEY_CHANGES = 3;
const NO_CARDS: RippleCard[] = []; // stable ref so the optimistic overlay doesn't churn

// The finished map reads three ways: a radial futures wheel, the build-time tree,
// or a flat ordered table. Wheel is the default.
type MapView = "wheel" | "tree" | "list";
const MAP_VIEWS: readonly MapView[] = ["wheel", "tree", "list"];
const VIEW_LABELS: Record<MapView, string> = { wheel: "Wheel", tree: "Tree", list: "List" };

// The scenario's first signed image, for the header art band.
function scenarioHero(scenario: Scenario | null): RippleArtImage | undefined {
  if (!scenario) return undefined;
  const img = scenario.images.filter((i) => i.url).sort((a, b) => a.position - b.position)[0];
  return img?.url ? { url: img.url, prompt: img.prompt ?? "" } : undefined;
}

export function RipplesTeamView({
  code,
  basePath = "",
  scenario = null,
  drivers = [],
  hiddenSections,
  sections = [],
}: {
  code: string;
  basePath?: string;
  scenario?: Scenario | null;
  drivers?: PublicDriverCard[];
  hiddenSections?: string[];
  sections?: WorksheetSection[]; // worksheet-style question/brainstorm blocks (implications exercises)
}) {
  const { view, error, loading, refresh } = useRipplesView(code);
  const { pid, nick, saveNick, playerId, join } = useSharedBoardMembership(code, view, refresh);
  // Instant local mutations layered over the (laggy) realtime board.
  const { cards, addLocal, removeLocal, unremoveLocal, reorderLocal, editLocal } = useOptimisticCards(
    view?.cards ?? NO_CARDS
  );
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  // Scenario ↔ exercise swap (shared with WorksheetView): read the scenario first, toggle
  // to the map. Replaces the old always-visible scenario + slide-up worksheet overlay.
  const [showScenario, setShowScenario] = useState(true);
  const heroArt = scenarioHero(scenario);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setFlash(null);
    try {
      await fn();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, []);

  if (loading && !view) return <Centered>Loading session…</Centered>;
  if (error && !view)
    return (
      <Centered>
        <div className="text-center">
          <div className="text-[18px] font-bold">Session {code} not found</div>
          <div className="mt-2 text-[13px] text-muted">{error}</div>
          <Link href={basePath || "/workshop"} className="mt-4 inline-block text-blue underline">
            Try another code
          </Link>
        </div>
      </Centered>
    );
  if (!view) return null;

  const { session, config, teams, players } = view;
  const solo = config.solo;
  const sharedTeam = config.sharedTeam;
  const phase = session.phase as RipplePhase;
  const myPlayer = players.find((p) => p.id === playerId) ?? null;
  const myTeam = myPlayer ? teams.find((t) => t.id === myPlayer.teamId) ?? null : null;

  // ---- not joined yet ----
  if (!myPlayer || !myTeam) {
    if (solo || sharedTeam) {
      return (
        <Shell>
          <PhaseHeader phase={phase} title={config.scenarioTitle} art={heroArt} solo={solo} />
          <Panel>
            <p className="text-[14px] text-muted">
              {sharedTeam ? "Joining your group’s board…" : "Setting up your map…"}
            </p>
          </Panel>
          {flash && <Flash msg={flash} />}
        </Shell>
      );
    }
    return (
      <Shell>
        <PhaseHeader phase={phase} title={config.scenarioTitle} art={heroArt} />
        <JoinPanel
          key={nick}
          teams={teams}
          defaultName={nick}
          busy={busy}
          onJoin={(displayName, teamId, teamName) =>
            run(async () => {
              saveNick(displayName);
              const res = await postRipplePlayer(code, { participantId: pid, displayName, teamId, teamName });
              join(res.player.id);
              refresh(); // show the joined board at once instead of waiting on realtime
            })
          }
        />
        {flash && <Flash msg={flash} />}
      </Shell>
    );
  }

  const myCards = cards.filter((c) => c.teamId === myTeam.id);
  const myTeammates = players.filter((p) => p.teamId === myTeam.id);
  const keyChanges = myCards.filter((c) => c.order === "FIRST");
  const stickies = myCards.filter((c) => c.order === "STICKY").sort((a, b) => a.sort - b.sort);

  const goPhase = (target: RipplePhase) =>
    run(async () => {
      await patchSession(code, { phase: target, phaseEndsAt: null });
    });

  const done = phase === "HARVEST" || phase === "CLOSED";

  // ---- done ----
  if (done) {
    return (
      <Shell wide>
        <PhaseHeader phase={phase} title={config.scenarioTitle} art={heroArt} solo={solo} team={solo ? undefined : myTeam.name} teamColor={myTeam.color} />
        <DoneSummary
          scenario={scenario}
          drivers={drivers}
          hiddenSections={hiddenSections}
          config={config}
          cards={myCards}
          onExport={() => downloadRipplesExport(view)}
          againHref={`${basePath}/play/ripples`}
          closed={phase === "CLOSED"}
        />
        {flash && <Flash msg={flash} />}
      </Shell>
    );
  }

  // ---- lobby (group, waiting) ----
  if (phase === "LOBBY") {
    return (
      <Shell>
        <PhaseHeader phase={phase} title={config.scenarioTitle} art={heroArt} team={myTeam.name} teamColor={myTeam.color} />
        <Panel>
          <h2 className="text-[20px] font-extrabold">You&rsquo;re in.</h2>
          <p className="mt-1 text-[13px] text-muted">
            On <span className="font-bold text-ink">{myTeam.name}</span> with{" "}
            {myTeammates.map((p) => p.displayName).join(", ") || "just you, so far"}. Waiting for the
            facilitator to start.
          </p>
        </Panel>
        {flash && <Flash msg={flash} />}
      </Shell>
    );
  }

  // ---- PREMISE + BUILD: scenario backdrop, worksheet sheet over it ----
  const building = phase === "BUILD";

  // Optimistic writes: reflect the change locally the instant it happens, then let
  // the realtime refetch reconcile. No refresh() round-trip in the hot path — that's
  // what made adds feel slow and (via a fresh cards array) reflowed the tree.
  const addCard = (order: CardOrder, text: string, parentId?: string, sort?: number) =>
    run(async () => {
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: order,
        text,
        parentCardId: parentId ?? null,
        sort,
      });
      if (res?.card) addLocal(res.card as RippleCard); // show the real card at once
    });
  const removeCard = (card: RippleCard) => {
    removeLocal(card.id); // vanish immediately (filtered realtime DELETEs don't fire anyway)
    run(async () => {
      try {
        await deleteRippleCard(code, card.id, { participantId: pid });
      } catch (e) {
        unremoveLocal(card.id); // put it back if the server refused
        throw e;
      }
    });
  };
  const reorderSticky = (cardId: string, sort: number) => {
    const prevSort = stickies.find((s) => s.id === cardId)?.sort;
    reorderLocal(cardId, sort); // move immediately
    run(async () => {
      try {
        await reorderRippleCard(code, cardId, { participantId: pid, sort });
      } catch (e) {
        if (prevSort !== undefined) reorderLocal(cardId, prevSort); // snap back on failure
        throw e;
      }
    });
  };
  const editCard = (cardId: string, text: string) => {
    const prevText = cards.find((c) => c.id === cardId)?.text;
    editLocal(cardId, text); // show the new text immediately
    run(async () => {
      try {
        await editRippleCard(code, cardId, { participantId: pid, text });
      } catch (e) {
        if (prevText !== undefined) editLocal(cardId, prevText); // revert on failure
        throw e;
      }
    });
  };

  // Worksheet-style question/brainstorm blocks an implications exercise can carry, rendered
  // below the tree via the shared <WorksheetSections> — same STICKY-card substrate. On a
  // shared-team board the whole group co-owns them; solo stays author-only.
  const canEditCard = sharedTeam ? () => true : (c: RippleCard) => c.authorPlayerId === myPlayer.id;
  const playerNames = new Map<string, string>(players.map((p) => [p.id, p.displayName] as const));
  const addSectionCard = (section: string, text: string) =>
    run(async () => {
      const res = await postRippleCard(code, {
        participantId: pid,
        cardOrder: "STICKY",
        text,
        section,
        sort: Date.now(),
      });
      if (res?.card) addLocal(res.card as RippleCard);
    });
  const reorderSectionCard = (cardId: string, sort: number) => {
    const prev = cards.find((c) => c.id === cardId)?.sort;
    reorderLocal(cardId, sort);
    run(async () => {
      try {
        await reorderRippleCard(code, cardId, { participantId: pid, sort });
      } catch (e) {
        if (prev !== undefined) reorderLocal(cardId, prev);
        throw e;
      }
    });
  };

  // Members in a facilitated PREMISE just read + wait; solo self-advances into BUILD.
  const canBuild = solo || building;
  const toggleScenario = () => {
    if (!showScenario) {
      setShowScenario(true);
      return;
    }
    if (!building) goPhase("BUILD"); // solo: advance into the build phase on first go
    setShowScenario(false);
  };

  return (
    <Shell wide>
      <PhaseHeader
        phase={phase}
        title={config.scenarioTitle}
        art={heroArt}
        solo={solo}
        team={solo ? undefined : myTeam.name}
        teamColor={myTeam.color}
        right={
          canBuild ? (
            <ScenarioToggle
              showingScenario={showScenario}
              exerciseLabel="Build the map"
              onToggle={toggleScenario}
              disabled={busy}
            />
          ) : undefined
        }
      />

      {showScenario || !canBuild ? (
        <>
          {phase === "PREMISE" && !solo && (
            <p className="mb-5 text-[13px] text-muted">Read the scenario. The facilitator will open the map.</p>
          )}
          <ScenarioPanel
            scenario={scenario}
            drivers={drivers}
            hiddenSections={hiddenSections}
            premise={config.premise}
          />
        </>
      ) : building ? (
        <div className="flex flex-col gap-8">
          <BrainstormSection
            stickies={stickies}
            canEdit={(c) => c.authorPlayerId === myPlayer.id}
            busy={busy}
            onAdd={(text) => addCard("STICKY", text, undefined, Date.now())}
            onDelete={removeCard}
            onReorder={reorderSticky}
            onEdit={editCard}
            header={
              <SectionHead n={1} title="Brainstorm key changes">
                Peel a note off the pad for each thing that changes in this world.{" "}
                <span className="font-semibold text-ink">Click a note to edit it</span>, drag to
                reorder. These are just notes, separate from the tree below.
              </SectionHead>
            }
          />

          <section>
            <SectionHead n={2} title="Map the implications">
              Start from the scenario: add key changes, then branch each forward — “Because of that…”, then “And this causes…”.
            </SectionHead>
            <div className="mt-3">
              <ImplicationTree
                cards={myCards}
                scenarioTitle={config.scenarioTitle}
                interactive
                busy={busy}
                challengeEnabled={config.challengeEnabled}
                canDelete={(c) => c.authorPlayerId === myPlayer.id}
                onAddRoot={(text) => addCard("FIRST", text)}
                onAddChild={(parent, order, text) => addCard(order, text, parent.id)}
                onDelete={removeCard}
                onFlag={(card) => run(async () => { await patchRippleCard(code, card.id, { action: "flag", participantId: pid }); })}
                onVote={(card) => run(async () => { await patchRippleCard(code, card.id, { action: "vote", participantId: pid }); })}
              />
            </div>
          </section>

          {sections.length > 0 && (
            <section>
              <SectionHead n={3} title="Questions">
                Answer these together — responses save to the shared board.
              </SectionHead>
              <div className="mt-3">
                <WorksheetSections
                  sections={sections}
                  cards={cards}
                  editable={building}
                  canEdit={canEditCard}
                  busy={busy}
                  playerNames={playerNames}
                  onAdd={addSectionCard}
                  onDelete={removeCard}
                  onEdit={editCard}
                  onReorder={reorderSectionCard}
                />
              </div>
            </section>
          )}

          {/* Reflection questions moved to a separate workshop (kept in git history). Shared
              boards (design groups) are self-paced and async — an admin finalizes the map. */}
          {sharedTeam ? (
            <div className="border-t border-[var(--rule)] pt-6 text-[12px] italic text-muted">
              This is your group&rsquo;s shared board — build it together, whenever. A
              facilitator will finalize the map when the group is done.
            </div>
          ) : (
            <div className="flex items-center gap-3 border-t border-[var(--rule)] pt-6">
              <button
                onClick={() =>
                  run(async () => {
                    await postRippleSubmit(code, { participantId: pid, answers: [] });
                    if (solo) await patchSession(code, { phase: "HARVEST", phaseEndsAt: null });
                  })
                }
                disabled={busy || keyChanges.length < MIN_KEY_CHANGES}
                className="rounded-[2px] border border-ink bg-lime px-5 py-2 text-[12px] font-bold uppercase tracking-[0.08em] hover:bg-lime-deep disabled:opacity-40"
              >
                {myPlayer.submittedAt ? "Update map" : "Submit map"} →
              </button>
              {keyChanges.length < MIN_KEY_CHANGES && (
                <span className="text-[12px] italic text-muted">
                  Add at least {MIN_KEY_CHANGES} key changes first.
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <Panel>
          <p className="text-[14px] text-muted">Opening the map…</p>
        </Panel>
      )}

      {flash && <Flash msg={flash} />}
    </Shell>
  );
}

function SectionHead({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-[18px] font-extrabold uppercase tracking-tight">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink bg-lime text-[13px]">
          {n}
        </span>
        {title}
      </h2>
      {children && <p className="mt-1 text-[13px] leading-[1.5] text-muted">{children}</p>}
    </div>
  );
}

// NOTE: the reflection "Reflect" step (QuestionsSection) was removed from the
// worksheet for now — reflection is becoming its own workshop. It lives in git
// history if we want it back.

// ---------- done: the finished map ----------
function DoneSummary({
  scenario,
  drivers,
  hiddenSections,
  config,
  cards,
  onExport,
  againHref,
  closed,
}: {
  scenario: Scenario | null;
  drivers: PublicDriverCard[];
  hiddenSections?: string[];
  config: RipplesConfig;
  cards: RippleCard[];
  onExport: () => void;
  againHref: string;
  closed: boolean;
}) {
  const [view, setView] = useState<MapView>("wheel");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-extrabold uppercase tracking-tight">Your map</h2>
          <p className="text-[13px] text-muted">{cards.length} nodes.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Three ways to read the same map. */}
          <div className="mr-1 flex overflow-hidden rounded-[2px] border border-ink">
            {MAP_VIEWS.map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={
                  "px-3 py-2 text-[11px] font-bold uppercase tracking-[0.06em] " +
                  (view === v ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-lime")
                }
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
          <button
            onClick={onExport}
            className="rounded-[2px] border border-ink bg-paper px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime"
          >
            ↓ Export
          </button>
          {!closed && (
            <Link
              href={againHref}
              className="rounded-[2px] border border-ink bg-lime px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep"
            >
              Do it again →
            </Link>
          )}
        </div>
      </div>

      {view === "wheel" ? (
        <FuturesWheel cards={cards} centerLabel={config.scenarioTitle} />
      ) : view === "tree" ? (
        <ImplicationTree cards={cards} scenarioTitle={config.scenarioTitle} />
      ) : (
        <ImplicationList cards={cards} scenarioTitle={config.scenarioTitle} />
      )}

      {scenario && (
        <details className="rounded-[3px] border border-[var(--hairline)] bg-card p-4">
          <summary className="cursor-pointer text-[12px] font-bold uppercase tracking-[0.08em] text-muted">
            Revisit the scenario
          </summary>
          <div className="mt-4">
            <ScenarioTabs scenario={scenario} drivers={drivers} hiddenSections={hiddenSections} />
          </div>
        </details>
      )}

      {closed && <p className="text-[13px] italic text-muted">This session is closed.</p>}
    </div>
  );
}

// ---------- shared pieces ----------
function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={"mx-auto min-h-screen px-5 py-6 " + (wide ? "max-w-[1100px]" : "max-w-[820px]")}>
      {children}
    </main>
  );
}

function PhaseHeader({
  phase,
  title,
  team,
  teamColor,
  art,
  solo,
  right,
}: {
  phase: RipplePhase;
  title: string;
  team?: string;
  teamColor?: string;
  art?: RippleArtImage;
  solo?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <div className="relative mb-5 overflow-hidden border-b border-[var(--rule)]">
      <RippleArtBand image={art} />
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 pt-1">
        <div>
          <span className="eyebrow blue">
            {solo ? "Implication mapping · solo" : "Implication mapping"} · {PHASE_LABELS[phase]}
          </span>
          <h1 className="mt-1 text-[22px] font-extrabold uppercase leading-[1.05] tracking-tight">
            {title || "Implication mapping"}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {team && (
            <span className="inline-flex items-center gap-2 text-[13px] font-bold">
              <span className="inline-block h-3.5 w-3.5 rounded-[2px] border border-ink" style={{ background: teamColor }} />
              {team}
            </span>
          )}
          {right}
        </div>
      </div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[3px] border border-[var(--hairline)] bg-card p-5">{children}</div>;
}

function JoinPanel({
  teams,
  defaultName,
  busy,
  onJoin,
}: {
  teams: { id: string; name: string; color: string }[];
  defaultName: string;
  busy: boolean;
  onJoin: (displayName: string, teamId?: string, teamName?: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [teamName, setTeamName] = useState("");
  const ready = name.trim().length > 0;
  return (
    <Panel>
      <h2 className="text-[20px] font-extrabold">Join the room</h2>
      <label className="mt-4 block text-[12px] font-bold uppercase tracking-[0.08em] text-muted">Your name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Sam"
        className="mt-1 w-full rounded-[2px] border border-[var(--hairline)] bg-paper p-2 text-[14px] outline-none focus:border-ink"
      />
      {teams.length > 0 && (
        <>
          <div className="mt-5 text-[12px] font-bold uppercase tracking-[0.08em] text-muted">Join a team</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {teams.map((t) => (
              <button
                key={t.id}
                disabled={busy || !ready}
                onClick={() => onJoin(name.trim(), t.id)}
                className="inline-flex items-center gap-2 rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[13px] font-semibold hover:bg-lime disabled:opacity-40"
              >
                <span className="inline-block h-3 w-3 rounded-[2px] border border-ink" style={{ background: t.color }} />
                {t.name}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="mt-5 text-[12px] font-bold uppercase tracking-[0.08em] text-muted">
        {teams.length > 0 ? "…or start a new team" : "Start a team"}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="Team name (optional)"
          className="flex-1 rounded-[2px] border border-[var(--hairline)] bg-paper p-2 text-[14px] outline-none focus:border-ink"
        />
        <button
          disabled={busy || !ready}
          onClick={() => onJoin(name.trim(), undefined, teamName.trim() || undefined)}
          className="rounded-[2px] border border-ink bg-lime px-4 py-2 text-[12px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep disabled:opacity-40"
        >
          Create &amp; join
        </button>
      </div>
    </Panel>
  );
}

function Flash({ msg }: { msg: string }) {
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-[3px] border border-coral bg-card px-4 py-2 text-[13px] font-semibold text-coral shadow">
      {msg}
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
