"use client";

import {
  AnswerList,
  QuestionBlocks,
  type ChainRow,
  type PanelOpts,
  type SynthesisExercise,
  type StakeRow,
  type SynthesisTheme,
  type ThemeAnswerRow,
} from "@/components/design-groups/AnswerPanels";
import {
  READING_FIELDS,
  ROLE_FIELDS,
  VALUES_FIELDS,
  type ThemeAnswerKind,
} from "@/lib/synthesis-shape";

// Read-only rendering of a Week 3 (synthesis) week: each theme with its implications, the
// four questions answered on it and its risks and opportunities (steps 1–2); then the
// board's hopes and fears with each flip under the fear it answers (steps 3–4); then the
// leftovers and the parked pile.
//
// THREE consumers, deliberately one component: the admin answers viewer, the member
// session page's earlier-week tabs, and the live board itself once the week is locked
// (phase HARVEST/CLOSED). A locked week has to keep showing the whole artefact.

const KIND_STYLE: Record<"hope" | "fear", string> = {
  hope: "bg-lime text-ink",
  fear: "bg-coral text-white",
};

// The theme-level answers grouped the way the steps asked them. Only the first group is
// asked today; the rest are what older boards may still carry, so they show only when
// there is something in them.
const GROUPS: { title: string; kinds: readonly ThemeAnswerKind[] }[] = [
  { title: "How does this future work?", kinds: READING_FIELDS },
  { title: "What could work differently (earlier step)", kinds: VALUES_FIELDS },
  { title: "Public health's role (earlier step)", kinds: ROLE_FIELDS },
  { title: "Earlier questions", kinds: ["assumed_role", "question"] },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">{children}</div>;
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Delete answer"
      title="Delete answer"
      className="shrink-0 rounded-[2px] px-1 text-[12px] font-bold text-muted opacity-0 outline-none hover:text-coral focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ink group-hover:opacity-100 group-focus-within:opacity-100"
    >
      ✕
    </button>
  );
}

// A group of answered questions: the question small above each answer.
function AnswerBlock({ title, rows, ...opts }: { title: string; rows: ThemeAnswerRow[] } & PanelOpts) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3">
      <Eyebrow>{title}</Eyebrow>
      <ul className="mt-1.5 flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id} className="group flex items-start gap-2 text-[13px] leading-[1.4]">
            <div className="min-w-0 flex-1">
              <div className="text-[10.5px] font-bold leading-[1.3] text-ink/70">{r.label}</div>
              <div className="mt-0.5 whitespace-pre-wrap">{r.text}</div>
            </div>
            {opts.onDelete && <DeleteButton onClick={() => opts.onDelete?.(r)} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

// A theme's risks or opportunities (or an older board's sandbox notes), as a plain list
// in the wall's colour.
function StakeList({
  title,
  rows,
  rule,
  ...opts
}: { title: string; rows: StakeRow[]; rule?: string } & PanelOpts) {
  if (rows.length === 0) return null;
  return (
    <div className={"mt-3 " + (rule ? "border-l-4 pl-2.5 " + rule : "")}>
      <Eyebrow>{title}</Eyebrow>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.id} className="group flex items-start gap-2 text-[13px] leading-[1.4]">
            <div className="min-w-0 flex-1">
              {r.text}
              {r.mechanism && <div className="mt-0.5 text-[11.5px] leading-[1.4] text-muted">{r.mechanism}</div>}
            </div>
            {opts.onDelete && <DeleteButton onClick={() => opts.onDelete?.(r)} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Hopes and fears, indented by depth so a flip sits under the card it answers. Serves the
// board's own (step 3–4) and an older board's per-theme chains alike.
function ChainList({ rows, ...opts }: { rows: ChainRow[] } & PanelOpts) {
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {rows.map((row) => (
        <li
          key={row.id}
          className="group flex items-start gap-2 text-[13.5px] leading-[1.4]"
          // Depth 1 sits flush; each further link steps right, so the indentation itself
          // reads as "flipped into…".
          style={{ paddingLeft: `${(row.depth - 1) * 18}px` }}
        >
          <span
            className={
              "mt-[1px] shrink-0 rounded-[2px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] " +
              KIND_STYLE[row.cardKind]
            }
          >
            {row.depth > 1 ? `↩ ${row.cardKind}` : row.cardKind}
          </span>
          <div className="min-w-0 flex-1">
            {row.text}
            {row.concerns && (
              <div className="mt-0.5 text-[11.5px] leading-[1.4] text-muted">
                <span className="font-bold uppercase tracking-[0.05em]">Concerns · </span>
                {row.concerns}
              </div>
            )}
            {row.value && (
              <div className="mt-0.5 text-[11.5px] leading-[1.4] text-muted">
                <span className="font-bold uppercase tracking-[0.05em]">Why · </span>
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
          {opts.onDelete && <DeleteButton onClick={() => opts.onDelete?.(row)} />}
        </li>
      ))}
    </ul>
  );
}

function ThemeBlock({ theme, ...opts }: { theme: SynthesisTheme } & PanelOpts) {
  const byGroup = GROUPS.map((g) => ({
    ...g,
    rows: theme.answers.filter((a) => (g.kinds as readonly string[]).includes(a.kind)),
  }));
  const empty =
    theme.implications.length === 0 &&
    theme.answers.length === 0 &&
    theme.risks.length === 0 &&
    theme.opportunities.length === 0 &&
    theme.chain.length === 0 &&
    theme.tensions.length === 0;

  return (
    <div className="border-l-2 border-[var(--rule)] pl-3">
      <h3 className="text-[14px] font-bold">{theme.text}</h3>
      {theme.description && (
        <p className="mt-0.5 max-w-[70ch] text-[12.5px] leading-[1.45] text-muted">{theme.description}</p>
      )}

      {theme.implications.length > 0 && (
        <div className="mt-1">
          <Eyebrow>Implications</Eyebrow>
          <AnswerList answers={theme.implications} {...opts} />
        </div>
      )}

      <AnswerBlock title={byGroup[0].title} rows={byGroup[0].rows} {...opts} />
      <StakeList title="Risks" rows={theme.risks} rule="border-coral" {...opts} />
      <StakeList title="Opportunities" rows={theme.opportunities} rule="border-[var(--lime-deep)]" {...opts} />

      {theme.chain.length > 0 && (
        <div className="mt-3">
          <Eyebrow>Hopes &amp; fears (written on this theme, earlier step)</Eyebrow>
          <ChainList rows={theme.chain} {...opts} />
        </div>
      )}

      <AnswerBlock title={byGroup[1].title} rows={byGroup[1].rows} {...opts} />
      <AnswerBlock title={byGroup[2].title} rows={byGroup[2].rows} {...opts} />
      <AnswerBlock title={byGroup[3].title} rows={byGroup[3].rows} {...opts} />
      <StakeList title="Sandbox" rows={theme.tensions} {...opts} />

      {empty && <p className="mt-1 text-[13px] italic text-muted">Nothing in this theme yet.</p>}
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
    ex.hopesFears.length === 0 &&
    ex.role.length === 0 &&
    ex.unclustered.length === 0 &&
    ex.parked.length === 0 &&
    ex.orphans.length === 0 &&
    ex.questions.every((q) => q.answers.length === 0);
  const flipped = ex.hopesFears.filter((r) => r.depth > 1).length;

  return (
    <div className="flex flex-col gap-6">
      {seed}

      {empty && <p className="text-[13px] italic text-muted">Nothing on this board yet.</p>}

      {/* LEGACY — an older board's role answers, once the week's share-out. */}
      {ex.role.length > 0 && (
        <div className="rounded-[4px] border-2 border-ink bg-[rgba(196,255,103,0.16)] px-4 py-3">
          <AnswerBlock title="Public health's role (earlier step)" rows={ex.role} {...opts} />
        </div>
      )}

      {ex.themes.length > 0 && (
        <div>
          <h3 className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Themes</h3>
          <div className="flex flex-col gap-5">
            {ex.themes.map((t) => (
              <ThemeBlock key={t.id} theme={t} {...opts} />
            ))}
          </div>
        </div>
      )}

      {/* The board's hopes and fears, each flip under the fear it answers. */}
      {ex.hopesFears.length > 0 && (
        <div>
          <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
            <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Hopes &amp; fears</h3>
            {flipped > 0 && (
              <span className="text-[11px] italic text-muted">
                {flipped} flipped — shown under the fear each answers
              </span>
            )}
          </div>
          <ChainList rows={ex.hopesFears} {...opts} />
        </div>
      )}

      {ex.unclustered.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Not sorted into a theme</h3>
          <AnswerList answers={ex.unclustered} {...opts} />
        </div>
      )}

      {ex.questions.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Sandbox</h3>
          <QuestionBlocks questions={ex.questions} {...opts} />
        </div>
      )}

      {ex.orphans.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[13px] font-bold uppercase tracking-[0.08em] text-coral">
            Unplaceable cards ({ex.orphans.length})
          </summary>
          <p className="mt-1 text-[12px] italic text-muted">
            These could not be attached to anything — shown so nothing is lost.
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
