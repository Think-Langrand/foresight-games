// The group's handoff, as a deck: one full-screen slide per section.
//
// Server-rendered from lib/group-summary.buildGroupSummary and handed to HandoffDeck, which
// owns only the stepping.
//
// THE ORDER IS A BRIEF, THEN ITS WORKING, THEN AN APPENDIX. The front is what four sessions
// concluded — the claim and the role, the top risks and opportunities, the moves — then the
// working that produced it: the key changes and where they led. The scenario itself follows,
// answering "what world was this?" at the point a reader finally asks it, and everything
// after is reference: the regrouping, the themes, every risk and opportunity, the hopes and
// fears, and the group's own note to the committee last.
//
// Slide 06 mounts ImplicationsMap: the real Session 2 map, split, with the branch you pick
// read out as sentences beside it.
//
// It shows what the room DID. A theme whose risks-and-opportunities walls were never filled
// is listed by name with its implications and simply carries no stakes panel — the handoff is
// the group's work, not an audit of which fields they left empty.

import {
  themesByStakes,
  type GroupSummary,
  type SummaryDirection,
  type SummaryKeyChange,
  type SummaryPlacement,
} from "@/lib/group-summary";
import type { ImplicationsExercise, StakeRow } from "@/components/design-groups/AnswerPanels";
import { AXIS_ENDS, AXIS_LABELS, SCORE_AXES } from "@/lib/ripples-scoring";
import ImplicationsMap from "@/components/design-groups/ImplicationsMap";
import HandoffDeck, { type DeckSlide } from "@/components/design-groups/HandoffDeck";
import SummaryMatrix from "@/components/design-groups/SummaryMatrix";
import ExecSummaryBody from "@/components/design-groups/ExecSummaryBody";
import { FigureImage } from "@/components/foresight/FigureImage";
import type { ScenarioImage } from "@/lib/foresight/types";
import type { ExecSummaryOverride } from "@/lib/exec-summary-shape";
import ClusterMatrix from "@/components/design-groups/ClusterMatrix";
import StakesBalance from "@/components/design-groups/StakesBalance";

// "What we never settled" is PARKED, not deleted. Flip this to true to bring it back:
// it is the last slide, so nothing renumbers and no other code changes. The Session 4
// board still collects what feeds it (step 5's "What is still open"), so the data keeps
// accruing while the slide is hidden and the slide is correct whenever it returns.
const SHOW_UNSETTLED = false;

// The backcast timeline, parked with Session 4's step that fills it. Same pattern as
// SHOW_UNSETTLED: the shaping in lib/group-summary.ts keeps running, so a board worked
// under the old shape still carries its lanes and the slide is correct whenever it returns.
const SHOW_BACKCASTING = false;

// "How this world works" — Session 1's own read of the scenario — is PARKED. It is going
// into a separate deck, and showing the same answers in both would have a committee reading
// one group's account of the world twice. Same pattern as the two flags above: the shaping
// in lib/group-summary.ts keeps running, so the slide is correct whenever it comes back.
//
// NOT THE SAME THING AS THE SCENARIO SLIDE that replaced it in the running order. That one
// is the scenario record's own Overview; this is what the group made of it.
const SHOW_WORLD_READING = false;

function Chip({ tone, children }: { tone: "live" | "next"; children: React.ReactNode }) {
  const cls =
    tone === "live" ? "border-transparent bg-lime text-ink" : "border-transparent bg-blue text-white";
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-[2px] border px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-[0.11em] ${cls}`}
    >
      {children}
    </span>
  );
}

// Scenario artwork on a slide.
//
// SIDE BY SIDE ON WIDE SCREENS, stacked below lg. The picture is context for the words,
// not the subject of the slide, so it takes a third and the text keeps the measure it was
// set for; at narrow widths a third of the width is not a picture, so the two stack.
//
// IT MAY NOT ARRIVE. FigureImage renders nothing when the URL is missing or 403s — the
// signed URLs are short-lived — so this has to read correctly with the figure absent,
// which is why the text column is a normal flow child rather than half of a fixed grid.
//
// THE THREE PICTURES ARE NOT INTERCHANGEABLE FURNITURE. Every slide used to get the same
// 28%-wide 4:3 box on the same side, which made three different images read as one
// repeated page ornament. `size`, `side` and `shape` are the knobs: today the only live
// caller is the opening claim, which takes a tall portrait at the widest size — the moves
// slide that took a small square on the left became act 6's structured directions, which
// carry no figure. The other variants stay because the parked slides below use them and
// because a call site inventing its own width is how the stack broke the first time.
//
// FIGURE_SHAPE IS SHARED WITH THE SCENARIO SLIDE, which lays itself out rather than calling
// WithFigure but takes its ratios from here — `landscape` for its lead and `band` for the
// crop beneath it — so the deck has one list of the shapes a picture may be.
const FIGURE_SIZE = {
  narrow: "lg:w-[clamp(190px,22%,280px)]",
  standard: "lg:w-[clamp(220px,28%,340px)]",
  wide: "lg:w-[clamp(260px,38%,440px)]",
} as const;

const FIGURE_SHAPE = {
  portrait: "aspect-[3/4]",
  square: "aspect-square",
  landscape: "aspect-[4/3]",
  band: "aspect-[16/9]",
} as const;

function WithFigure({
  image,
  alt,
  size = "standard",
  side = "right",
  shape = "landscape",
  children,
}: {
  image: ScenarioImage | undefined;
  alt: string;
  size?: keyof typeof FIGURE_SIZE;
  // Which side the picture takes on a WIDE screen only. Below lg both values stack the
  // same way — text first, picture under it — which is why the base class is
  // `flex-col-reverse` against a DOM order of figure-then-text: the reverse cancels the
  // swap that `lg:flex-row-reverse` needs, leaving the mobile order exactly as it was
  // before `side` existed. Deliberate, not an oversight. On a phone the figure is
  // full-width, so a 3:4 portrait above the claim would be a screen of picture before the
  // one sentence four sessions were for; the words go first and the picture follows.
  side?: "left" | "right";
  shape?: keyof typeof FIGURE_SHAPE;
  children: React.ReactNode;
}) {
  if (!image?.url) return <>{children}</>;
  return (
    <div
      className={
        "flex flex-col-reverse gap-6 lg:items-start lg:gap-8 " +
        (side === "left" ? "lg:flex-row" : "lg:flex-row-reverse")
      }
    >
      {/* NO VISIBLE CAPTION. The prompt is the instruction the picture was generated from,
          not a description of the world, and printing it tells a committee how the image was
          made rather than what it shows. FigureImage still uses it as alt text, where it is
          the most accurate description available to a screen reader. */}
      <div className={"w-full shrink-0 " + FIGURE_SIZE[size]}>
        <FigureImage image={image} alt={alt} ratio={FIGURE_SHAPE[shape]} />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// A slide: a header that stays put, and a body that scrolls if it has to. `fill` hands the
// body's height to the child instead, for the map, which manages its own two columns.
function Slide({
  n,
  title,
  chip,
  intro,
  fill = false,
  children,
}: {
  n: string;
  title: string;
  chip?: React.ReactNode;
  intro?: React.ReactNode;
  fill?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="shrink-0">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b-[1.5px] border-ink pb-3">
          <span className="shrink-0 font-mono text-[12px] font-bold tracking-[0.1em] text-blue">{n}</span>
          <h2 className="m-0 flex-1 basis-[14ch] text-balance text-[clamp(18px,2.4vw,26px)] font-bold uppercase leading-[1.12] tracking-[0.02em]">
            {title}
          </h2>
          {chip}
        </div>
        {intro && <div className="mt-4 max-w-[70ch] text-[15px] text-muted">{intro}</div>}
      </div>
      <div className={`mt-5 min-h-0 flex-1 ${fill ? "" : "overflow-y-auto overscroll-contain pr-1"}`}>
        {children}
      </div>
    </>
  );
}

// A run of authored question blocks, as Session 4's slides want them. The prompts are
// WorksheetSections, so the heading is always the group's own wording and never ours.
//
// The FIRST block is set as the quote the slide hangs off and the rest read as answers,
// which is the shape every Session 4 step happens to have: one claim, then what it rests
// on. `numbered` is for the moves, where the count is part of the point.
function Blocks({
  blocks,
  numbered = false,
}: {
  blocks: { label: string; answers: string[] }[];
  numbered?: boolean;
}) {
  // The numbering runs ACROSS blocks, so "three bold moves" stays 01 02 03 even when a
  // facilitator has split them over two prompts. Precomputed rather than counted during the
  // render: a counter mutated inside map is a re-render hazard, and lint rightly refuses it.
  const startAt: number[] = [];
  blocks.reduce((acc, b) => {
    startAt.push(acc);
    return acc + b.answers.length;
  }, 0);

  return (
    <div className="flex flex-col gap-6">
      {blocks.map((block, i) => (
        <div
          key={block.label}
          className={
            i === 0 && !numbered
              ? "border border-blue border-l-[3px] bg-card px-7 py-6"
              : "border-t border-ink pt-4"
          }
        >
          <p className="m-0 mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-blue">
            {block.label}
          </p>
          {numbered ? (
            <ol className="m-0 flex list-none flex-col p-0">
              {block.answers.map((a, j) => (
                <li
                  key={a}
                  className="grid grid-cols-[auto_1fr] items-start gap-x-4 border-b border-[var(--hairline)] py-[13px] last:border-b-0"
                >
                  <span className="pt-[5px] font-mono text-[11px] tabular-nums text-muted">
                    {String(startAt[i] + j + 1).padStart(2, "0")}
                  </span>
                  <span className="max-w-[66ch] text-[clamp(15px,1.3vw,18px)] leading-[1.45]">
                    {a}
                  </span>
                </li>
              ))}
            </ol>
          ) : i === 0 ? (
            <div className="flex flex-col gap-3">
              {block.answers.map((a) => (
                <blockquote
                  key={a}
                  className="m-0 max-w-[46ch] text-[clamp(17px,2vw,24px)] font-light leading-[1.35]"
                >
                  {a}
                </blockquote>
              ))}
            </div>
          ) : block.answers.length === 1 ? (
            <p className="m-0 max-w-[76ch] text-[15px] leading-[1.5]">{block.answers[0]}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {block.answers.map((a) => (
                <li
                  key={a}
                  className="max-w-[76ch] border-b border-[var(--hairline)] py-[9px] text-[15px] leading-[1.5] last:border-b-0"
                >
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="whitespace-nowrap border border-[var(--hairline)] px-[7px] py-[3px] font-mono text-[10px] tracking-[0.06em] text-muted">
      {label}{" "}
      {value == null ? (
        <span className="text-muted">not scored</span>
      ) : (
        <b className="font-semibold tabular-nums text-ink">{value}</b>
      )}
    </span>
  );
}

function KeyChangeRow({ kc, n }: { kc: SummaryKeyChange; n: number }) {
  return (
    <li className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-2 border-b border-[var(--hairline)] py-4 sm:grid-cols-[auto_1fr_auto]">
      <span className="pt-[3px] font-mono text-[12px] font-bold text-blue">
        {String(n).padStart(2, "0")}
      </span>
      <div>
        {kc.label && (
          <p className="m-0 mb-[5px] text-[15px] font-bold leading-[1.3] tracking-[0.02em]">{kc.label}</p>
        )}
        <p className="m-0 max-w-[68ch] text-[14.5px] leading-[1.5] text-muted">{kc.body}</p>
      </div>
      <div className="col-start-2 flex shrink-0 gap-[7px] pt-1 sm:col-start-3 sm:pt-[2px]">
        {SCORE_AXES.map((axis) => (
          <Score key={axis} label={AXIS_LABELS[axis]} value={kc[axis]} />
        ))}
      </div>
    </li>
  );
}


// Act 2's chosen priorities, risks and opportunities in ONE list.
//
// ONE LIST, NOT TWO COLUMNS. The group was asked for three issues across both walls, not
// three of each, so splitting them into a risk column and an opportunity column would
// invent a symmetry it never claimed — and a group whose three are all risks would face a
// column headed "Opportunities" saying it ranked nothing, which reads as a gap rather than
// as the finding it is. The wall each one came from rides on the row instead.
function PriorityList({ rows }: { rows: SummaryPlacement[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-6 p-0">
      {rows.map((p, i) => {
        const colour = p.kind === "risk" ? "var(--coral)" : "#3f5209";
        return (
          <li key={p.id} className="grid grid-cols-[auto_1fr] items-start gap-x-4">
            {/* A NUMBER HERE CLAIMS A RANK. Starring no longer requires scoring — the
                readiness gate asks only that three be chosen — so "starred but never
                scored" is a normal end state, and printing 01 02 03 over it would invent
                an order the room never gave. An unscored row gets the dot StakeColumn
                gives it, the same rule the per-wall slide carried before it was replaced. */}
            <span
              className="pt-[7px] font-mono text-[13px] font-bold tabular-nums"
              style={{ color: colour }}
            >
              {p.rank === null ? "·" : String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="m-0 max-w-[44ch] text-[clamp(16px,1.7vw,21px)] font-light leading-[1.4]">
                {p.text}
              </p>
              <p
                className="m-0 mt-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.14em]"
                style={{ color: colour }}
              >
                {p.kind === "risk" ? "Risk" : "Opportunity"}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// "Note any consequential issue where disagreement remains."
//
// IT GOES ON THE SAME SLIDE AS THE PRIORITIES, under a rule of its own. A dispute the room
// could not settle is a finding about the room, and a committee reading three tidy
// priorities with no sign of the argument behind them is reading a smoother story than the
// group actually told. Its own slide would overstate it; a footnote would bury it.
function DisputedList({ rows }: { rows: SummaryPlacement[] }) {
  return (
    <div className="mt-9 border-t-[1.5px] border-ink pt-5">
      <p className="m-0 mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-blue">
        Still disputed
      </p>
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {rows.map((p) => (
          <li key={p.id} className="max-w-[72ch]">
            <p className="m-0 text-[15px] leading-[1.45]">{p.text}</p>
            {/* THE NOTE IS THE FINDING, not the flag. "We could not agree about this" tells
                a committee almost nothing; what the split was about is the thing worth
                reading, which is why it prints at full size rather than as a caption. */}
            {p.note && (
              <p className="m-0 mt-1 text-[14px] italic leading-[1.45] text-muted">{p.note}</p>
            )}
            <p className="m-0 mt-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
              {p.kind === "risk" ? "Risk" : "Opportunity"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// One of act 6's three directions: the move, then the three answers that sharpen it.
//
// EVERY FIELD PRINTS, ANSWERED OR NOT. A direction with no rationale has not been
// sharpened, and an empty field says so where a dropped field would quietly present three
// questions as though only the answered ones had been asked. The prompt stays visible for
// the same reason it does on the board: it is what the answer is an answer to.
function DirectionCard({ d, n }: { d: SummaryDirection; n: number }) {
  return (
    <li className="border border-[var(--hairline)] bg-card">
      <div className="grid grid-cols-[auto_1fr] items-start gap-4 border-b border-[var(--hairline)] px-5 py-4">
        <span className="pt-[3px] font-mono text-[13px] font-bold tabular-nums text-blue">
          {String(n).padStart(2, "0")}
        </span>
        <p className="m-0 max-w-[62ch] text-[clamp(15px,1.5vw,19px)] font-bold leading-[1.35]">
          {d.text}
        </p>
      </div>
      <dl className="m-0 grid grid-cols-1 gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-3">
        {d.fields.map((f) => (
          <div key={f.key}>
            <dt className="m-0 mb-[6px] font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted">
              {f.label}
            </dt>
            <dd className="m-0">
              {f.answers.length === 0 ? (
                <p className="m-0 text-[13px] italic leading-[1.45] text-muted">
                  Not answered.
                </p>
              ) : (
                f.answers.map((a, i) => (
                  <p
                    key={i}
                    className="m-0 max-w-[40ch] text-[14px] leading-[1.45] [&:not(:first-of-type)]:mt-2"
                  >
                    {a}
                  </p>
                ))
              )}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

// One wall's ranked picks for slide 10. Module scope, not inline in the slide: a
// component created during render is a new type every pass, which remounts its subtree.
function StakeColumn({ rows, tone }: { rows: SummaryPlacement[]; tone: "risk" | "opportunity" }) {
  return (
    <div>
      <p
        className="m-0 mb-2 border-b-[1.5px] border-ink pb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ color: tone === "risk" ? "var(--coral)" : "#3f5209" }}
      >
        {tone === "risk" ? "Risks" : "Opportunities"}{" "}
        <span className="tabular-nums text-muted">{rows.length}</span>
      </p>
      {rows.length === 0 ? (
        <p className="m-0 py-2 text-[13.5px] text-muted">
          None of this group&rsquo;s picks came from this wall.
        </p>
      ) : (
        <ol className="m-0 list-none p-0">
          {rows.map((p, i) => (
            <li
              key={p.id}
              className="grid grid-cols-[auto_1fr] items-start gap-x-3 border-b border-[var(--hairline)] py-[11px] last:border-b-0"
            >
              <span className="pt-[2px] font-mono text-[11px] tabular-nums text-muted">
                {p.rank === null ? "·" : String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className="block max-w-[52ch] text-[14.5px] leading-[1.45]">{p.text}</span>
                <span className="mt-[3px] block font-mono text-[9.5px] uppercase tracking-[0.1em] tabular-nums text-muted">
                  {p.rank === null ? "not scored" : `P ${p.plausibility} · I ${p.impact}`}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StakeList({
  tone,
  rows,
  divider = false,
}: {
  tone: "risk" | "opp";
  rows: StakeRow[];
  divider?: boolean;
}) {
  const isRisk = tone === "risk";
  return (
    <div
      className={`px-5 py-4 ${divider ? "border-b border-[var(--hairline)] sm:border-b-0 sm:border-r" : ""}`}
      style={{ background: isRisk ? "rgba(255,100,78,0.07)" : "rgba(196,255,103,0.16)" }}
    >
      <p
        className="m-0 mb-[9px] font-mono text-[9.5px] font-bold uppercase tracking-[0.14em]"
        style={{ color: isRisk ? "var(--coral)" : "#3f5209" }}
      >
        {isRisk ? "Risks" : "Opportunities"}
      </p>
      <ul className="m-0 grid list-none gap-[7px] p-0">
        {rows.map((r) => (
          <li key={r.id} className="relative max-w-[52ch] pl-[14px] text-[14px] leading-[1.45]">
            <span
              className="absolute left-0 top-[9px] h-[6px] w-[6px] rounded-full"
              style={{ background: isRisk ? "var(--coral)" : "#3f5209" }}
            />
            {r.text}
            {r.mechanism && <span className="block text-[13px] italic text-muted">{r.mechanism}</span>}
            {r.shortlisted && <span className="ml-1 text-[12px] text-amber">★</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function GroupSummaryView({
  s,
  execOverride = null,
  publicView = false,
  implications,
  images = [],
  scenario = null,
  projectSlug,
  groupId,
}: {
  s: GroupSummary;
  // The scenario's artwork, at most three, in position order. Empty whenever the platform
  // is unreachable or the scenario has none, and every use below tolerates that.
  images?: ScenarioImage[];
  // The group's own note to the committee — the deck's closing slide — or null for none.
  //
  // SEPARATE FROM execEdit ON PURPOSE. These are two different questions — "what does this
  // slide say" and "may the reader change it" — and an earlier version folded them into one
  // prop, which meant the public page dropped the group's edit along with the Edit button
  // and served the committee the pre-edit draft. Keeping them apart makes that mistake
  // impossible: a surface that passes no editing capability still shows the right words.
  execOverride?: ExecSummaryOverride | null;
  // Set by the public reader. Drops deck chrome that only makes sense to the group.
  publicView?: boolean;
  // The scenario record's own title and Overview prose, for the scenario slide. Null when
  // Foresight is unreachable or the group has no scenario, and the slide is then skipped —
  // the deck never invents a description of the world it is about. The title is a fallback
  // for the cover's; the Overview is the only place this prose comes from.
  scenario?: { title: string; overview: string } | null;
  // The shaped Session 2 week, passed through untouched so the map is the real panel rather
  // than a reshaping of it. Null before Session 2 has run.
  implications: ImplicationsExercise | null;
  projectSlug: string;
  groupId: string;
}) {
  const flipped = s.flips.filter((f) => f.hopes.length > 0);
  const hopeCount = s.standaloneHopes.length + flipped.reduce((a, f) => a + f.hopes.length, 0);
  const slides: DeckSlide[] = [];

  // The number printed in a slide's header. A RUNNING COUNT taken as the slide is pushed,
  // so it always agrees with the deck's own "7 / 12" in the footer.
  //
  // IT USED TO BE A LITERAL PER SLIDE, which went stale the moment the order changed and
  // was wrong by construction anyway: slides are conditional, so a group that had not run
  // Session 4 got a deck whose headers skipped numbers while the footer counted plainly up.
  const num = () => String(slides.length + 1).padStart(2, "0");

  // ---- 01 · title -------------------------------------------------------------------
  slides.push({
    id: "title",
    label: "Title",
    node: (
      <div className="flex h-full min-h-0 flex-col justify-center">
        <p className="eyebrow ink m-0 text-[11px]">{s.groupName}</p>
        <h1 className="mt-4 max-w-[20ch] text-balance text-[clamp(34px,7vw,76px)] font-extrabold uppercase leading-[0.93] tracking-tight">
          {s.scenarioTitle ?? s.groupName}
        </h1>
        <p className="mt-5 max-w-[48ch] text-[clamp(16px,2vw,21px)] font-light leading-[1.45] text-ink">
          What your group found in this future.
        </p>
        <dl className="mt-10 grid max-w-[900px] grid-cols-[repeat(auto-fit,minmax(100px,1fr))] gap-x-5 gap-y-5 border-t border-[var(--hairline)] pt-6">
          {(
            [
              ["Key changes", s.keyChanges.length ? String(s.keyChanges.length) : "—"],
              ["Implications", s.totalImplicationCards ? String(s.totalImplicationCards) : "—"],
              ["Themes", s.themes.length ? String(s.themes.length) : "—"],
              ["Risks", s.riskCount ? String(s.riskCount) : "—"],
              ["Opportunities", s.opportunityCount ? String(s.opportunityCount) : "—"],
              ["Hopes", String(hopeCount)],
              ["Fears", String(s.flips.length)],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="m-0 mb-[5px] font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                {k}
              </dt>
              <dd className="m-0 text-[20px] font-bold leading-[1.2] tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    ),
  });

  // ---- 02-04 · the three outputs ----------------------------------------------------
  // THE WORKSHOP HAS THREE OUTPUTS and the front of the deck is them, in their order:
  // here is what we're facing, here is what we want to achieve, here is what we could do
  // about it. Everything after slide 04 is the working that produced them.
  //
  // IT USED TO OPEN ON A SINGLE CLAIM SLIDE built from act 1's two prompts and the role.
  // Those prompts retired with the six-activity rebuild — act 1 now asks what needs
  // attention rather than restating Week 2 — and the claim they carried is better told as
  // the three slides below, because that is the shape the room actually worked in.
  //
  // EACH ONE DRAWS ONLY IF THE GROUP GOT THERE. A group that ran out of time at act 4 has
  // a shorter deck rather than three headings over empty space.

  // ---- 02 · what we're facing -------------------------------------------------------
  if (s.has.commitments && (s.priorities.length > 0 || s.disputed.length > 0)) {
    const scoredCount = s.placements.filter((p) => p.rank !== null).length;
    slides.push({
      id: "facing",
      label: "What we're facing",
      node: (
        <Slide
          n={num()}
          title="What we're facing"
          chip={<Chip tone="live">Session 4</Chip>}
          intro={
            <>
              {/* The count of what was weighed only earns a mention when it is BIGGER than
                  the count carried forward. A group that scored exactly the three it
                  starred would otherwise read "weighed 3 and carried 3 forward", which
                  sounds like a tautology rather than a narrowing. */}
              {/* WEIGHED means SCORED, not merely on the board. A pick is minted by the
                  first score click OR by a star, so counting every placement credits the
                  group with weighing things it only starred. */}
              {scoredCount > s.priorities.length ? (
                <>
                  Your group weighed {scoredCount} risks and opportunities and carried{" "}
                  {s.priorities.length} forward.
                </>
              ) : (
                <>
                  The {s.priorities.length} your group carried forward off its risk and
                  opportunity walls.
                </>
              )}{" "}
              The full walls, with their scores, are in the appendix.
            </>
          }
        >
          {/* TALL, AND THE BIGGEST FIGURE IN THE DECK. This is the slide a committee is
              certain to look at, so the picture gets room; a portrait beside a column of
              short statements also stops the slide reading as one wide, flat band. */}
          <WithFigure
            image={images[0]}
            alt={s.scenarioTitle ?? s.groupName}
            size="wide"
            shape="portrait"
          >
            {s.priorities.length > 0 ? (
              <PriorityList rows={s.priorities} />
            ) : (
              <p className="m-0 text-[14px] text-muted">
                Your group recorded a disagreement here but never chose its priorities.
              </p>
            )}
            {s.disputed.length > 0 && <DisputedList rows={s.disputed} />}
          </WithFigure>
        </Slide>
      ),
    });
  }

  // ---- 03 · what we want to achieve -------------------------------------------------
  // THE VISION AND THE OUTCOMES ON ONE SLIDE, because they are one answer at two
  // altitudes: the vision is the future the group is working toward and the outcomes are
  // what that future means for communities. A reader who met them a slide apart would
  // take the outcomes for a second, competing list.
  if (s.has.commitments && (s.vision.length > 0 || s.outcomes.length > 0)) {
    slides.push({
      id: "achieve",
      label: "What we want to achieve",
      node: (
        <Slide
          n={num()}
          title="What we want to achieve"
          chip={<Chip tone="live">Session 4</Chip>}
          intro={
            <>
              The future your group would work toward, and what it would mean for
              communities if public health did its job well here.
            </>
          }
        >
          {/* The vision set as the claim it is, then the outcomes under it as the detail.
              The headings are the facilitator's own prompts, so rewording an activity
              cannot leave this slide quoting a question nobody was asked. */}
          {s.vision.length > 0 && (
            <div className="mb-9">
              {s.vision.map((b) => (
                <div key={b.key} className="[&:not(:first-of-type)]:mt-6">
                  <p className="m-0 mb-3 border-b border-ink pb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    {b.label}
                  </p>
                  {b.answers.map((a, i) => (
                    <p
                      key={i}
                      className="m-0 max-w-[48ch] text-[clamp(17px,2vw,24px)] font-light leading-[1.35] [&:not(:first-of-type)]:mt-4"
                    >
                      {a}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
          {s.outcomes.length > 0 && (
            <div className={s.vision.length > 0 ? "border-t-[1.5px] border-ink pt-6" : ""}>
              <Blocks blocks={s.outcomes} />
            </div>
          )}
        </Slide>
      ),
    });
  }

  // ---- 04 · what we could do about it -----------------------------------------------
  if (s.has.commitments && s.directions.length > 0) {
    slides.push({
      id: "directions",
      label: "What we could do about it",
      node: (
        <Slide
          n={num()}
          title="What we could do about it"
          chip={<Chip tone="live">Session 4</Chip>}
          intro={
            <>
              {s.directions.length}{" "}
              {s.directions.length === 1 ? "move" : "moves"} your group would recommend, and
              what each one is for. This is the only part of the program that says what it
              would actually do.
            </>
          }
        >
          <ol className="m-0 grid list-none gap-4 p-0">
            {s.directions.map((d, i) => (
              <DirectionCard key={d.id} d={d} n={i + 1} />
            ))}
          </ol>
        </Slide>
      ),
    });
  }

  // ---- 05 · key changes -------------------------------------------------------------
  slides.push({
    id: "key-changes",
    label: "Key changes",
    node: (
      <Slide
        n={num()}
        title="Your key changes"
        chip={<Chip tone="live">On the board</Chip>}
        intro={
          s.keyChanges.length > 0 ? (
            <>
              The changes your group chose to carry forward, each scored once by the room and
              listed strongest first. {AXIS_LABELS.plausibility} runs from {AXIS_ENDS.plausibility.low.toLowerCase()} to{" "}
              {AXIS_ENDS.plausibility.high.toLowerCase()}. {AXIS_LABELS.impact} runs from{" "}
              {AXIS_ENDS.impact.low.toLowerCase()} to {AXIS_ENDS.impact.high.toLowerCase()}.
            </>
          ) : undefined
        }
      >
        {s.keyChanges.length === 0 ? (
          <p className="text-[14px] text-muted">Session 2 has not run for this group yet.</p>
        ) : (
          /* The grid sits beside the list on a wide screen and under it on a narrow one.
             It is the same component the group scored on, so the handoff shows the picture
             the room was looking at rather than a second drawing of the same numbers. */
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
            <ol className="m-0 list-none border-t-[1.5px] border-ink p-0">
              {s.keyChanges.map((kc, i) => (
                <KeyChangeRow key={kc.id} kc={kc} n={i + 1} />
              ))}
            </ol>
            <SummaryMatrix
              rows={s.keyChanges.map((kc) => ({
                id: kc.id,
                text: kc.label ?? kc.body,
                plausibility: kc.plausibility,
                impact: kc.impact,
              }))}
            />
          </div>
        )}
      </Slide>
    ),
  });

  // ---- 06 · the map -----------------------------------------------------------------
  if (implications && s.totalImplicationCards > 0) {
    slides.push({
      id: "map",
      label: "The map",
      node: (
        <Slide
          n={num()}
          title="Where the changes led"
          chip={<Chip tone="live">On the board</Chip>}
          fill
          intro={
            <>
              Pick a key change on the map to follow one branch and read it out on the right.
              Filter by order, or switch between the wheel, the tree and the list.
            </>
          }
        >
          <ImplicationsMap ex={implications} />
        </Slide>
      ),
    });
  }

  // ---- 07 · the scenario --------------------------------------------------------------
  // THE WORLD, NOT THE GROUP'S READING OF IT. Session 1's own answers about this scenario
  // are a different slide — parked below as SHOW_WORLD_READING — and this is the scenario
  // itself: the same title and Overview prose every group has been reading since Session 1,
  // taken off the record rather than retyped, so a retitled or reworded scenario upstream
  // cannot leave the handoff quoting a version that no longer exists.
  //
  // IT SITS AFTER THE MAP, not at the front. A committee meets the group's claim first and
  // the working behind it second; by here it has read six slides of findings and the
  // question it now has is "what world was this?". At slide 01 the same words answer a
  // question nobody has asked yet and hold up the only thing the deck is for.
  //
  // THE PICTURE IS THE SUBJECT, which is why this lays itself out instead of calling
  // WithFigure: a 28% box in the margin is the treatment for artwork decorating a page of
  // findings, and this is the one slide where the artwork IS the content.
  //
  // BUT IT STILL MUST NOT BE A SLIDE WITH A HOLE IN IT, which is the rule a143795 set when
  // it put artwork on the deck at all: "WithFigure returns its children bare rather than an
  // empty half-grid — a slide missing its image must not be a slide with a hole in it." The
  // gate below passes on overview alone, and a scenario with no art is a documented normal
  // case, so the two-column grid is conditional on there being a lead image to put in the
  // second track. Without one the prose runs the full width instead of sitting at 48%
  // beside nothing.
  if (scenario && (scenario.overview || images.length > 0)) {
    const paras = scenario.overview
      .split(/\n\s*\n/)
      .map((t) => t.trim())
      .filter(Boolean);
    // Only the claim slide takes a figure now, and it takes images[0] — so reaching for 2
    // keeps the LEAD fresh, and the band under it takes 1, which nothing else draws. An
    // earlier version picked `images.find((im) => im !== lead)`, which handed the band
    // images[0] and repeated the claim's figure while image 1 sat unused; that was true of
    // the layout it was written for, where the moves slide had already spent 1.
    const lead = images[2] ?? images[0];
    const second = images.find((im) => im !== lead && im !== images[0]) ?? images[1];
    slides.push({
      id: "scenario",
      label: "The scenario",
      node: (
        <Slide
          n={num()}
          // THE SAME NAME THE COVER USES, which is the group row's, falling back to the
          // scenario record's. The two genuinely disagree in live data — one group's row
          // says "The Known and Unknown" where Foresight says "Known Here" — and a deck
          // that calls its own subject two different things eight slides apart reads as a
          // mistake to a committee that has no way to know they are the same world. One
          // name throughout beats the more authoritative name used inconsistently.
          // `scenario.title` may now be empty — the loader admits a scenario on its
          // Overview alone — so this falls through to a plain label rather than a blank
          // heading.
          title={s.scenarioTitle || scenario.title || "The scenario"}
          chip={<Chip tone="next">The scenario</Chip>}
          intro={<>The world your group has been working inside since Session 1.</>}
        >
          <div
            className={
              "grid items-start gap-8 lg:gap-12 " +
              (lead ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" : "")
            }
          >
            {/* SET LIKE A STANDFIRST, NOT LIKE A CAPTION. Everywhere else in the deck the
                prose annotates the group's work; here it is the thing being read, so it
                takes the measure and leading of one — the same 17px/1.65 the scenario
                reader itself sets the Overview at. */}
            <div className="flex flex-col gap-5 text-[clamp(15px,1.5vw,17px)] leading-[1.65]">
              {paras.length > 0 ? (
                paras.map((para, i) => (
                  <p key={i} className="m-0 max-w-[58ch]">
                    {para}
                  </p>
                ))
              ) : (
                <p className="m-0 text-[14px] italic text-muted">
                  This scenario carries no overview text.
                </p>
              )}
            </div>
            {/* TWO SIZES, NOT TWO EQUAL BOXES. A matched pair reads as a contact sheet; a
                lead image with a wide band beneath it reads as a spread.
                Gated on `lead` with the grid above: no art, no column at all. */}
            {lead && (
              <div className="flex flex-col gap-4">
                <FigureImage
                  image={lead}
                  alt={scenario.title}
                  ratio={FIGURE_SHAPE.landscape}
                />
                {second && (
                  <FigureImage image={second} alt={scenario.title} ratio={FIGURE_SHAPE.band} />
                )}
              </div>
            )}
          </div>
        </Slide>
      ),
    });
  }

  // ---- how this world works (parked, see SHOW_WORLD_READING) ------------------------
  // Session 1's own read of the scenario. Parked — see SHOW_WORLD_READING — and left in
  // place rather than deleted so turning it back on is one line.
  //
  // WHEN IT RETURNS it belongs beside the scenario slide, not where it used to sit at the
  // front: the two are the same subject read twice, once off the record and once by the
  // group, and a reader meets them better as a pair than ten slides apart.
  if (SHOW_WORLD_READING && s.worldReading.length > 0) {
    slides.push({
      id: "world",
      label: "How this world works",
      node: (
        <Slide
          n={num()}
          title="How this world works"
          intro={
            <>
              Your group&rsquo;s first read of this scenario, from Session 1 — the ground
              every slide before this one was built on.
            </>
          }
        >
          <WithFigure image={images[2]} alt={s.scenarioTitle ?? s.groupName}>
          <div className="flex flex-col gap-7">
            {s.worldReading.map((block) => (
              <div key={block.label}>
                <p className="m-0 mb-2 border-b border-ink pb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                  {block.label}{" "}
                  <span className="tabular-nums text-muted">{block.answers.length}</span>
                </p>
                <ul className="m-0 list-none p-0">
                  {block.answers.map((a) => (
                    <li
                      key={a}
                      className="max-w-[86ch] border-b border-[var(--hairline)] py-[10px] text-[14.5px] leading-[1.5] last:border-b-0"
                    >
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          </WithFigure>
        </Slide>
      ),
    });
  }

  // ---- where the group started ------------------------------------------------------
  // ACT 1'S ANSWERS, which for a while reached no slide at all. The step registry's whole
  // promise is that a mis-bucketed section is "a group's words on the wrong slide rather
  // than a crash" — but the `reconnect` bucket had no slide, so anything landing there was
  // a group's words on NO slide, which is the silent loss the registry exists to prevent.
  //
  // IT MATTERS MOST FOR PRE-REBUILD BOARDS. A week stamped before the six-activity change
  // carries "Key changes" on its sections, which maps to `reconnect`, and those answers
  // used to open the deck on the old claim slide. Without this they would simply vanish
  // from the handoff the day the code shipped.
  //
  // IN THE APPENDIX, NOT THE FRONT. It is the ground the group set out from rather than
  // something it concluded, and the front of the deck is the three outputs.
  if (s.has.commitments && s.grounding.length > 0) {
    slides.push({
      id: "grounding",
      label: "Where you started",
      node: (
        <Slide
          n={num()}
          title="Where your group started"
          chip={<Chip tone="live">Session 4</Chip>}
          intro={
            <>
              What your group said needed its attention when it came back to this scenario,
              before it chose anything.
            </>
          }
        >
          <Blocks blocks={s.grounding} />
        </Slide>
      ),
    });
  }

  // ---- 08 · how the implications regrouped ------------------------------------------
  if (s.clusterFlow.links.length > 0) {
    slides.push({
      id: "cluster",
      label: "How they regrouped",
      node: (
        <Slide
          n={num()}
          title="How the implications regrouped"
          chip={<Chip tone="live">On the board</Chip>}
          intro={
            <>
              In Session 3 your group pulled {s.clusterFlow.traced} of its implications into
              themes. This is where each one came from.
            </>
          }
        >
          <ClusterMatrix flow={s.clusterFlow} />
        </Slide>
      ),
    });
  }

  // ---- 09 · themes ------------------------------------------------------------------
  if (s.themes.length > 0) {
    slides.push({
      id: "themes",
      label: "Themes",
      node: (
        <Slide
          n={num()}
          title="Your themes"
          chip={<Chip tone="live">On the board</Chip>}
          intro={
            <>
              Your group gathered {s.themes.reduce((a, t) => a + t.implications, 0)} implications
              into {s.themes.length} {s.themes.length === 1 ? "theme" : "themes"}, ordered by how
              much each one puts at stake.
            </>
          }
        >
          <ol className="m-0 grid list-none gap-[14px] p-0">
            {themesByStakes(s.themes).map(({ theme: t, letter }) => (
              <li key={t.id} className="border border-[var(--hairline)] bg-card">
                <div className="grid grid-cols-[auto_1fr] items-start gap-4 px-5 py-4">
                  <span className="pt-1 font-mono text-[11px] font-bold text-blue">
                    {letter}
                  </span>
                  <div>
                    <p className="m-0 mb-[9px] max-w-[70ch] text-[15px] font-bold leading-[1.35]">
                      {t.text}
                    </p>
                    {t.description && (
                      <p className="m-0 mb-[9px] max-w-[70ch] text-[14px] italic text-muted">
                        {t.description}
                      </p>
                    )}
                    <ul className="m-0 flex list-none flex-wrap gap-[7px] p-0">
                      <li className="whitespace-nowrap border border-[var(--hairline)] px-[7px] py-[3px] font-mono text-[10px] tracking-[0.06em] text-muted">
                        Implications{" "}
                        <b className="font-semibold tabular-nums text-ink">{t.implications}</b>
                      </li>
                      {/* Only the counts the group actually has: a theme whose walls were
                          never filled says nothing here rather than showing a zero. */}
                      {(
                        [
                          ["Risks", t.risks.length],
                          ["Opportunities", t.opportunities.length],
                        ] as const
                      )
                        .filter(([, n]) => n > 0)
                        .map(([label, n]) => (
                          <li
                            key={label}
                            className="whitespace-nowrap border border-[var(--hairline)] px-[7px] py-[3px] font-mono text-[10px] tracking-[0.06em] text-muted"
                          >
                            {label} <b className="font-semibold tabular-nums text-ink">{n}</b>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
                {(t.risks.length > 0 || t.opportunities.length > 0) && (
                  <div
                    className={`grid border-t border-[var(--hairline)] ${
                      t.risks.length > 0 && t.opportunities.length > 0
                        ? "grid-cols-1 sm:grid-cols-2"
                        : "grid-cols-1"
                    }`}
                  >
                    {t.risks.length > 0 && (
                      <StakeList tone="risk" rows={t.risks} divider={t.opportunities.length > 0} />
                    )}
                    {t.opportunities.length > 0 && <StakeList tone="opp" rows={t.opportunities} />}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Slide>
      ),
    });
  }

  // ---- 10 · every risk and opportunity ----------------------------------------------
  // THE APPENDIX COPY. Slide 03 carries the finding — the top three on each wall — and this
  // is where a reader who wants to check it finds the rest: the per-theme lean, the shared
  // grid, and the full ranking.
  //
  // THE SHAPE FIRST, THEN THE WORDS, AND THE WORDS ONLY ONCE. This slide used to open on
  // the ranked lists and close on the theme balance — which carried its own full copy of
  // every risk and opportunity, so the same sentences appeared twice here and a third time
  // on the themes slide. The balance now leads, where a committee reads the lean of the
  // walls before meeting a single sentence, and exactly one list follows.
  //
  // EACH CHART SITS WITH WHAT IT IS ABOUT. The balance is about THEMES and takes the full
  // width alone; the grid is about these exact PLACEMENTS and sits beside the list of them.
  // Putting both charts together at the top read as two unrelated pictures and left a
  // reader working out which one the grid belonged to.
  //
  // THE RANKING IS THE LIST THAT SURVIVED, because it is the only reading nothing else in
  // the deck gives: the themes slide already prints every stake in its theme's own words.
  // What is here and nowhere else is the order Session 4 put them in, with the scores.
  //
  // IT GROWS. Before Session 4 runs there are no placements, so this is the theme balance
  // alone and 03 does not draw at all — there is no 'top three' until somebody ranks
  // something. The grid, the legend and the ranked columns are gated together, so none can
  // show up without the others.
  //
  // RISKS AND OPPORTUNITIES IN ONE COLUMN EACH, AND ONE SHARED GRID. The two lists give the
  // order; the single grid is what makes them comparable, because the finding a committee is
  // after is whether the openings sit higher than the exposures or the other way round, and
  // two grids side by side cannot be read against each other that way.
  if (s.gaps.stakes > 0 || s.placements.length > 0) {
    const scored = s.placements.filter((p) => p.rank !== null);
    const risks = s.placements.filter((p) => p.kind === "risk");
    const opps = s.placements.filter((p) => p.kind === "opportunity");
    slides.push({
      id: "stakes-all",
      // Matches the title. The dot's tooltip and the footer caption are the only place a
      // reader meets a slide's name before opening it, so a label that disagrees with the
      // heading sends them to the wrong slide.
      label: "Top risks & opportunities",
      node: (
        <Slide
          n={num()}
          title="Top risks and opportunities"
          chip={<Chip tone="live">On the board</Chip>}
          intro={
            <>
              What each theme puts at stake and which way it leans, themes with the most at
              stake first.
              {s.placements.length > 0 && (
                <>
                  {" "}
                  Session 4 ranked {s.placements.length} of them against each other:{" "}
                  {risks.length} {risks.length === 1 ? "risk" : "risks"} and {opps.length}{" "}
                  {opps.length === 1 ? "opportunity" : "opportunities"}. Every one of them in
                  its theme&rsquo;s own words is on the themes slide.
                </>
              )}
            </>
          }
        >
          {/* THE THEME BALANCE, FULL WIDTH AND FIRST. It is the one reading here that is
              about themes rather than about individual stakes, so it answers "which way do
              the walls lean" before a reader meets a single sentence. Its rows are long
              theme names with bars beside them; at two thirds of the width, next to the
              grid, the bars lost the room that makes them comparable. */}
          {s.gaps.stakes > 0 && <StakesBalance themes={s.themes} />}

          {/* THE GRID BELONGS TO THE LIST, NOT TO THE CHART ABOVE IT. It plots these exact
              rows — same cards, same scores — so beside the theme balance it read as a
              second chart about something else, and a reader had to work out which of the
              two it belonged to. Next to the list it is the same finding drawn twice: the
              order on the left, the spread on the right. */}
          {s.placements.length > 0 && (
            <>
              <p className={`mb-0 text-[15px] font-bold ${s.gaps.stakes > 0 ? "mt-10" : ""}`}>
                The order they ranked them in
              </p>
              <div className="mt-4 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
                <div className="grid gap-7 sm:grid-cols-2">
                  <StakeColumn rows={risks} tone="risk" />
                  <StakeColumn rows={opps} tone="opportunity" />
                </div>
                <SummaryMatrix
                  noun="risk or opportunity"
                  rows={s.placements.map((p) => ({
                    id: p.id,
                    text: p.text,
                    plausibility: p.plausibility,
                    impact: p.impact,
                    kind: p.kind,
                  }))}
                />
              </div>
              <p className="m-0 mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-coral" />
                  Risk
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: "#3f5209" }}
                  />
                  Opportunity
                </span>
                <span className="normal-case tracking-normal">
                  Ranked by plausibility multiplied by impact, each 1 to 5.
                  {scored.length < s.placements.length &&
                    ` ${s.placements.length - scored.length} placed but not scored, listed last.`}
                </span>
              </p>
            </>
          )}
        </Slide>
      ),
    });
  }

  // ---- 11 · hopes, fears, flips -----------------------------------------------------
  if (s.flips.length + s.standaloneHopes.length > 0) {
    slides.push({
      id: "hopes-fears",
      label: "Hopes & fears",
      node: (
        <Slide
          n={num()}
          title="Hopes, fears, and the flips"
          chip={<Chip tone="live">On the board</Chip>}
          intro={
            <>
              The hopes and fears your group has for public health in this future. Highlighted
              are the ones that were created from fears.
            </>
          }
        >
          <div className="grid gap-3">
            {s.flips.map((f, i) => (
              <div
                key={f.id}
                className="grid grid-cols-1 border border-[var(--hairline)] bg-card sm:grid-cols-2"
              >
                <div
                  className="border-b border-[var(--hairline)] px-[18px] py-4 sm:border-b-0"
                  style={{ background: "rgba(255,100,78,0.07)" }}
                >
                  <p className="m-0 mb-2 flex items-center gap-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-coral">
                    Fear{" "}
                    <span className="font-normal text-muted">{String(i + 1).padStart(2, "0")}</span>
                  </p>
                  <p className="m-0 text-[14.5px] leading-[1.5]">{f.fear}</p>
                </div>
                <div
                  className={`px-[18px] py-4 ${f.hopes.length ? "border-l-[3px]" : "sm:border-l sm:border-l-[var(--hairline)]"}`}
                  style={
                    f.hopes.length
                      ? { background: "rgba(196,255,103,0.10)", borderLeftColor: "#3f5209" }
                      : undefined
                  }
                >
                  <p
                    className="m-0 mb-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: f.hopes.length ? "#3f5209" : "var(--muted)" }}
                  >
                    {f.hopes.length ? "Said as a hope" : "Left standing"}
                  </p>
                  {f.hopes.length ? (
                    f.hopes.map((h, j) => (
                      <p
                        key={j}
                        className="m-0 text-[14.5px] leading-[1.5] [&:not(:first-of-type)]:mt-2"
                      >
                        {h}
                      </p>
                    ))
                  ) : (
                    <p className="m-0 text-[14.5px] italic leading-[1.5] text-muted">
                      Your group chose not to flip this one. It is what Session 4 works on.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {s.standaloneHopes.length > 0 && (
            <>
              <p className="mb-0 mt-8 text-[15px] font-bold">
                {s.standaloneHopes.length} {s.standaloneHopes.length === 1 ? "hope" : "hopes"} your
                group wrote on {s.standaloneHopes.length === 1 ? "its" : "their"} own
              </p>
              <ul className="m-0 mt-4 list-none border-t-[1.5px] border-ink p-0">
                {s.standaloneHopes.map((h, i) => (
                  <li
                    key={i}
                    className="relative max-w-[76ch] border-b border-[var(--hairline)] py-[13px] pl-5 pr-3 text-[14.5px] last:border-b-0"
                    style={{ background: "rgba(196,255,103,0.10)" }}
                  >
                    <span className="absolute left-0 top-[21px] h-2 w-2 border border-[#3f5209] bg-lime" />
                    {h}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Slide>
      ),
    });
  }

  // ---- The backcast table (parked, see SHOW_BACKCASTING) -------------------------------
  // One table, not one slide per move: the finding is the SHAPE of the three lanes read
  // together — where the group front-loaded, and where a lane runs out. Empty cells print
  // as a dot for exactly that reason.
  //
  // Parked with the step that fills it. Session 4 no longer backcasts, so `boldMoves` comes
  // back empty for every group worked under the new shape and this slide would never draw
  // anyway; the flag is here so that turning backcasting back on for the next workshop is
  // one line in each of the two places, not a rebuild. Its id and label collide with the
  // step-4 moves slide above on purpose: only one of the two can ever be in the deck.
  if (SHOW_BACKCASTING && s.boldMoves.length > 0) {
    const periods = s.boldMoves[0].periods;
    slides.push({
      id: "bold-moves",
      label: "Bold moves",
      node: (
        <Slide
          n={num()}
          title="The moves you committed to, and when"
          chip={<Chip tone="live">Session 4</Chip>}
          intro={
            <>
              {s.boldMoves.length} {s.boldMoves.length === 1 ? "move" : "moves"} chosen out of
              everything on the wall, each backcast across ten years. This is the only part of
              the program that says what your group would actually do.
            </>
          }
        >
          <div className="overflow-auto">
            <table className="w-full border-collapse text-[13px]">
              <caption className="sr-only">
                Each bold move with its milestones, by the two-year period they fall in.
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-10 border-b border-ink bg-paper px-2 py-2 text-left align-bottom font-mono text-[9.5px] font-normal uppercase tracking-[0.12em] text-muted"
                  >
                    Bold move
                  </th>
                  {periods.map((p) => (
                    <th
                      key={p.key}
                      scope="col"
                      className="border-b border-ink px-2 py-2 align-bottom text-left font-mono text-[10px] font-bold uppercase tracking-[0.08em]"
                    >
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.boldMoves.map((m, i) => (
                  <tr key={m.id}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-[34ch] border-b border-[var(--hairline)] bg-paper px-2 py-3 text-left align-top text-[13.5px] font-bold leading-[1.35]"
                    >
                      <span className="mr-2 font-mono text-[10px] font-bold text-blue">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {m.text}
                      <span className="mt-1 block font-mono text-[9.5px] font-normal uppercase tracking-[0.1em] text-muted">
                        {m.placed} {m.placed === 1 ? "milestone" : "milestones"}
                      </span>
                    </th>
                    {m.periods.map((p) => (
                      <td
                        key={p.key}
                        className="border-b border-l border-[var(--hairline)] px-2 py-3 align-top"
                      >
                        {p.milestones.length === 0 ? (
                          <span className="font-mono text-[12px] text-muted">·</span>
                        ) : (
                          <ul className="m-0 flex list-none flex-col gap-2 p-0">
                            {p.milestones.map((t) => (
                              <li key={t} className="text-[12.5px] leading-[1.4]">
                                {t}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="m-0 mt-4 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
              · = nothing placed in that period
            </p>
          </div>
        </Slide>
      ),
    });
  }

  // ---- what we never settled (parked, see SHOW_UNSETTLED) ---------------------------
  if (SHOW_UNSETTLED && s.unsettled.length > 0) {
    slides.push({
      id: "unsettled",
      label: "What we never settled",
      node: (
        <Slide
          n={num()}
          title="What we never settled"
          chip={<Chip tone="next">Still open</Chip>}
          intro={
            <>
              Your group&rsquo;s own words from Session 1, reviewed in Session 4.
              {s.settledCount > 0
                ? ` Four sessions answered ${s.settledCount} of them. These are the ones still open.`
                : " These are the questions four sessions did not answer."}{" "}
              Open is a finding, not an oversight. They go to the committee as they are.
            </>
          }
        >
          <ul className="m-0 list-none border-t-[1.5px] border-ink p-0">
            {s.unsettled.map((u, i) => (
              <li
                key={i}
                className="grid grid-cols-1 items-start gap-x-4 gap-y-1 border-b border-[var(--hairline)] py-[14px] last:border-b-0 sm:grid-cols-[auto_1fr]"
              >
                <span className="w-fit whitespace-nowrap border border-[var(--hairline)] px-[7px] py-[3px] font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                  {u.bucket}
                </span>
                <p className="m-0 max-w-[72ch] text-[14.5px]">{u.text}</p>
              </li>
            ))}
          </ul>
        </Slide>
      ),
    });
  }

  // ---- last · the group's note to the committee ----------------------------------------
  //
  // ONLY IF THEY WROTE ONE. An empty slide saying a group had nothing to add would be worse
  // than no slide: a committee reading four decks side by side would read the silence as a
  // finding rather than as an optional box left alone.
  //
  // IT CLOSES THE DECK because it is the one thing here addressed TO the reader rather than
  // about the scenario — everything above is the group's account of the world, and this is
  // what they want said alongside it.
  if (execOverride) {
    slides.push({
      id: "committee-note",
      label: "A note to the committee",
      node: (
        <Slide
          n={num()}
          title="A note to the committee"
          chip={<Chip tone="next">From the group</Chip>}
          intro={
            <>
              Written by your group on Session 4, outside the four steps: what it wanted the
              committee to read alongside the rest.
            </>
          }
        >
          <ExecSummaryBody override={execOverride} />
        </Slide>
      ),
    });
  }

  return (
    <HandoffDeck
      slides={slides}
      groupName={s.groupName}
      projectSlug={projectSlug}
      groupId={groupId}
      publicView={publicView}
    />
  );
}
