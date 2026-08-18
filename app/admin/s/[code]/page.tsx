import Link from "next/link";
import { getSessionByCode, getSessionResults, supabaseConfigured } from "@/lib/workshop";
import { getTeams } from "@/lib/teams";
import { getRipplesView } from "@/lib/ripples";
import { getDeckForProjectId, getDriversForProjectRef } from "@/lib/cards";
import { getModel, getScenarioList } from "@/lib/model";
import { AdminCardsSession } from "@/components/admin/AdminCardsSession";
import { AdminResults } from "@/components/admin/AdminResults";
import { ImplicationTree } from "@/components/workshop/ImplicationTree";

export const dynamic = "force-dynamic";

export default async function AdminSessionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const upper = code.toUpperCase();

  if (!supabaseConfigured()) {
    return <Shell code={upper}>Database is not configured.</Shell>;
  }

  const session = await getSessionByCode(upper);
  if (!session) {
    return <Shell code={upper}>Session not found.</Shell>;
  }

  if (session.scope === "Ripples") {
    const view = await getRipplesView(session);
    const questions = view.config.questions;
    return (
      <Shell code={upper} session={session}>
        {view.teams.length === 0 ? (
          <p className="mt-8 text-[14px] text-muted">No boards.</p>
        ) : (
          <div className="mt-6 flex flex-col gap-6">
            {view.teams.map((t) => {
              const tc = view.cards.filter((c) => c.teamId === t.id);
              const roster = view.players.filter((p) => p.teamId === t.id);
              const submitted = roster.filter((p) => p.submittedAt);
              return (
                <section
                  key={t.id}
                  className="rounded-[3px] border border-[var(--hairline)] bg-card p-4"
                  style={{ borderTop: `4px solid ${t.color}` }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[15px] font-extrabold">{t.name}</span>
                    <span className="text-[11px] text-muted">
                      {roster.length} player{roster.length === 1 ? "" : "s"} · {tc.length} implications ·{" "}
                      {submitted.length}/{roster.length} submitted
                    </span>
                  </div>
                  <ImplicationTree cards={tc} scenarioTitle={view.config.scenarioTitle} />
                  {submitted.length > 0 && (
                    <div className="mt-4 border-t border-[var(--hairline)] pt-3">
                      <span className="eyebrow ink">Reflection</span>
                      <div className="mt-2 flex flex-col gap-4">
                        {submitted.map((p) => (
                          <div key={p.id}>
                            <div className="text-[12px] font-bold">{p.displayName || "Player"}</div>
                            <dl className="mt-1 flex flex-col gap-1.5">
                              {questions.map((q, i) => (
                                <div key={i} className="border-l-2 border-[var(--lime-deep)] pl-3">
                                  <dt className="text-[11.5px] font-semibold text-muted">{q}</dt>
                                  <dd className="text-[13px]">
                                    {p.answers[String(i)] || <span className="italic text-muted">—</span>}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </Shell>
    );
  }

  if (session.scope === "Cards") {
    // Resolve this session's deck from its project (global deck when project_id null).
    const { deck, ref } = await getDeckForProjectId(session.projectId);
    const [teams, drivers] = await Promise.all([
      getTeams(upper),
      getDriversForProjectRef(ref),
    ]);
    return (
      <Shell code={upper} session={session}>
        <AdminCardsSession code={upper} teams={teams} deck={deck.cards} drivers={drivers} />
      </Shell>
    );
  }

  // Single / Full — text submissions + reactions.
  const [results, { model, driverNameBySlug }] = await Promise.all([
    getSessionResults(upper),
    getModel(),
  ]);
  const scenarios = getScenarioList(model, driverNameBySlug);
  return (
    <Shell code={upper} session={session}>
      {results ? (
        <AdminResults results={results} scenarios={scenarios} />
      ) : (
        <p className="mt-8 text-[14px] text-muted">No results.</p>
      )}
    </Shell>
  );
}

function Shell({
  code,
  session,
  children,
}: {
  code: string;
  session?: { title: string; scope: string; status: string; prompt: string };
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-[1200px] px-6 py-10">
      <Link href="/admin" className="eyebrow blue">
        ← All sessions
      </Link>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <div>
          <h1 className="text-[28px] font-extrabold uppercase leading-[1.05] tracking-tight">
            {session?.title || `Session ${code}`}
          </h1>
          {session && (
            <p className="serif mt-1 text-[16px] italic text-muted">{session.prompt}</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-[12px] text-muted">
          {session && <span>{session.scope}</span>}
          <span className="rounded-[2px] border border-ink bg-lime px-2 py-1 text-[12px] font-bold uppercase tracking-[0.14em]">
            {code}
          </span>
        </div>
      </div>
      {children}
    </main>
  );
}
