import Link from "next/link";
import { getSessionByCode, getSessionResults, supabaseConfigured } from "@/lib/workshop";
import { getTeams } from "@/lib/teams";
import { getDeck } from "@/lib/cards";
import { getDrivers } from "@/lib/drivers";
import { getModel, getScenarioList } from "@/lib/model";
import { AdminCardsSession } from "@/components/admin/AdminCardsSession";
import { AdminResults } from "@/components/admin/AdminResults";

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

  if (session.scope === "Cards") {
    const [teams, { deck }, drivers] = await Promise.all([
      getTeams(upper),
      getDeck(),
      getDrivers(),
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
