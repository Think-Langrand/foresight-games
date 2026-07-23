import type { SessionResults } from "@/lib/workshop-types";
import type { ScenarioLite } from "@/lib/workshop-types";

// Read-only view of a Single/Full session: submissions + pole leans per uncertainty.
export function AdminResults({
  results,
  scenarios,
}: {
  results: SessionResults;
  scenarios: ScenarioLite[];
}) {
  const scenarioById = new Map(scenarios.map((s) => [s.id, s]));
  const entries = Object.entries(results.byUncertainty);

  return (
    <div>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-muted">
        <span>
          <span className="font-bold text-ink">{results.participantCount}</span> participants
        </span>
        <span>
          <span className="font-bold text-ink">{results.responseCount}</span> responses
        </span>
        <span>
          <span className="font-bold text-ink">{entries.length}</span> uncertainties with activity
        </span>
      </div>

      {entries.length === 0 && (
        <p className="mt-8 text-[14px] text-muted">No submissions yet.</p>
      )}

      <div className="mt-6 flex flex-col gap-8">
        {entries.map(([uid, r]) => {
          const scenario = scenarioById.get(uid);
          const leans = r.poleLean;
          const anyLean = Object.values(leans).some((n) => n > 0);
          return (
            <section key={uid}>
              <span className="eyebrow blue">{scenario?.capabilityDomain ?? "Uncertainty"}</span>
              <h2 className="mt-1 text-[20px] font-extrabold leading-[1.12]">
                {scenario?.label ?? uid}
              </h2>
              {scenario?.question && (
                <p className="serif mt-0.5 text-[15px] italic text-muted">{scenario.question}</p>
              )}

              {anyLean && (
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  {(
                    [
                      ["Toward Pole A", scenario?.poleA],
                      ["Neither / both", "Neither / both"],
                      ["Toward Pole B", scenario?.poleB],
                    ] as const
                  ).map(([key, label]) => (
                    <span
                      key={key}
                      className="rounded-[2px] border border-[var(--hairline)] bg-card px-2 py-1"
                    >
                      <span className="font-bold tabular-nums">{leans[key] ?? 0}</span>{" "}
                      <span className="text-muted">{label || key}</span>
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-col gap-2">
                {r.submissions.length === 0 && (
                  <p className="text-[13px] text-muted">No submissions.</p>
                )}
                {r.submissions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-start gap-3 rounded-[2px] border border-[var(--hairline)] bg-card px-3 py-2.5"
                  >
                    <span className="mt-0.5 min-w-[2ch] text-right text-[13px] font-bold tabular-nums text-blue">
                      {s.upvotes > 0 ? `▲${s.upvotes}` : ""}
                    </span>
                    <div className="flex-1">
                      <p className="text-[14px] leading-[1.45]">{s.text}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
                        {s.author && <span>{s.author}</span>}
                        {s.lean && <span>{s.lean}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
