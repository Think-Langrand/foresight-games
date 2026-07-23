"use client";

import { useEffect, useRef, useState } from "react";
import { patchTeam } from "@/components/workshop/hooks";
import { CardArtBand, DriverChips, roleHex } from "@/components/workshop/CardArt";
import { TeamResult } from "@/components/workshop/TeamResult";
import {
  CAPTURE_SENTENCE,
  CAPTURE_PROMPTS,
  CAPTURE_TITLE,
  type CapturePrompt,
} from "@/lib/capture";
import type { DriverLite } from "@/lib/drivers-shared";
import type { Card, Team } from "@/lib/workshop-types";

type Step =
  | { kind: "triad" }
  | { kind: "sentence" }
  | { kind: "prompt"; prompt: CapturePrompt }
  | { kind: "title" };

const STEPS: Step[] = [
  { kind: "triad" },
  ...CAPTURE_PROMPTS.map((p) => ({ kind: "prompt", prompt: p }) as Step),
  { kind: "sentence" },
  { kind: "title" },
];

function initialValues(team: Team): Record<string, string> {
  return {
    convergence: team.convergence,
    primaryCondition: team.primaryCondition,
    definingCharacteristics: team.definingCharacteristics,
    centralTension: team.centralTension,
    newNormal: team.newNormal,
    brokenAssumption: team.brokenAssumption,
    worldTitle: team.worldTitle,
  };
}

export function ScenarioWizard({
  code,
  team,
  triad,
  hasEdge,
  wildcard,
  locked,
  driversBySlug,
  onChange,
}: {
  code: string;
  team: Team;
  triad: Card[];
  hasEdge: boolean;
  wildcard: Card | null;
  locked: boolean;
  driversBySlug: Map<string, DriverLite>;
  onChange: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(team));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<null | "save" | "submit" | "wild">(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setValues(initialValues(team));
  }, [team]);

  const setField = (key: string, v: string) => {
    dirty.current = true;
    setValues((s) => ({ ...s, [key]: v }));
  };

  async function persist(status?: "Submitted") {
    await patchTeam(code, team.id, {
      convergence: values.convergence,
      primaryCondition: values.primaryCondition,
      definingCharacteristics: values.definingCharacteristics,
      centralTension: values.centralTension,
      newNormal: values.newNormal,
      brokenAssumption: values.brokenAssumption,
      worldTitle: values.worldTitle,
      ...(status ? { status } : {}),
    });
    dirty.current = false;
    onChange();
  }

  async function next() {
    if (busy) return;
    setBusy("save");
    try {
      await persist();
    } finally {
      setBusy(null);
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  async function submit() {
    if (busy) return;
    setBusy("submit");
    try {
      await persist("Submitted");
    } finally {
      setBusy(null);
    }
  }

  async function drawWild() {
    if (busy) return;
    setBusy("wild");
    try {
      await patchTeam(code, team.id, { drawWildcard: true });
      onChange();
    } finally {
      setBusy(null);
    }
  }

  // Submitted / closed → read-only recap.
  if (locked)
    return (
      <div className="animate-rise mt-6 border-t border-[var(--rule)] pt-7">
        <TeamResult
          team={team}
          triad={triad}
          wildcard={wildcard}
          driversBySlug={driversBySlug}
          size="md"
          heading="Your submitted scenario"
        />
      </div>
    );

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <section className="mt-8 border-t border-[var(--rule)] pt-6">
      <div className="flex items-center justify-between">
        <span className="eyebrow ink">Build the scenario</span>
        <span className="text-[11px] font-bold text-muted">
          Step {step + 1} / {STEPS.length}
        </span>
      </div>
      {/* progress */}
      <div className="mt-2 flex gap-1">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: i <= step ? "var(--lime-deep)" : "var(--hairline)" }}
          />
        ))}
      </div>

      <div key={step} className="animate-rise mt-5">
        {current.kind === "triad" && (
          <TriadStep
            triad={triad}
            hasEdge={hasEdge}
            wildcard={wildcard}
            driversBySlug={driversBySlug}
            onDrawWild={drawWild}
            drawing={busy === "wild"}
          />
        )}

        {current.kind === "sentence" && (
          <Field
            label={CAPTURE_SENTENCE.label}
            help="Fill the blanks out loud, then write it down. This is your warm-up."
          >
            <textarea
              autoFocus
              value={values.convergence}
              onChange={(e) => setField("convergence", e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={CAPTURE_SENTENCE.template}
              className={inputCls}
            />
          </Field>
        )}

        {current.kind === "prompt" && (
          <Field label={current.prompt.label} help={current.prompt.help}>
            <textarea
              autoFocus
              value={values[current.prompt.key]}
              onChange={(e) => setField(current.prompt.key, e.target.value)}
              rows={current.prompt.rows}
              maxLength={1000}
              className={inputCls}
            />
          </Field>
        )}

        {current.kind === "title" && (
          <div>
            <Field label={CAPTURE_TITLE.label} help="Give the world a name you'd put on a slide.">
              <input
                autoFocus
                value={values.worldTitle}
                onChange={(e) => setField("worldTitle", e.target.value)}
                maxLength={120}
                placeholder={CAPTURE_TITLE.placeholder}
                className={inputCls + " font-bold"}
              />
            </Field>
            <ReviewList values={values} />
          </div>
        )}
      </div>

      {/* nav */}
      <div className="mt-6 flex items-center gap-2">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || busy !== null}
          className="rounded-[2px] border border-[var(--hairline)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted hover:border-ink disabled:opacity-40"
        >
          ← Back
        </button>
        {isLast ? (
          <button
            onClick={submit}
            disabled={busy !== null}
            className="ml-auto rounded-[2px] border border-ink bg-lime px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-lime-deep disabled:opacity-50"
          >
            {busy === "submit" ? "Submitting…" : "Submit scenario →"}
          </button>
        ) : (
          <button
            onClick={next}
            disabled={busy !== null}
            className="ml-auto rounded-[2px] border border-ink bg-lime px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-lime-deep disabled:opacity-50"
          >
            {busy === "save" ? "Saving…" : "Next →"}
          </button>
        )}
      </div>
    </section>
  );
}

const inputCls =
  "mt-2 w-full resize-none rounded-[2px] border border-[var(--hairline)] bg-paper px-3 py-2.5 text-[15px] leading-[1.5] outline-none focus:border-ink";

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[15px] font-extrabold leading-[1.2]">{label}</label>
      {help && <div className="mt-1 text-[12px] leading-[1.45] text-muted">{help}</div>}
      {children}
    </div>
  );
}

function TriadStep({
  triad,
  hasEdge,
  wildcard,
  driversBySlug,
  onDrawWild,
  drawing,
}: {
  triad: Card[];
  hasEdge: boolean;
  wildcard: Card | null;
  driversBySlug: Map<string, DriverLite>;
  onDrawWild: () => void;
  drawing: boolean;
}) {
  return (
    <div>
      <div className="text-[15px] font-extrabold">Your three-card world</div>
      <div className="mt-1 text-[12px] leading-[1.45] text-muted">
        These are the conditions you&apos;re combining. Read them together and look for the logic
        that links them.
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {triad.map((c) => (
          <div
            key={c.id}
            className="overflow-hidden rounded-[6px] border border-ink bg-card"
            style={{ borderTopColor: roleHex(c.role), borderTopWidth: 3 }}
          >
            <CardArtBand dimension={c.dimension} height={40} />
            <div className="p-2.5">
              <div className="text-[9px] font-bold uppercase tracking-[0.06em] text-muted">
                {c.dimension}
              </div>
              <div className="mt-1 text-[13px] font-bold leading-[1.2]">{c.title}</div>
            </div>
          </div>
        ))}
      </div>
      {!hasEdge && (
        <div className="text-amber mt-2 text-[12px] font-semibold">
          ⚠ All three reinforce each other. A complicating card makes for a richer world.
        </div>
      )}

      {/* drivers behind the triad */}
      {triad.map((c) => (
        <DriverChips
          key={c.id}
          sourceDriverIds={c.sourceDriverIds}
          driversBySlug={driversBySlug}
          label={`Drivers behind "${c.title}"`}
        />
      ))}

      {wildcard ? (
        <div className="mt-4">
          <span className="eyebrow" style={{ color: "var(--coral)" }}>
            Wildcard stress-test
          </span>
          <div className="mt-1 rounded-[2px] border border-ink bg-card p-3">
            <div className="text-[13px] font-bold">{wildcard.title}</div>
            <div className="mt-1 text-[12.5px] leading-[1.4]">{wildcard.condition}</div>
          </div>
        </div>
      ) : (
        <button
          onClick={onDrawWild}
          disabled={drawing}
          className="mt-4 rounded-[2px] border border-[var(--hairline)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted hover:border-ink disabled:opacity-50"
        >
          {drawing ? "…" : "Draw a wildcard"}
        </button>
      )}
    </div>
  );
}

function ReviewList({ values }: { values: Record<string, string> }) {
  const rows: { label: string; value: string }[] = [
    ...CAPTURE_PROMPTS.map((p) => ({ label: p.label, value: values[p.key] })),
    { label: CAPTURE_SENTENCE.label, value: values.convergence },
  ].filter((r) => r.value?.trim());
  if (!rows.length) return null;
  return (
    <div className="mt-5">
      <div className="eyebrow ink">Your scenario so far</div>
      <dl className="mt-2 flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-[9px] font-bold uppercase tracking-[0.07em] text-muted">
              {r.label}
            </dt>
            <dd className="mt-0.5 text-[13px] leading-[1.4]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

