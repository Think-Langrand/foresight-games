// Shown when the Foresight API env vars aren't set, so the routes stay browsable
// locally without secrets instead of throwing (mirrors the airtable/llm guards).

// Shown when a request to the platform API fails (backend down, wrong URL, bad
// key, 5xx) — a friendly panel instead of a raw runtime-error crash.
export function ForesightUnavailable({ detail }: { detail?: string }) {
  return (
    <div className="mt-10 rounded-[3px] border border-[var(--hairline)] bg-card p-6">
      <span className="eyebrow ink">Couldn&apos;t load scenarios</span>
      <p className="mt-2 max-w-[560px] text-[15px] leading-[1.55] text-muted">
        {detail ??
          "The foresight platform API couldn't be reached. Check that the backend is running and FORESIGHT_API_URL points at it."}
      </p>
    </div>
  );
}

export function ForesightNotConfigured() {
  return (
    <div className="mt-10 rounded-[3px] border border-[var(--hairline)] bg-card p-6">
      <span className="eyebrow ink">Not configured</span>
      <p className="mt-2 max-w-[560px] text-[15px] leading-[1.55] text-muted">
        The Foresight scenario API isn&apos;t configured in this environment. Set{" "}
        <code className="rounded-[2px] border border-[var(--hairline)] bg-paper px-1 py-0.5 font-mono text-[13px]">
          FORESIGHT_API_URL
        </code>{" "}
        and{" "}
        <code className="rounded-[2px] border border-[var(--hairline)] bg-paper px-1 py-0.5 font-mono text-[13px]">
          FORESIGHT_API_KEY
        </code>{" "}
        (see <code className="font-mono text-[13px]">.env.example</code>) to load
        published scenarios.
      </p>
    </div>
  );
}
