import { listSessions, supabaseConfigured } from "@/lib/workshop";
import { listAllTeams } from "@/lib/teams";
import { getDeck } from "@/lib/cards";
import { AdminSessionsList } from "@/components/admin/AdminSessionsList";
import { AdminTeamsManager } from "@/components/admin/AdminTeamsManager";
import { SignOutButton } from "@/components/admin/SignOutButton";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!supabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-16">
        <h1 className="text-[26px] font-extrabold uppercase tracking-tight">Admin</h1>
        <p className="mt-3 text-[14px] text-muted">Database is not configured on the server.</p>
      </main>
    );
  }
  const [sessions, teams, { deck }] = await Promise.all([
    listSessions(),
    listAllTeams(),
    getDeck(),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow blue">Admin · facilitator</span>
          <h1 className="mt-2 text-[30px] font-extrabold uppercase leading-[1.05] tracking-tight">
            Teams &amp; sessions
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[12px] text-muted">
            {teams.length} teams · {sessions.length} sessions
          </span>
          <SignOutButton />
        </div>
      </div>

      <section className="mt-8">
        <span className="eyebrow ink">All teams</span>
        <AdminTeamsManager teams={teams} deck={deck.cards} />
      </section>

      <section className="mt-12">
        <span className="eyebrow ink">All sessions</span>
        <AdminSessionsList sessions={sessions} />
      </section>
    </main>
  );
}
