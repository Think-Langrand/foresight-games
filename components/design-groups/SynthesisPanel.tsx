"use client";

import {
  AnswerList,
  QuestionBlocks,
  type PanelOpts,
  type SynthesisExercise,
  type StakeRow,
  type SynthesisTheme,
} from "@/components/design-groups/AnswerPanels";

// Read-only rendering of a Week 3 (synthesis) week: the themes with their clustered
// implications and hope/fear chains, then the leftovers, the risks & opportunities boards,
// and the parked pile.
//
// THREE consumers, deliberately one component: the admin answers viewer, the member
// session page's earlier-week tabs, and the live board itself once the week is locked
// (phase HARVEST/CLOSED). A locked week has to keep showing the whole artefact.

const KIND_STYLE: Record<"hope" | "fear", string> = {
  hope: "bg-lime text-ink",
  fear: "bg-coral text-white",
};

// A risk, opportunity or tension: what could happen, and through what mechanism.
function StakeList({
  title,
  rows,
  ...opts
}: { title: string; rows: StakeRow[] } & PanelOpts) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">{title}</div>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.id} className="group flex items-start gap-2 text-[13px] leading-[1.4]">
            {r.shortlisted && (
              <span
                aria-hidden
                title="On the committee shortlist"
                className="mt-[1px] shrink-0 text-[12px] text-blue"
              >
                ★
              </span>
            )}
            <div className="min-w-0 flex-1">
              {r.text}
              {r.mechanism && (
                <div className="mt-0.5 text-[11.5px] leading-[1.4] text-muted">{r.mechanism}</div>
              )}
            </div>
            {opts.onDelete && (
              <button
                onClick={() => opts.onDelete?.(r)}
                aria-label="Delete answer"
                className="shrink-0 rounded-[2px] px-1 text-[12px] font-bold text-muted opacity-0 hover:text-coral group-hover:opacity-100 group-focus-within:opacity-100"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThemeBlock({ theme, ...opts }: { theme: SynthesisTheme } & PanelOpts) {
  return (
    <div className="border-l-2 border-[var(--rule)] pl-3">
      <h3 className="text-[14px] font-bold">{theme.text}</h3>
      {theme.description && (
        <p className="mt-0.5 max-w-[70ch] text-[12.5px] leading-[1.45] text-muted">
          {theme.description}
        </p>
      )}

      {theme.implications.length > 0 && (
        <div className="mt-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
            Implications
          </div>
          <AnswerList answers={theme.implications} {...opts} />
        </div>
      )}

      <StakeList title="Risks" rows={theme.risks} {...opts} />
      <StakeList title="Opportunities" rows={theme.opportunities} {...opts} />
      <StakeList title="Sandbox" rows={theme.tensions} {...opts} />

      {theme.chain.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
            Hopes &amp; fears
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {theme.chain.map((row) => (
              <li
                key={row.id}
                className="group flex items-start gap-2 text-[13.5px] leading-[1.4]"
                // Depth 1 sits flush; each further link in the chain steps right, so the
                // indentation itself reads as "and that creates…".
                style={{ paddingLeft: `${(row.depth - 1) * 18}px` }}
              >
                <span
                  className={
                    "mt-[1px] shrink-0 rounded-[2px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] " +
                    KIND_STYLE[row.cardKind]
                  }
                >
                  {row.cardKind}
                </span>
                <div className="min-w-0 flex-1">
                  {row.text}
                  {row.value && (
                    <div className="mt-0.5 text-[11.5px] leading-[1.4] text-muted">
                      {row.value}
                    </div>
                  )}
                  {row.assumptions.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {row.assumptions.map((a) => (
                        <li key={a.id} className="text-[11.5px] leading-[1.4] text-muted">
                          ◆ {a.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {opts.onDelete && (
                  <button
                    onClick={() => opts.onDelete?.(row)}
                    aria-label="Delete answer"
                    title="Delete answer"
                    className="shrink-0 rounded-[2px] px-1 text-[12px] font-bold text-muted opacity-0 outline-none hover:text-coral focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ink group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {theme.implications.length === 0 &&
        theme.chain.length === 0 &&
        theme.risks.length === 0 &&
        theme.opportunities.length === 0 &&
        theme.tensions.length === 0 && (
          <p className="mt-1 text-[13px] italic text-muted">Nothing in this theme yet.</p>
        )}
    </div>
  );
}

export function SynthesisPanel({
  ex,
  seed,
  ...opts
}: { ex: SynthesisExercise; seed?: React.ReactNode } & PanelOpts) {
  const empty =
    ex.themes.length === 0 &&
    ex.unclustered.length === 0 &&
    ex.parked.length === 0 &&
    ex.orphans.length === 0 &&
    ex.questions.every((q) => q.answers.length === 0);

  return (
    <div className="flex flex-col gap-6">
      {seed}

      {empty && <p className="text-[13px] italic text-muted">Nothing on this board yet.</p>}

      {ex.themes.length > 0 && (
        <div>
          <h3 className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
            Themes
          </h3>
          <div className="flex flex-col gap-5">
            {ex.themes.map((t) => (
              <ThemeBlock key={t.id} theme={t} {...opts} />
            ))}
          </div>
        </div>
      )}

      {ex.unclustered.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
            Not sorted into a theme
          </h3>
          <AnswerList answers={ex.unclustered} {...opts} />
        </div>
      )}

      {ex.questions.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
            Sandbox
          </h3>
          <QuestionBlocks questions={ex.questions} {...opts} />
        </div>
      )}

      {ex.orphans.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[13px] font-bold uppercase tracking-[0.08em] text-coral">
            Unplaceable cards ({ex.orphans.length})
          </summary>
          <p className="mt-1 text-[12px] italic text-muted">
            These could not be attached to a theme — shown so nothing is lost.
          </p>
          <AnswerList answers={ex.orphans} {...opts} />
        </details>
      )}

      {ex.parked.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
            Parked ({ex.parked.length})
          </summary>
          <AnswerList answers={ex.parked} {...opts} />
        </details>
      )}
    </div>
  );
}
