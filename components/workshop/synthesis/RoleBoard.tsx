"use client";

import type { RippleCard } from "@/lib/ripples-types";
import {
  answerOf,
  answersOf,
  roleProgress,
  shareOut,
  valuesFor,
  ROLE_FIELDS,
  type RoleField,
  type SynthesisBoard,
  type Week2Lineage,
} from "@/lib/synthesis-shape";
import { ThemeRail } from "@/components/workshop/synthesis/ThemeRail";
import { PromptRail, Prompts } from "@/components/workshop/synthesis/PromptRail";
import { ThemeLineagePanel } from "@/components/workshop/synthesis/ThemeLineagePanel";
import { ThemeFoot } from "@/components/workshop/synthesis/ThemeFoot";
import { QuestionGrid, type QuestionField } from "@/components/workshop/synthesis/QuestionGrid";

// STEP 3 — what role should public health play? Per theme: a desirable role, what it could
// make possible, what it could put at risk or miss, and what DG4 should investigate. Asked
// in the light of the last step — the values and the alternative are echoed above the
// questions — and carried forward through the share-out: a per-theme "include this role",
// listed together at the foot so the step still answers "what do we take with us".

export const ROLE_QUESTIONS: readonly QuestionField<RoleField>[] = [
  {
    key: "desired_role",
    question: "A desirable role for public health",
    hint: "Who would it serve, what would it contribute, and how would it work with others?",
    accent: "border-l-blue",
  },
  {
    key: "opportunity",
    question: "What could this role make possible?",
    hint: "An opportunity it opens.",
    accent: "border-l-[var(--lime-deep)]",
  },
  {
    key: "risk",
    question: "What could it put at risk or miss?",
    hint: "A risk, or a perspective it leaves out.",
    accent: "border-l-coral",
  },
  {
    key: "investigate",
    question: "What should DG4 investigate?",
    hint: "What authority, resources, relationships or evidence would this role require?",
    accent: "border-l-black/30",
  },
];

export function RoleBoard({
  board,
  lineage,
  editable,
  busy,
  themeId,
  onPickTheme,
  onAnswer,
  onEdit,
  onDescribe,
  onDelete,
  onShare,
  onGoToCluster,
}: {
  board: SynthesisBoard;
  lineage: Record<string, Week2Lineage>;
  editable: boolean;
  busy: boolean;
  themeId: string | null;
  onPickTheme: (id: string | null) => void;
  onAnswer: (theme: RippleCard, field: RoleField, text: string) => void;
  onEdit: (card: RippleCard, text: string) => void;
  onDescribe: (card: RippleCard, description: string) => void;
  onDelete: (card: RippleCard) => void;
  // Include this theme's role in the share-out (or take it out again).
  onShare: (theme: RippleCard, included: boolean) => void;
  onGoToCluster: () => void;
}) {
  const active = board.themes.find((t) => t.id === themeId) ?? board.themes[0] ?? null;
  const progressFor = (t: RippleCard) => roleProgress(board, t.id);
  const shared = shareOut(board);

  const rail = (
    <ThemeRail
      board={board}
      activeId={active?.id ?? null}
      onPick={(id) => onPickTheme(id ?? active?.id ?? null)}
      progressFor={progressFor}
      progressLabel="Role"
      hint="Click a theme to work on it."
    />
  );
  const prompts = (
    <PromptRail>
      <Prompts
        heading="What role should public health play?"
        lead="Connect what matters with what could work differently. Carry the reasoning and open questions into DG4."
        questions={ROLE_QUESTIONS.map((q) => ({ question: q.question, hint: q.hint }))}
      />
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
            A role is written onto a theme, so the group needs to cluster its implications first.
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
  const answers = answersOf(board, theme.id, ROLE_FIELDS);
  const role = answers.desired_role ?? null;
  const values = valuesFor(board, theme.id);
  const alternative = answerOf(board, theme.id, "alternative");

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
          <QuestionGrid
            title="Public health's role"
            lead={
              // What this is answered in the light of: the values the group named and the
              // other way it found the need could be met.
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[3px] border-l-4 border-[var(--lime-deep)] bg-lime/20 px-3 py-2.5">
                  <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">Grounded in what matters</div>
                  {values.length > 0 ? (
                    <ul className="mt-1.5 flex flex-col gap-1 text-[12.5px] leading-[1.45]">
                      {values.map(({ card, value }) => (
                        <li key={card.id}>{value}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[12px] italic text-muted">No value captured yet.</p>
                  )}
                </div>
                <div className="rounded-[3px] border-l-4 border-blue bg-[#e4ecfb] px-3 py-2.5">
                  <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-muted">Connected to another possibility</div>
                  {alternative?.text.trim() ? (
                    <p className="mt-1.5 text-[12.5px] leading-[1.45]">{alternative.text}</p>
                  ) : (
                    <p className="mt-1 text-[12px] italic text-muted">No alternative explored yet.</p>
                  )}
                </div>
              </div>
            }
            fields={ROLE_QUESTIONS}
            answers={answers}
            editable={editable}
            busy={busy}
            onAnswer={(field, text) => onAnswer(theme, field, text)}
            onEdit={onEdit}
            onDelete={onDelete}
          />

          <div className="flex flex-wrap items-center gap-3 border-t-2 border-dashed border-black/15 px-5 py-3">
            <label className={"flex items-center gap-2 text-[12.5px] font-bold " + (role && editable ? "cursor-pointer" : "text-muted")}>
              <input
                type="checkbox"
                checked={Boolean(role?.shortlisted)}
                disabled={!role || !editable || busy}
                onChange={(e) => onShare(theme, e.target.checked)}
                className="h-4 w-4 accent-[var(--blue)]"
              />
              Include this role in our share-out
            </label>
            {!role && <span className="text-[11.5px] italic text-muted">Write the role first.</span>}
            <span className="ml-auto text-[11.5px] italic text-muted">
              Roles can differ across themes. Keep disagreements and all linked findings; no fixed quota.
            </span>
          </div>
        </ThemeLineagePanel>

        <ThemeFoot themes={board.themes} active={theme} progressFor={progressFor} onPick={onPickTheme} />

        {/* The share-out: what the group carries forward, across every theme. */}
        <section className="rounded-[4px] border-2 border-[var(--rule)] bg-card p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Share-out</h3>
            <span className="text-[11px] italic text-muted">
              {shared.length === 0
                ? "No roles included yet — tick “Include this role” on a theme."
                : `${shared.length} role${shared.length === 1 ? "" : "s"} across ${board.themes.length} theme${board.themes.length === 1 ? "" : "s"}.`}
            </span>
          </div>
          {shared.length > 0 && (
            <ol className="mt-3 flex flex-col gap-3">
              {shared.map(({ theme: t, role: r, answers: a }) => (
                <li key={t.id} className="rounded-[3px] border border-black/15 bg-paper p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="rounded-[2px] bg-ink px-1 py-px text-[9.5px] font-bold text-paper">
                      {board.themes.indexOf(t) + 1}
                    </span>
                    <button onClick={() => onPickTheme(t.id)} className="text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted hover:text-ink">
                      {t.text}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[14px] font-bold leading-[1.35]">{r.text}</p>
                  <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-[12.5px] leading-[1.45] sm:grid-cols-3">
                    {(["opportunity", "risk", "investigate"] as const).map((k) => (
                      <div key={k}>
                        <dt className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted">
                          {ROLE_QUESTIONS.find((q) => q.key === k)?.question}
                        </dt>
                        <dd className={a[k]?.text.trim() ? "" : "italic text-muted"}>{a[k]?.text.trim() || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ol>
          )}
        </section>
      </section>
    </>
  );
}
