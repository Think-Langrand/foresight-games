"use client";

import { useMemo, useState } from "react";
import { BrainstormSection } from "@/components/workshop/BrainstormSection";
import { ConfirmModal } from "@/components/ConfirmModal";
import { CARD_TEXT_MAX, type RippleCard } from "@/lib/ripples-types";
import { worksheetSteps, type WorksheetSection } from "@/lib/exercise-types";

// The collaborative worksheet body: a spec-driven set of STICKY-card areas over a shared
// board, optionally split into jump-anywhere tabs by each section's `step`. Two area kinds:
//   - brainstorm → the peel-off sticky pad (BrainstormSection)
//   - question   → a prompt with accumulating answer cards (QuestionSection)
//
// Extracted from WorksheetView so the implications board can render the same blocks below
// its tree — both are Ripples sessions with section-tagged cards, so the card ops are wired
// by the host view and passed in.
export function WorksheetSections({
  sections,
  cards,
  editable,
  canEdit,
  busy,
  playerNames,
  onAdd,
  onDelete,
  onEdit,
  onReorder,
}: {
  sections: WorksheetSection[];
  cards: RippleCard[];
  editable: boolean;
  canEdit: (c: RippleCard) => boolean;
  busy: boolean;
  playerNames: Map<string, string>;
  onAdd: (section: string, text: string) => void;
  onDelete: (card: RippleCard) => void;
  onEdit: (cardId: string, text: string) => void;
  onReorder: (cardId: string, sort: number) => void;
}) {
  // Sections may be grouped into `step`s, rendered as jump-anywhere tabs. When no step is
  // declared, `steps` is empty and we fall back to one flat stack.
  const steps = useMemo(() => worksheetSteps(sections), [sections]);
  const [activeStepIdx, setActiveStepIdx] = useState(0);

  // Pre-index the STICKY answer cards by section once (not per section), so rendering is
  // O(cards) rather than O(sections × cards) — matters on the implications board, where
  // `cards` also holds the whole map/tree.
  const bySection = useMemo(() => {
    const m = new Map<string, RippleCard[]>();
    for (const c of cards) {
      if (c.order !== "STICKY" || !c.section) continue;
      const arr = m.get(c.section);
      if (arr) arr.push(c);
      else m.set(c.section, [c]);
    }
    return m;
  }, [cards]);
  const sectionCards = (key: string) => bySection.get(key) ?? [];

  const tabbed = steps.length >= 2;
  const activeStep = steps[Math.min(activeStepIdx, steps.length - 1)];
  const visibleSections = tabbed ? sections.filter((s) => s.step?.trim() === activeStep) : sections;
  // A lone brainstorm section flagged `board` (the Sandbox) gets a taller, board-like canvas.
  const tallCanvas =
    tabbed && visibleSections.length === 1 && visibleSections[0].kind === "brainstorm" && Boolean(visibleSections[0].board);

  return (
    <>
      {tabbed && (
        <div role="tablist" aria-label="Worksheet steps" className="mb-6 flex flex-wrap gap-1 border-b border-[var(--rule)]">
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
                  canEdit={canEdit}
                  busy={busy}
                  readOnly={!editable}
                  tall={tallCanvas}
                  onAdd={(text) => onAdd(s.key, text)}
                  onDelete={onDelete}
                  onReorder={onReorder}
                  onEdit={onEdit}
                  header={<AreaHead label={s.label} help={s.help} />}
                />
              ) : (
                <QuestionSection
                  label={s.label}
                  help={s.help}
                  answers={[...areaCards].sort((a, b) => a.createdTime.localeCompare(b.createdTime))}
                  authorName={(c) => playerNames.get(c.authorPlayerId ?? "") ?? ""}
                  canEdit={canEdit}
                  busy={busy}
                  readOnly={!editable}
                  onAdd={(text) => onAdd(s.key, text)}
                  onDelete={onDelete}
                  onEdit={onEdit}
                />
              )}
            </div>
          );
        })}
      </div>
    </>
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
            Delete this answer{pendingDelete?.text ? <> “{pendingDelete.text}”</> : ""}? This can’t be undone.
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
