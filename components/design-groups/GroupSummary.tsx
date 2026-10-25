// The group's handoff, as a deck: one full-screen slide per section.
//
// Server-rendered from lib/group-summary.buildGroupSummary and handed to HandoffDeck, which
// owns only the stepping. Every slide is the group's own work now that Session 4 is built;
// slide 08 keeps an outlined fallback for a group that has not run it yet, so the deck is
// honest about what is missing rather than silently shorter.
//
// Slide 03 mounts ImplicationsMap: the real Session 2 map, split, with the branch you pick
// read out as sentences beside it.
//
// It shows what the room DID. A theme whose risks-and-opportunities walls were never filled
// is listed by name with its implications and simply carries no stakes panel — the handoff is
// the group's work, not an audit of which fields they left empty.

import {
  themesByStakes,
  type GroupSummary,
  type SummaryKeyChange,
  type SummaryPlacement,
} from "@/lib/group-summary";
import type { ImplicationsExercise, StakeRow } from "@/components/design-groups/AnswerPanels";
import { AXIS_ENDS, AXIS_LABELS, SCORE_AXES } from "@/lib/ripples-scoring";
import { COMMITMENTS_KEY_ROLE } from "@/lib/exercise-types";
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

// A slide: a header that stays put, and a body that scrolls if it has to. `fill` hands the
// body's height to the child instead, for the map, which manages its own two columns.
// Scenario artwork on a slide.
//
// SIDE BY SIDE ON WIDE SCREENS, stacked below lg. The picture is context for the words,
// not the subject of the slide, so it takes a third and the text keeps the measure it was
// set for; at narrow widths a third of the width is not a picture, so it goes above.
//
// IT MAY NOT ARRIVE. FigureImage renders nothing when the URL is missing or 403s — the
// signed URLs are short-lived — so this has to read correctly with the figure absent,
// which is why the text column is a normal flow child rather than half of a fixed grid.
function WithFigure({
  image,
  alt,
  children,
}: {
  image: ScenarioImage | undefined;
  alt: string;
  children: React.ReactNode;
}) {
  if (!image?.url) return <>{children}</>;
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <div className="min-w-0 flex-1">{children}</div>
      <figure className="m-0 w-full shrink-0 lg:w-[clamp(220px,28%,340px)]">
        <FigureImage image={image} alt={alt} ratio="aspect-[4/3]" />
        {image.prompt && (
          <figcaption className="mt-2 max-w-[42ch] text-[11.5px] leading-[1.4] text-muted">
            {image.prompt}
          </figcaption>
        )}
      </figure>
    </div>
  );
}

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

// One wall's ranked picks for slide 08. Module scope, not inline in the slide: a
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
  projectSlug,
  groupId,
}: {
  s: GroupSummary;
  // The scenario's artwork, at most three, in position order. Empty whenever the platform
  // is unreachable or the scenario has none, and every use below tolerates that.
  images?: ScenarioImage[];
  // The group's edited lead for slide 02, or null to show the projected answers.
  //
  // SEPARATE FROM execEdit ON PURPOSE. These are two different questions — "what does this
  // slide say" and "may the reader change it" — and an earlier version folded them into one
  // prop, which meant the public page dropped the group's edit along with the Edit button
  // and served the committee the pre-edit draft. Keeping them apart makes that mistake
  // impossible: a surface that passes no editing capability still shows the right words.
  execOverride?: ExecSummaryOverride | null;
  // Set by the public reader. Drops deck chrome that only makes sense to the group.
  publicView?: boolean;
  // The shaped Session 2 week, passed through untouched so the map is the real panel rather
  // than a reshaping of it. Null before Session 2 has run.
  implications: ImplicationsExercise | null;
  projectSlug: string;
  groupId: string;
}) {
  const flipped = s.flips.filter((f) => f.hopes.length > 0);
  const hopeCount = s.standaloneHopes.length + flipped.reduce((a, f) => a + f.hopes.length, 0);
  const slides: DeckSlide[] = [];

  // ---- 01 · title ----------------------------------------------------------------------
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
          What your group found in this future, in your own words.
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

  // ---- 02 · Session 4: what changes, and the role ---------------------------------------
  // THE CLAIM, AT THE FRONT. These were slides 10 and 11, a reader's last stop. They are
  // what four sessions were for, so the deck now opens on them and the working that
  // produced them follows.
  //
  // TWO HALVES ON ONE SLIDE rather than two slides: the change the group sees and the role
  // it argues for are a single position — the role is what follows from the change, and a
  // reader who met them a slide apart treated them as two findings.
  //
  // THE HEADINGS ARE AUTHORED SECTIONS, which is why the halves are concatenated rather
  // than relabelled here: every heading comes from the prompt the facilitator wrote, so
  // rewording a step cannot leave a slide stale. Split by section KEY, never by position —
  // a group that answered the moves and skipped the role used to publish three bold moves
  // under "The role you would argue for".
  const roleBlocks = s.role.filter((b) => b.key === COMMITMENTS_KEY_ROLE);
  const moveBlocks = s.role.filter((b) => b.key !== COMMITMENTS_KEY_ROLE);


  if (s.has.commitments && (s.changes.length > 0 || roleBlocks.length > 0)) {
    slides.push({
      id: "claim",
      label: "What changes, and the role",
      node: (
        <Slide
          n="02"
          title="What is different, and what public health is for"
          chip={<Chip tone="live">Session 4</Chip>}
          intro={
            <>
              Your group&rsquo;s reading of this world after three sessions inside it: what
              changes, which of today&rsquo;s assumptions quietly end, and the role it would
              argue public health plays here. Everything after this slide is the working
              that produced it.
            </>
          }
        >
          <WithFigure image={images[0]} alt={s.scenarioTitle ?? s.groupName}>
            <Blocks blocks={[...s.changes, ...roleBlocks]} />
          </WithFigure>
        </Slide>
      ),
    });
  }

  // ---- 03 · key changes ----------------------------------------------------------------
  slides.push({
    id: "key-changes",
    label: "Key changes",
    node: (
      <Slide
        n="03"
        title="Your key changes"
        chip={<Chip tone="live">On the board</Chip>}
        intro={
          s.keyChanges.length > 0 ? (
            <>
              The changes your group chose to carry forward, each scored once by the room and
              listed strongest first. The grid is where they landed.{" "}
              {AXIS_LABELS.plausibility} runs from {AXIS_ENDS.plausibility.low.toLowerCase()} to{" "}
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

  // ---- 04 · risks and opportunities together -------------------------------------------
  if (s.gaps.stakes > 0) {
    slides.push({
      id: "stakes",
      label: "Risks & opportunities",
      node: (
        <Slide
          n="04"
          title="What the themes put at stake"
          chip={<Chip tone="live">On the board</Chip>}
          intro={
            <>
              Every risk and opportunity your group wrote, side by side, the themes with the
              most at stake first. The bars share one scale, so the asymmetry is the lean: a
              theme can be mostly exposure, mostly opening, or genuinely both.
            </>
          }
        >
          <StakesBalance themes={s.themes} />
        </Slide>
      ),
    });
  }

  if (s.has.commitments && moveBlocks.length > 0) {
    const count = moveBlocks.reduce((n, b) => n + b.answers.length, 0);
    slides.push({
      id: "bold-moves",
      label: "Bold moves",
      node: (
        <Slide
          n="05"
          title="The moves you would make"
          chip={<Chip tone="live">Session 4</Chip>}
          intro={
            <>
              {count} {count === 1 ? "move" : "moves"}, chosen out of everything on your
              response wall. This is the only part of the program that says what your group
              would actually do.
            </>
          }
        >
          <WithFigure image={images[1]} alt={s.scenarioTitle ?? s.groupName}>
            <Blocks blocks={moveBlocks} numbered />
          </WithFigure>
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
  // ---- 06 · the map --------------------------------------------------------------------
  if (implications && s.totalImplicationCards > 0) {
    slides.push({
      id: "map",
      label: "The map",
      node: (
        <Slide
          n="06"
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

  // ---- 07 · how the implications regrouped ---------------------------------------------
  if (s.clusterFlow.links.length > 0) {
    const spreads = s.clusterFlow.themes.map(
      (_, ti) => s.clusterFlow.links.filter((l) => l.themeIndex === ti && l.count > 0).length
    );
    const widest = Math.max(0, ...spreads);
    slides.push({
      id: "cluster",
      label: "How they regrouped",
      node: (
        <Slide
          n="07"
          title="How the implications regrouped"
          chip={<Chip tone="live">On the board</Chip>}
          intro={
            <>
              In Session 3 your group pulled {s.clusterFlow.traced} of its implications into
              themes. This is where each one came from: themes down, the key changes they drew
              on across. A theme fed by one key change is that change restated; a theme fed by{" "}
              {widest > 1 ? widest : "several"} is something your group built.
            </>
          }
        >
          <ClusterMatrix flow={s.clusterFlow} />
        </Slide>
      ),
    });
  }

  // ---- 08 · themes ---------------------------------------------------------------------
  if (s.themes.length > 0) {
    slides.push({
      id: "themes",
      label: "Themes",
      node: (
        <Slide
          n="08"
          title="Your themes"
          chip={<Chip tone="live">On the board</Chip>}
          intro={
            <>
              Your group gathered {s.themes.reduce((a, t) => a + t.implications, 0)} implications
              into {s.themes.length} {s.themes.length === 1 ? "theme" : "themes"}
              {s.unclustered > 0
                ? `, and left ${s.unclustered} unclustered`
                : ", and left none unclustered"}
              . Ordered by how much each one puts at stake.
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

  // ---- 09 · how this world works -------------------------------------------------------
  // Session 1's own read of the scenario, written in September and shown nowhere until now.
  // It goes BEFORE the key changes because it is the ground the rest of the deck stands on:
  // a committee reading four of these needs to know how this world works before it can read
  // what the group thinks follows from it.
  if (s.worldReading.length > 0) {
    slides.push({
      id: "world",
      label: "How this world works",
      node: (
        <Slide
          n="09"
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

  // ---- 10 · what the group ranked highest ----------------------------------------------
  // Its own slide rather than a second block under 07, because the two answer different
  // questions. 07 is Week 3's: which THEMES carry the most at stake. This is Week 4's: of
  // everything on those walls, which individual stakes did the group rank highest.
  //
  // RISKS AND OPPORTUNITIES IN ONE COLUMN EACH, AND ONE SHARED GRID. The two lists give the
  // order; the single grid is what makes them comparable, because the finding a committee is
  // after is whether the openings sit higher than the exposures or the other way round, and
  // two grids side by side cannot be read against each other that way.
  if (s.placements.length > 0) {
    const scored = s.placements.filter((p) => p.rank !== null);
    const risks = s.placements.filter((p) => p.kind === "risk");
    const opps = s.placements.filter((p) => p.kind === "opportunity");

    slides.push({
      id: "matrix",
      label: "What matters most",
      node: (
        <Slide
          n="10"
          title="Your top risks and opportunities"
          chip={<Chip tone="live">Session 4</Chip>}
          intro={
            <>
              {s.placements.length} of your risks and opportunities placed on impact against
              plausibility, each list strongest first. {risks.length}{" "}
              {risks.length === 1 ? "is a risk" : "are risks"}, {opps.length}{" "}
              {opps.length === 1 ? "an opportunity" : "opportunities"}. This is the one place
              in four sessions where your group ranked its own stakes against each other.
            </>
          }
        >
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
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
        </Slide>
      ),
    });
  }

  // ---- 11 · hopes, fears, flips --------------------------------------------------------
  if (s.flips.length + s.standaloneHopes.length > 0) {
    slides.push({
      id: "hopes-fears",
      label: "Hopes & fears",
      node: (
        <Slide
          n="11"
          title="Hopes, fears, and the flips"
          chip={<Chip tone="live">On the board</Chip>}
          intro={
            <>
              {s.flips.length} {s.flips.length === 1 ? "fear" : "fears"}, and a hope written from
              the same facts for{" "}
              {flipped.length === s.flips.length ? "every one" : `${flipped.length} of them`}. Both
              halves stay on the board, because both are honest readings of this future.
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
                  className="border-b border-[var(--hairline)] px-[18px] py-4 sm:border-b-0 sm:border-r"
                  style={{ background: "rgba(255,100,78,0.07)" }}
                >
                  <p className="m-0 mb-2 flex items-center gap-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-coral">
                    Fear{" "}
                    <span className="font-normal text-muted">{String(i + 1).padStart(2, "0")}</span>
                  </p>
                  <p className="m-0 text-[14.5px] leading-[1.5]">{f.fear}</p>
                </div>
                <div className="px-[18px] py-4">
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
                    className="relative max-w-[76ch] border-b border-[var(--hairline)] py-[13px] pl-5 text-[14.5px] last:border-b-0"
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

  // ---- 11 · Session 4: the role, and the bold moves ------------------------------------
  // TWO SLIDES from one step, split BY SECTION KEY. It used to split positionally — first
  // block is the role, rest are the moves — which broke the moment a group answered the
  // moves and skipped the role: empty blocks are dropped upstream, so the moves became
  // element zero and three bold moves were published under "The role you would argue for".
  //
  // Keys are permanent ids and labels are the facilitator's, so the key is the only stable
  // thing to match on. Still generic in the direction that matters: a facilitator who adds
  // a fourth step-4 prompt gets it on the moves slide rather than breaking either.
  //
  // The role is its own slide because it is the one claim in four sessions that is an
  // argument rather than an observation, and a reader should meet it alone.
  if (SHOW_BACKCASTING && s.boldMoves.length > 0) {
    const periods = s.boldMoves[0].periods;
    slides.push({
      id: "bold-moves",
      label: "Bold moves",
      node: (
        <Slide
          n="10"
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

  // ---- 12 · What we never settled (parked, see SHOW_UNSETTLED) ---------------
  if (SHOW_UNSETTLED && s.unsettled.length > 0) {
    slides.push({
      id: "unsettled",
      label: "What we never settled",
      node: (
        <Slide
          n="12"
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
          // 14, fixed, like every other slide here. These numbers are nominal, not a
          // running count: slides are conditional, so two of them already share "10" and
          // "13" prints whether or not the twelve before it were pushed.
          n="13"
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
