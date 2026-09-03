"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ScenarioPanel } from "@/components/workshop/ScenarioPanel";
import { ScenarioToggle } from "@/components/workshop/ScenarioToggle";
import { WorksheetSections } from "@/components/workshop/WorksheetSections";
import {
  useRipplesView,
  useOptimisticCards,
  postRippleCard,
  deleteRippleCard,
  reorderRippleCard,
  editRippleCard,
} from "@/components/workshop/hooks";
import { useSharedBoardMembership } from "@/components/workshop/membership";
import type { PublicDriverCard, Scenario } from "@/lib/foresight/types";
import { type RippleCard } from "@/lib/ripples-types";
import { type WorksheetSection } from "@/lib/exercise-types";

const NO_CARDS: RippleCard[] = [];

// A spec-driven collaborative worksheet over a shared board. Every input is a STICKY
// ripple_card tagged with its section key, so several named areas live on one board and
// multiple people edit at once with no text clobbering. The section body (question +
// brainstorm areas, optional tabs) is rendered by the shared <WorksheetSections>, which
// the implications board reuses below its tree.
export function WorksheetView({
  code,
  sections,
  title,
  backHref,
  scenario = null,
  drivers = [],
  hiddenSections,
}: {
  code: string;
  sections: WorksheetSection[];
  title: string;
  backHref: string;
  scenario?: Scenario | null;
  drivers?: PublicDriverCard[];
  hiddenSections?: string[]; // project-hidden scenario page-2 sections (passed to ScenarioTabs)
}) {
  const { view, error, loading, refresh } = useRipplesView(code);
  const { pid, playerId } = useSharedBoardMembership(code, view, refresh);
  const { cards, addLocal, removeLocal, unremoveLocal, reorderLocal, editLocal } = useOptimisticCards(
    view?.cards ?? NO_CARDS
  );
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  // Week 1 lands on the scenario; the worksheet opens when they hit "Start worksheet".
  const [showScenario, setShowScenario] = useState(true);

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

  const playerNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of view?.players ?? []) m.set(p.id, p.displayName);
    return m;
  }, [view?.players]);

  if (loading && !view) return <Centered>Loading…</Centered>;
  if (error && !view) return <Centered>Couldn&rsquo;t load this exercise. {error}</Centered>;
  if (!view) return null;

  const myPlayer = view.players.find((p) => p.id === playerId) ?? null;
  if (!myPlayer) return <Centered>Joining your group&rsquo;s board…</Centered>;

  // BUILD = editable; a locked exercise sits in HARVEST (read-only output).
  const editable = view.session.phase === "BUILD";
  const mine = (c: RippleCard) => c.authorPlayerId === myPlayer.id;
  // On a shared-team board (design groups) the whole group co-owns the worksheet, so any
  // member may edit/delete any card; on a solo board it stays author-only.
  const canEditCard = view.config.sharedTeam ? () => true : mine;

  const addCard = (section: string, text: string) =>
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
  const removeCard = (card: RippleCard) => {
    removeLocal(card.id);
    run(async () => {
      try {
        await deleteRippleCard(code, card.id, { participantId: pid });
      } catch (e) {
        unremoveLocal(card.id);
        throw e;
      }
    });
  };
  const editCard = (cardId: string, text: string) => {
    const prev = cards.find((c) => c.id === cardId)?.text;
    editLocal(cardId, text);
    run(async () => {
      try {
        await editRippleCard(code, cardId, { participantId: pid, text });
      } catch (e) {
        if (prev !== undefined) editLocal(cardId, prev);
        throw e;
      }
    });
  };
  const reorder = (cardId: string, sort: number) => {
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

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-5 py-6">
      {/* program bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule)] pb-3">
        <div className="min-w-0">
          <Link href={backHref} className="eyebrow blue">
            ← Program
          </Link>
          <h1 className="mt-1 truncate text-[24px] font-extrabold uppercase leading-[1.05] tracking-tight">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!editable && (
            <span className="rounded-[2px] bg-blue px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-white">
              Locked
            </span>
          )}
          <ScenarioToggle
            showingScenario={showScenario}
            exerciseLabel="Worksheet"
            onToggle={() => setShowScenario((v) => !v)}
          />
        </div>
      </div>

      {showScenario && (
        <div className="mb-6">
          <ScenarioPanel
            scenario={scenario}
            drivers={drivers}
            hiddenSections={hiddenSections}
            premise={view.config.premise}
          />
        </div>
      )}

      {!showScenario && (
        <WorksheetSections
          sections={sections}
          cards={cards}
          editable={editable}
          canEdit={canEditCard}
          busy={busy}
          playerNames={playerNames}
          onAdd={addCard}
          onDelete={removeCard}
          onEdit={editCard}
          onReorder={reorder}
        />
      )}

      {flash && <Flash msg={flash} />}
    </main>
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
    <main className="flex min-h-screen items-center justify-center px-6 text-[15px] text-muted">{children}</main>
  );
}
