"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ScenarioBody } from "@/components/foresight/ScenarioBody";
import { ScenarioTabs } from "@/components/foresight/ScenarioTabs";
import { BrainstormSection } from "@/components/workshop/BrainstormSection";
import { ConfirmModal } from "@/components/ConfirmModal";
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
import { CARD_TEXT_MAX, type RippleCard } from "@/lib/ripples-types";
import { worksheetSteps, type WorksheetSection } from "@/lib/exercise-types";

const NO_CARDS: RippleCard[] = [];

// A spec-driven collaborative worksheet over a shared board. Every input is a STICKY
// ripple_card tagged with its section key, so several named areas live on one board
// and multiple people edit at once with no text clobbering. Two area kinds:
//   - brainstorm → the peel-off sticky pad (BrainstormSection)
//   - question   → a prompt with accumulating answer cards (QuestionSection)
export function WorksheetView({
  code,
  sections,
  title,
  backHref,
  scenario = null,
  drivers = [],
}: {
  code: string;
  sections: WorksheetSection[];
  title: string;
  backHref: string;
  scenario?: Scenario | null;
  drivers?: PublicDriverCard[];
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
  // Sections may be grouped into `step`s, rendered as jump-anywhere tabs. When no step
  // is declared (other worksheet types), `steps` is empty and we fall back to one stack.
  const steps = useMemo(() => worksheetSteps(sections), [sections]);
  const [activeStepIdx, setActiveStepIdx] = useState(0);

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
  const sectionCards = (key: string) => cards.filter((c) => c.order === "STICKY" && c.section === key);

  // Which sections show right now: the active tab's, or all of them when un-stepped.
  const tabbed = steps.length >= 2;
  const activeStep = steps[Math.min(activeStepIdx, steps.length - 1)];
  const visibleSections = tabbed ? sections.filter((s) => s.step === activeStep) : sections;
  // A lone brainstorm section flagged `board` (the Parking lot) gets a taller, board-like canvas.
  const tallCanvas =
    tabbed && visibleSections.length === 1 && visibleSections[0].kind === "brainstorm" && Boolean(visibleSections[0].board);

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
          <button
            onClick={() => setShowScenario((v) => !v)}
            className="rounded-[2px] border border-[#1f33dd] bg-[#1f33dd] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-white hover:opacity-90"
          >
            {showScenario ? "Worksheet" : "View scenario"}
          </button>
        </div>
      </div>

      {showScenario && (
        <div className="mb-6 rounded-[3px] border border-[var(--hairline)] bg-card p-4">
          {scenario ? (
            <ScenarioTabs scenario={scenario} drivers={drivers} />
          ) : (
            <ScenarioBody body={view.config.premise || "No scenario text."} />
          )}
        </div>
      )}

      {!showScenario && (
        <>
          {tabbed && (
        <div
          role="tablist"
          aria-label="Worksheet steps"
          className="mb-6 flex flex-wrap gap-1 border-b border-[var(--rule)]"
        >
          {steps.map((step, i) => {
            const active = i === Math.min(activeStepIdx, steps.length - 1);
            return (
              <button
                key={step}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveStepIdx(i)}
                className={
                  "-mb-px border-b-2 px-3 py-2 text-[12px] font-bold uppercase tracking-[0.06em] transition-colors " +
                  (active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")
                }
              >
                {step}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-8">
        {visibleSections.map((s, i) => {
          const areaCards = sectionCards(s.key);
          const showGroupHead = s.group && s.group !== visibleSections[i - 1]?.group;
          return (
            <div key={s.key}>
              {showGroupHead && (
                <h2 className="mb-3 border-b border-[var(--rule)] pb-1 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
                  {s.group}
                </h2>
              )}
              {s.kind === "brainstorm" ? (
                <BrainstormSection
                  stickies={[...areaCards].sort((a, b) => a.sort - b.sort)}
                  canEdit={mine}
                  busy={busy}
                  readOnly={!editable}
                  tall={tallCanvas}
                  onAdd={(text) => addCard(s.key, text)}
                  onDelete={removeCard}
                  onReorder={reorder}
                  onEdit={editCard}
                  header={<AreaHead label={s.label} help={s.help} />}
                />
              ) : (
                <QuestionSection
                  label={s.label}
                  help={s.help}
                  answers={[...areaCards].sort((a, b) => a.createdTime.localeCompare(b.createdTime))}
                  authorName={(c) => playerNames.get(c.authorPlayerId ?? "") ?? ""}
                  canEdit={mine}
                  busy={busy}
                  readOnly={!editable}
                  onAdd={(text) => addCard(s.key, text)}
                  onDelete={removeCard}
                  onEdit={editCard}
                />
              )}
            </div>
          );
        })}
      </div>
        </>
      )}

      {flash && <Flash msg={flash} />}
    </main>
  );
}

function AreaHead({ label, help }: { label: string; help?: string }) {
  return (
    <div>
      <h3 className="text-[16px] font-extrabold uppercase tracking-tight">{label}</h3>
      {help && <p className="mt-1 text-[13px] leading-[1.5] text-muted">{help}</p>}
    </div>
  );
}

// A structured question: the prompt, then a column of short answer cards (one per
// contribution, attributed) + an "add your answer" row. Concurrency-safe — every
// answer is its own card, so simultaneous typing never conflicts.
function QuestionSection({
  label,
  help,
  answers,
  authorName,
  canEdit,
  busy,
  readOnly,
  onAdd,
  onDelete,
  onEdit,
}: {
  label: string;
  help?: string;
  answers: RippleCard[];
  authorName: (c: RippleCard) => string;
  canEdit: (c: RippleCard) => boolean;
  busy: boolean;
  readOnly: boolean;
  onAdd: (text: string) => void;
  onDelete: (card: RippleCard) => void;
  onEdit: (cardId: string, text: string) => void;
}) {
  const [text, setText] = useState("");
  // Inline edit of one answer at a time (your own only, while the week is unlocked).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [pendingDelete, setPendingDelete] = useState<RippleCard | null>(null);
  const over = text.length > CARD_TEXT_MAX;
  const editOver = editText.length > CARD_TEXT_MAX;
  const submit = () => {
    const t = text.trim();
    if (!t || over) return;
    onAdd(t);
    setText("");
  };
  const startEdit = (c: RippleCard) => {
    setEditingId(c.id);
    setEditText(c.text);
  };
  const commitEdit = () => {
    const id = editingId;
    const original = answers.find((a) => a.id === id)?.text;
    const t = editText.trim();
    setEditingId(null);
    setEditText("");
    if (id && t && !editOver && t !== original) onEdit(id, t);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };
  return (
    <section>
      <AreaHead label={label} help={help} />
      <div className="mt-3 flex flex-col gap-2">
        {answers.length === 0 && (
          <p className="text-[13px] italic text-muted">{readOnly ? "No answers." : "No answers yet — add one below."}</p>
        )}
        {answers.map((c) => {
          const mine = !readOnly && canEdit(c);
          const editing = editingId === c.id;
          return (
            <div
              key={c.id}
              className="group flex items-start justify-between gap-3 rounded-[2px] border border-[var(--hairline)] bg-paper px-3 py-2"
            >
              {editing ? (
                <div className="min-w-0 flex-1">
                  <textarea
                    value={editText}
                    autoFocus
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") cancelEdit();
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commitEdit();
                    }}
                    rows={2}
                    className="w-full resize-none rounded-[2px] border border-black/25 bg-white/70 p-1.5 text-[13.5px] leading-[1.4] outline-none focus:border-ink"
                  />
                  <div className="mt-1 flex items-center justify-end gap-2">
                    <span className={"mr-auto text-[10px] " + (editOver ? "font-bold text-coral" : "text-muted")}>
                      {editText.length}/{CARD_TEXT_MAX}
                    </span>
                    <button
                      onClick={cancelEdit}
                      className="rounded-[2px] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted hover:text-ink"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={commitEdit}
                      disabled={busy || !editText.trim() || editOver}
                      className="rounded-[2px] border border-ink bg-lime px-3 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em] disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="min-w-0">
                    <p className="text-[13.5px] leading-[1.4]">{c.text}</p>
                    {authorName(c) && (
                      <p className="mt-0.5 text-[10px] uppercase tracking-[0.06em] text-muted">— {authorName(c)}</p>
                    )}
                  </div>
                  {mine && (
                    <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => startEdit(c)}
                        className="rounded-[2px] px-1 text-[12px] font-bold text-muted hover:text-ink"
                        aria-label="Edit answer"
                        title="Edit"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => setPendingDelete(c)}
                        className="rounded-[2px] px-1 text-[12px] font-bold text-muted hover:text-coral"
                        aria-label="Delete answer"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {!readOnly && (
        <div className="mt-2 flex items-start gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
            rows={2}
            placeholder="Add your answer…"
            className="flex-1 resize-none rounded-[2px] border border-[var(--hairline)] bg-paper p-2 text-[13px] outline-none focus:border-ink"
          />
          <button
            onClick={submit}
            disabled={busy || !text.trim() || over}
            className="rounded-[2px] border border-ink bg-lime px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        title="Delete answer"
        confirmLabel="Delete"
        busy={busy}
        message={
          <>
            Delete your answer{pendingDelete?.text ? <> “{pendingDelete.text}”</> : ""}? This can’t be undone.
          </>
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </section>
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
