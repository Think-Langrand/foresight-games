"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import {
  answersOf,
  descendantsOf,
  flattenChainCards,
  valuesFor,
  valuesProgress,
  VALUES_FIELDS,
  type HopeFear,
  type SynthesisBoard,
  type ValuesField,
  type Week2Lineage,
} from "@/lib/synthesis-shape";
import { ThemeRail } from "@/components/workshop/synthesis/ThemeRail";
import { PromptRail, Prompts } from "@/components/workshop/synthesis/PromptRail";
import { ThemeLineagePanel } from "@/components/workshop/synthesis/ThemeLineagePanel";
import { ThemeFoot } from "@/components/workshop/synthesis/ThemeFoot";
import { QuestionGrid, type QuestionField } from "@/components/workshop/synthesis/QuestionGrid";
import { HopeFearGallery } from "@/components/workshop/synthesis/HopeFearGallery";
import { HopeFearPair } from "@/components/workshop/synthesis/HopeFearPair";
import { HopeFearPicker } from "@/components/workshop/synthesis/HopeFearPicker";
import { ReadingBoard } from "@/components/workshop/synthesis/ReadingBoard";
import { ConfirmModal } from "@/components/ConfirmModal";

// STEP 2 — what matters, and what could work differently. One theme at a time, picked on
// the rail like every step; the sheet has two parts behind one switch.
//
//   A · What matters — the theme's hopes and fears. Each card asks three things: what we
//       hope or fear, who it concerns, why it matters. The flip stays: a hope and the fear
//       on its other side are one piece of thinking, shown side by side.
//   B · What could work differently — four answers on the theme, the way the Themes step
//       asks its four: which scenario conditions to keep, the arrangement we are assuming,
//       another way it could work, and what changes and needs testing. The values from
//       part A stay in view above them, because B is asked in their light.

export type ValuesPart = "values" | "alternatives";

export const VALUES_QUESTIONS: readonly QuestionField<ValuesField>[] = [
  {
    key: "condition",
    question: "Which scenario conditions do we need to keep?",
    hint: "Distinguish what the scenario specifies from what we are assuming.",
    accent: "border-l-blue",
  },
  {
    key: "assumption",
    question: "The arrangement we're assuming",
    hint: "What must be in place for this way of working?",
    accent: "border-l-black/30",
  },
  {
    key: "alternative",
    question: "Another way it could work",
    hint: "Change, remove or replace a dependency. How else could the need be met?",
    accent: "border-l-[var(--lime-deep)]",
  },
  {
    key: "test",
    question: "What changes — and what needs testing?",
    hint: "Consider people, authority, resources and relationships. Who might still miss out?",
    accent: "border-l-coral",
  },
];

const PART_LABEL: Record<ValuesPart, string> = {
  values: "A · What matters",
  alternatives: "B · What could work differently",
};

export function ValuesBoard({
  board,
  lineage,
  editable,
  busy,
  themeId,
  focusId,
  onPickTheme,
  onFocus,
  onAdd,
  onFlip,
  onConcern,
  onAnswer,
  onEdit,
  onDescribe,
  onDelete,
  onGoToCluster,
}: {
  board: SynthesisBoard;
  lineage: Record<string, Week2Lineage>;
  editable: boolean;
  busy: boolean;
  themeId: string | null;
  // Which hope or fear is open in part A.
  focusId: string | null;
  onPickTheme: (id: string | null) => void;
  onFocus: (id: string | null) => void;
  onAdd: (parent: RippleCard, kind: HopeFear, text: string) => void;
  // Writing the other side does NOT move focus — see SynthesisTeamView.
  onFlip: (parent: RippleCard, kind: HopeFear, text: string) => void;
  onConcern: (card: RippleCard, text: string) => void;
  onAnswer: (theme: RippleCard, field: ValuesField, text: string) => void;
  onEdit: (card: RippleCard, text: string) => void;
  onDescribe: (card: RippleCard, description: string) => void;
  onDelete: (card: RippleCard) => void;
  onGoToCluster: () => void;
}) {
  const [part, setPart] = useState<ValuesPart>("values");
  // One dialog serves both the gallery and the open card: deleting is the same decision
  // wherever you start it, and a hope takes the fear flipped from it with it
  // (parent_card_id is ON DELETE CASCADE).
  const [pendingDelete, setPendingDelete] = useState<RippleCard | null>(null);
  const doomed = pendingDelete ? descendantsOf(board, pendingDelete.id) : [];

  // Falls back to the first theme: this step is a pass over every theme, so there is
  // always one to be on. Resolved live, so a deleted theme never strands the sheet.
  const active = board.themes.find((t) => t.id === themeId) ?? board.themes[0] ?? null;
  const progressFor = (t: RippleCard) => valuesProgress(board, t.id);

  const rail = (
    <ThemeRail
      board={board}
      activeId={active?.id ?? null}
      onPick={(id) => onPickTheme(id ?? active?.id ?? null)}
      progressFor={progressFor}
      progressLabel="Values & alternatives"
      hint="Click a theme to work on it."
    />
  );
  const prompts = (
    <PromptRail>
      {part === "values" ? (
        <Prompts
          heading="What matters"
          lead="For each hope or fear, three questions."
          questions={[
            { question: "What do we hope or fear?" },
            { question: "Who does this concern?", hint: "Whose lives or work would be affected?" },
            { question: "Why does this matter?", hint: "What are we protecting or trying to make possible?" },
          ]}
        />
      ) : (
        <Prompts
          heading="What could work differently"
          lead="Keep the value in view, then ask how else it could be met."
          questions={VALUES_QUESTIONS.map((q) => ({ question: q.question, hint: q.hint }))}
        />
      )}
    </PromptRail>
  );

  if (!active) {
    return (
      <>
        {rail}
        {prompts}
        <div className="rounded-[3px] border border-[var(--hairline)] bg-card p-6 text-center">
          <p className="text-[14px] font-bold">No themes yet.</p>
          <p className="mx-auto mt-1 max-w-[50ch] text-[13px] text-muted">
            Hopes and fears are written onto themes, so the group needs to cluster its
            implications first.
          </p>
          <button
            onClick={onGoToCluster}
            className="mt-3 rounded-[2px] border border-ink bg-lime px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep"
          >
            ← Go to Themes
          </button>
        </div>
      </>
    );
  }

  const theme = active;
  const entries = flattenChainCards(board, theme.id);
  // Derived, never synced: a deleted card falls back to the first rather than to nothing.
  const focused = entries.find((e) => e.card.id === focusId)?.card ?? entries[0]?.card ?? null;
  const values = valuesFor(board, theme.id);
  const answers = answersOf(board, theme.id, VALUES_FIELDS);
  // Assumptions written under hopes and fears on boards worked before they moved to the
  // theme. Listed, not lost.
  const legacyAssumptions = entries.flatMap((e) => board.assumptions.get(e.card.id) ?? []);

  const segBtn = (on: boolean) =>
    "rounded-[2px] border px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] " +
    (on ? "border-ink bg-ink text-paper" : "border-[var(--rule)] bg-paper text-muted hover:border-ink hover:text-ink");

  return (
    <>
      {rail}
      {prompts}

      <section className="flex flex-col gap-4">
        <ThemeLineagePanel
          theme={theme}
          implications={board.clusters.get(theme.id) ?? []}
          lineage={lineage}
          editable={editable}
          busy={busy}
          onEditTheme={(t) => onEdit(theme, t)}
          onDescribeTheme={(d) => onDescribe(theme, d)}
          showDescription={false}
        >
          {/* The theme's four answers from the last step, folded: a hope is meant to say
              why one of THOSE possibilities matters. Read-only — editing them is that
              step's job. */}
          <details className="border-t-2 border-dashed border-black/15 px-5 py-3">
            <summary className="cursor-pointer list-none text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted hover:text-ink">
              ▸ How does this future work? — what we worked out
            </summary>
            <div className="-mx-5 -mb-3 mt-2">
              <ReadingBoard theme={theme} board={board} editable={false} busy={busy} readOnly onAnswer={() => {}} onEdit={() => {}} onDelete={() => {}} />
            </div>
          </details>

          {/* The switch between the two parts. */}
          <div className="flex flex-wrap items-center gap-1.5 border-t-2 border-dashed border-black/15 px-5 py-3">
            {(["values", "alternatives"] as const).map((p) => (
              <button key={p} onClick={() => setPart(p)} aria-pressed={part === p} className={segBtn(part === p)}>
                {PART_LABEL[p]}
              </button>
            ))}
          </div>

          {part === "values" ? (
            <div className="border-t-2 border-dashed border-black/15 px-5 py-4">
              {entries.length === 0 ? (
                <HopeFearPicker busy={busy} disabled={!editable} onAdd={(kind, text) => onAdd(theme, kind, text)} />
              ) : (
                <>
                  <HopeFearGallery
                    entries={entries}
                    selectedId={focused?.id ?? null}
                    editable={editable}
                    busy={busy}
                    onSelect={(c) => onFocus(c.id)}
                    onRequestDelete={setPendingDelete}
                    onQuickAdd={(kind, text) => onAdd(theme, kind, text)}
                  />
                  {focused && (
                    <div className="mt-5 border-t border-black/10 pt-5">
                      <h3 className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
                        Selected {focused.cardKind}
                      </h3>
                      <HopeFearPair
                        key={focused.id}
                        card={focused}
                        board={board}
                        editable={editable}
                        busy={busy}
                        onEdit={onEdit}
                        onDescribe={onDescribe}
                        onConcern={onConcern}
                        onFlip={onFlip}
                        onRequestDelete={setPendingDelete}
                      />
                    </div>
                  )}
                </>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-3">
                <p className="text-[11.5px] italic text-muted">Hopes and fears can stand alone. Pairing is optional.</p>
                <button
                  onClick={() => setPart("alternatives")}
                  className="rounded-[2px] border border-ink bg-lime px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep"
                >
                  Explore alternatives →
                </button>
              </div>
            </div>
          ) : (
            <QuestionGrid
              title="What could work differently"
              lead={
                <div className="rounded-[3px] border-l-4 border-[var(--lime-deep)] bg-lime/20 px-3 py-2.5">
                  <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">Keep the value in view</div>
                  {values.length > 0 ? (
                    <ul className="mt-1.5 flex flex-col gap-1.5">
                      {values.map(({ card, value }) => (
                        <li key={card.id} className="text-[13px] leading-[1.45]">
                          <span className={"mr-1.5 rounded-[2px] px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] " + (card.cardKind === "hope" ? "bg-lime text-ink" : "bg-coral text-white")}>
                            {card.cardKind}
                          </span>
                          {value}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[12.5px] italic text-muted">
                      A value from What matters will appear here once captured.
                    </p>
                  )}
                  {legacyAssumptions.length > 0 && (
                    <div className="mt-2 border-t border-black/10 pt-2 text-[11.5px] text-muted">
                      <span className="font-bold uppercase tracking-[0.06em]">Assumptions noted earlier · </span>
                      {legacyAssumptions.map((a) => a.text).join(" · ")}
                    </div>
                  )}
                </div>
              }
              fields={VALUES_QUESTIONS}
              answers={answers}
              editable={editable}
              busy={busy}
              onAnswer={(field, text) => onAnswer(theme, field, text)}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}
        </ThemeLineagePanel>

        <ThemeFoot themes={board.themes} active={theme} progressFor={progressFor} onPick={onPickTheme} />
      </section>

      <ConfirmModal
        open={pendingDelete !== null}
        title={`Delete this ${pendingDelete?.cardKind ?? "card"}?`}
        busy={busy}
        confirmLabel="Delete"
        message={
          doomed.length === 0 ? (
            <>This can&rsquo;t be undone.</>
          ) : (
            <>
              This also deletes{" "}
              <strong className="text-ink">
                {doomed.length} card{doomed.length === 1 ? "" : "s"}
              </strong>{" "}
              written on it — who it concerns, and anything flipped from it. This can&rsquo;t be
              undone.
            </>
          )
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const card = pendingDelete;
          setPendingDelete(null);
          if (card) onDelete(card);
        }}
      />
    </>
  );
}
