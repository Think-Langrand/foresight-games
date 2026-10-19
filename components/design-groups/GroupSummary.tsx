// The group's handoff, as a deck: one full-screen slide per section.
//
// Server-rendered from lib/group-summary.buildGroupSummary and handed to HandoffDeck, which
// owns only the stepping. Slides 02 to 05 are the group's own work; 06 and 07 are the
// Session 4 slots, drawn as outlines so the deck reads as a draft.
//
// Slide 03 mounts ImplicationsMap: the real Session 2 map, split, with the branch you pick
// read out as sentences beside it.
//
// It shows what the room DID. A theme whose risks-and-opportunities walls were never filled
// is listed by name with its implications and simply carries no stakes panel — the handoff is
// the group's work, not an audit of which fields they left empty.

import { themesByStakes, type GroupSummary, type SummaryKeyChange } from "@/lib/group-summary";
import type { ImplicationsExercise, StakeRow } from "@/components/design-groups/AnswerPanels";
import { AXIS_ENDS, AXIS_LABELS, SCORE_AXES } from "@/lib/ripples-scoring";
import ImplicationsMap from "@/components/design-groups/ImplicationsMap";
import HandoffDeck, { type DeckSlide } from "@/components/design-groups/HandoffDeck";
import ClusterMatrix from "@/components/design-groups/ClusterMatrix";
import StakesBalance from "@/components/design-groups/StakesBalance";

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
  implications,
  projectSlug,
  groupId,
}: {
  s: GroupSummary;
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
        <dl className="mt-10 grid max-w-[900px] grid-cols-[repeat(auto-fit,minmax(118px,1fr))] gap-x-6 gap-y-5 border-t border-[var(--hairline)] pt-6">
          {(
            [
              ["Key changes", s.keyChanges.length ? String(s.keyChanges.length) : "—"],
              ["Implications", s.totalImplicationCards ? String(s.totalImplicationCards) : "—"],
              ["Themes", s.themes.length ? String(s.themes.length) : "—"],
              ["Hopes", String(hopeCount)],
              ["Fears", String(s.flips.length)],
              ["Fears flipped", s.flips.length ? `${flipped.length} of ${s.flips.length}` : "—"],
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

  // ---- 02 · key changes ----------------------------------------------------------------
  slides.push({
    id: "key-changes",
    label: "Key changes",
    node: (
      <Slide
        n="02"
        title="Your key changes"
        chip={<Chip tone="live">On the board</Chip>}
        intro={
          s.keyChanges.length > 0 ? (
            <>
              The changes your group chose to carry forward, each scored once by the room.{" "}
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
          <ol className="m-0 list-none border-t-[1.5px] border-ink p-0">
            {s.keyChanges.map((kc, i) => (
              <KeyChangeRow key={kc.id} kc={kc} n={i + 1} />
            ))}
          </ol>
        )}
      </Slide>
    ),
  });

  // ---- 03 · the map --------------------------------------------------------------------
  if (implications && s.totalImplicationCards > 0) {
    slides.push({
      id: "map",
      label: "The map",
      node: (
        <Slide
          n="03"
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

  // ---- 04 · how the implications regrouped ---------------------------------------------
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
          n="04"
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

  // ---- 05 · themes ---------------------------------------------------------------------
  if (s.themes.length > 0) {
    slides.push({
      id: "themes",
      label: "Themes",
      node: (
        <Slide
          n="05"
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

  // ---- 06 · risks and opportunities together -------------------------------------------
  if (s.gaps.stakes > 0) {
    slides.push({
      id: "stakes",
      label: "Risks & opportunities",
      node: (
        <Slide
          n="06"
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

  // ---- 07 · hopes, fears, flips --------------------------------------------------------
  if (s.flips.length + s.standaloneHopes.length > 0) {
    slides.push({
      id: "hopes-fears",
      label: "Hopes & fears",
      node: (
        <Slide
          n="07"
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

  // ---- 08 · Session 4: the aspiration --------------------------------------------------
  slides.push({
    id: "aspiration",
    label: "Aspiration",
    node: (
      <Slide
        n="08"
        title="Your aspiration, and what it rests on"
        chip={<Chip tone="next">Session 4 builds this</Chip>}
        intro={
          <>
            The one section with no source in the program so far. Your group has {hopeCount} hopes
            and {s.flips.length} fears, and not one of them says what it would take. Session 4
            takes the pairs from the hopes and fears slide and asks what you are actually aspiring to inside
            this world.
          </>
        }
      >
        <div className="border border-blue border-l-[3px] bg-card px-7 py-6">
          <p className="m-0 mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-blue">
            Session 4 · the group&rsquo;s aspiration
          </p>
          <blockquote className="m-0 mb-5 max-w-[36ch] text-[clamp(18px,2.4vw,26px)] font-light italic leading-[1.35]">
            The aspiration your group would stand behind, written in their words.
          </blockquote>
          <ul className="m-0 list-none border-t border-ink p-0">
            {(
              [
                ["Rests on", "The rules, resources, authority or relationships it depends on"],
                ["Assumes", "What the group is taking for granted, said out loud"],
                ["Who enables it", "Who would have to do something differently"],
                ["Whose outcomes change", "Who gains, who loses, who is left out"],
                ["Breaks if", "The condition that would undo it"],
              ] as const
            ).map(([k, v]) => (
              <li
                key={k}
                className="grid grid-cols-1 gap-x-4 gap-y-1 border-b border-[var(--hairline)] py-[13px] text-[14.5px] last:border-b-0 sm:grid-cols-[auto_1fr]"
              >
                <span className="whitespace-nowrap pt-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
                  {k}
                </span>
                <span className="italic text-muted">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </Slide>
    ),
  });

  // ---- 09 · Session 4: what we never settled -------------------------------------------
  if (s.unsettled.length > 0) {
    slides.push({
      id: "unsettled",
      label: "What we never settled",
      node: (
        <Slide
          n="09"
          title="What we never settled"
          chip={<Chip tone="next">Session 4 builds this</Chip>}
          intro={
            <>
              Disagreement is recorded, not resolved. These are your group&rsquo;s own words from
              Session 1, and nothing downstream has used them yet. This deck is where they come
              back.
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

  return (
    <HandoffDeck
      slides={slides}
      groupName={s.groupName}
      projectSlug={projectSlug}
      groupId={groupId}
    />
  );
}
