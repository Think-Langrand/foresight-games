"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_QUESTIONS } from "@/lib/ripples-types";

export interface LauncherScenario {
  id: string;
  title: string;
  headline: string;
}

// Facilitator form to start an implication-mapping session against a scenario.
export function RipplesLauncher({
  scenarios,
  configured,
  basePath = "",
  projectSlug,
  solo = false,
}: {
  scenarios: LauncherScenario[];
  configured: boolean;
  // "" global; "/project/<slug>" so the created session's present view stays in-tenant.
  basePath?: string;
  projectSlug?: string;
  // Solo: one-person self-paced play. Hides facilitator-only settings and drops
  // you straight into the game instead of the projector.
  solo?: boolean;
}) {
  const router = useRouter();
  const [scenarioRef, setScenarioRef] = useState(scenarios[0]?.id ?? "");
  const [buildMin, setBuildMin] = useState(20);
  const [challengeEnabled, setChallengeEnabled] = useState(true);
  const [questions, setQuestions] = useState<string[]>(DEFAULT_QUESTIONS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!scenarioRef) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "Ripples",
          scenarioRef,
          projectSlug,
          solo,
          config: {
            ripple1Seconds: Math.round(buildMin * 60),
            challengeEnabled,
            questions: questions.map((q) => q.trim()).filter(Boolean),
            lensDeckEnabled: false,
          },
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to start");
      const { code } = await res.json();
      // Solo drops you straight into play; facilitated opens the projector console.
      router.push(`${basePath}/workshop/s/${code}${solo ? "" : "/present"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="rounded-[3px] border border-coral bg-card p-5 text-[14px] text-muted">
        The scenario platform isn&rsquo;t configured on the server (set{" "}
        <code className="rounded-[2px] border border-[var(--hairline)] px-1">FORESIGHT_URL</code> and{" "}
        <code className="rounded-[2px] border border-[var(--hairline)] px-1">FORESIGHT_API_KEY</code>
        ), so there are no scenarios to run against.
      </div>
    );
  }

  return (
    <div className="rounded-[3px] border border-[var(--hairline)] bg-card p-5">
      <label className="block text-[12px] font-bold uppercase tracking-[0.08em] text-muted">
        Scenario
      </label>
      {scenarios.length === 0 ? (
        <p className="mt-1 text-[13px] italic text-muted">
          No scenarios found for this project.
        </p>
      ) : (
        <select
          value={scenarioRef}
          onChange={(e) => setScenarioRef(e.target.value)}
          className="mt-1 w-full rounded-[2px] border border-[var(--hairline)] bg-paper p-2 text-[14px] outline-none focus:border-ink"
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
              {s.headline ? ` — ${s.headline}` : ""}
            </option>
          ))}
        </select>
      )}

      {/* Facilitator setup: round timers, the challenge toggle, and the four
          reflection questions. Solo participants just pick a scenario and go. */}
      {!solo && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumField label="Build (min)" value={buildMin} onChange={setBuildMin} min={1} />
          </div>

          <label className="mt-5 flex cursor-pointer items-center gap-2 text-[13px] font-semibold">
            <span
              className={"sq-toggle" + (challengeEnabled ? " on" : "")}
              onClick={() => setChallengeEnabled((v) => !v)}
              role="switch"
              aria-checked={challengeEnabled}
            >
              <span className="knob" />
            </span>
            Enable the challenge flag (vote a card as &ldquo;today-thinking&rdquo;)
          </label>

          <div className="mt-5">
            <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
              Reflection questions
            </span>
            <div className="mt-2 flex flex-col gap-2">
              {questions.map((q, i) => (
                <textarea
                  key={i}
                  value={q}
                  rows={2}
                  onChange={(e) =>
                    setQuestions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                  }
                  className="w-full resize-none rounded-[2px] border border-[var(--hairline)] bg-paper p-2 text-[13px] outline-none focus:border-ink"
                />
              ))}
            </div>
          </div>
        </>
      )}

      {error && <div className="mt-4 text-[13px] font-semibold text-coral">{error}</div>}

      <button
        onClick={start}
        disabled={busy || !scenarioRef}
        className="mt-5 rounded-[2px] border border-ink bg-lime px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep disabled:opacity-40"
      >
        {busy ? "Starting…" : solo ? "Start playing →" : "Start session"}
      </button>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
        className="mt-1 w-full rounded-[2px] border border-[var(--hairline)] bg-paper p-2 text-[14px] outline-none focus:border-ink"
      />
    </label>
  );
}
