import Link from "next/link";
import type { DesignGroupStatus } from "@/lib/design-groups";

export interface DesignGroupCard {
  id: string;
  name: string;
  color: string | null;
  scenarioTitle: string | null;
  sessionCode: string | null;
  status: DesignGroupStatus;
  implications: number;
}

// Participant-facing "Design Groups" tab: pick your group and land on its shared
// board. Server-safe (Links only) — no interactivity. A group with no scenario
// assigned yet renders as "Not ready yet".
export function DesignGroupsIndex({
  slug,
  groups,
}: {
  slug: string;
  groups: DesignGroupCard[];
}) {
  return (
    <main className="mx-auto min-h-screen max-w-[980px] px-6 py-16">
      <Link href={`/project/${slug}`} className="eyebrow blue">
        ← {slug}
      </Link>
      <h1 className="mt-4 text-[34px] font-extrabold uppercase leading-[1.05] tracking-tight">
        Design Groups
      </h1>
      <p className="serif mt-3 max-w-[640px] text-[19px] leading-[1.4] text-muted">
        Find your group and open its board. Everyone in a group builds the same
        implication map together — add notes and consequences and watch them appear
        live for your teammates.
      </p>

      {groups.length === 0 ? (
        <p className="mt-10 rounded-[3px] border border-[var(--hairline)] bg-card px-4 py-6 text-[14px] text-muted">
          No design groups have been set up for this project yet.
        </p>
      ) : (
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {groups.map((g) => {
            const ready = Boolean(g.sessionCode);
            const finalized = g.status === "FINALIZED";
            const href = `/project/${slug}/workshop/s/${g.sessionCode}`;
            const inner = (
              <>
                <div className="flex items-center gap-3">
                  <span
                    className="inline-block h-5 w-5 shrink-0 rounded-[3px] border border-ink"
                    style={{ background: g.color ?? "#ccc" }}
                  />
                  <span className="font-sans text-[22px] font-extrabold uppercase tracking-tight">
                    {g.name}
                  </span>
                  {finalized && (
                    <span className="rounded-[2px] bg-blue px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-white">
                      Finalized
                    </span>
                  )}
                </div>
                <p className="mt-3 text-[14px] leading-[1.5] text-ink">
                  {g.scenarioTitle ? (
                    <>
                      <span className="text-muted">Scenario:</span>{" "}
                      <span className="font-semibold">{g.scenarioTitle}</span>
                    </>
                  ) : (
                    <span className="italic text-muted">Scenario not assigned yet.</span>
                  )}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-[var(--hairline)] pt-3 text-[12px]">
                  <span className="text-muted">
                    {g.implications} implication{g.implications === 1 ? "" : "s"} so far
                  </span>
                  {ready ? (
                    <span className="font-bold uppercase tracking-[0.06em] text-blue">
                      {finalized ? "View map →" : "Enter board →"}
                    </span>
                  ) : (
                    <span className="uppercase tracking-[0.06em] text-muted">Not ready yet</span>
                  )}
                </div>
              </>
            );
            const cls =
              "flex flex-col rounded-[3px] border border-[var(--hairline)] bg-card p-5 transition-colors";
            return ready ? (
              <Link
                key={g.id}
                href={href}
                className={cls + " hover:border-ink"}
                style={{ borderTop: "3px solid var(--lime-deep)" }}
              >
                {inner}
              </Link>
            ) : (
              <div key={g.id} className={cls + " opacity-60"}>
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
