import Link from "next/link";
import { listSessions, supabaseConfigured } from "@/lib/workshop";
import { listAllTeams } from "@/lib/teams";
import { getDeck } from "@/lib/cards";
import { AdminSessionsList } from "@/components/admin/AdminSessionsList";
import { AdminTeamsManager } from "@/components/admin/AdminTeamsManager";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { CardGameLauncher } from "@/components/CardGameLauncher";

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
            Entries &amp; sessions
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[12px] text-muted">
            {teams.length} entries · {sessions.length} sessions
          </span>
          <SignOutButton />
        </div>
      </div>

      <section className="mt-8">
        <span className="eyebrow ink">Content</span>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            href="/admin/drivers"
            className="rounded-[3px] border border-[var(--rule)] bg-paper px-4 py-3 text-[13px] font-bold hover:border-ink hover:bg-card"
          >
            Edit drivers →
          </Link>
          <Link
            href="/admin/uncertainties"
            className="rounded-[3px] border border-[var(--rule)] bg-paper px-4 py-3 text-[13px] font-bold hover:border-ink hover:bg-card"
          >
            Edit uncertainties &amp; outcomes →
          </Link>
          <Link
            href="/admin/projects"
            className="rounded-[3px] border border-[var(--rule)] bg-paper px-4 py-3 text-[13px] font-bold hover:border-ink hover:bg-card"
          >
            Manage projects →
          </Link>
        </div>
      </section>

      <section className="mt-12">
        <span className="eyebrow ink">Run a facilitated game</span>
        <div className="mt-3">
          <CardGameLauncher />
        </div>
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="eyebrow ink">Entries</span>
          <Link
            href="/admin/analysis"
            className="text-[11px] font-bold uppercase tracking-[0.08em] text-blue underline hover:text-ink"
          >
            View analysis →
          </Link>
        </div>
        <AdminTeamsManager teams={teams} deck={deck.cards} />
      </section>

      <section className="mt-12">
        <span className="eyebrow ink">All sessions</span>
        <AdminSessionsList sessions={sessions} />
      </section>
    </main>
  );
}
