import Link from "next/link";
import { listSessions, supabaseConfigured } from "@/lib/workshop";
import { listAllTeams } from "@/lib/teams";
import { getDeck } from "@/lib/cards";
import { listProjects } from "@/lib/projects";
import type { Card } from "@/lib/workshop-types";
import { AdminSessionsList } from "@/components/admin/AdminSessionsList";
import { AdminTeamsManager } from "@/components/admin/AdminTeamsManager";
import { SignOutButton } from "@/components/admin/SignOutButton";

export const dynamic = "force-dynamic";

// The global archive: every entry and every session across all projects, including the
// ones with no project at all. Lives here rather than on /admin so the hub stays a fast
// set of links — this page is the one that pays for listAllTeams + a deck per project.
export default async function AdminSessionsPage() {
  if (!supabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-16">
        <h1 className="text-[26px] font-extrabold uppercase tracking-tight">Entries &amp; sessions</h1>
        <p className="mt-3 text-[14px] text-muted">Database is not configured on the server.</p>
      </main>
    );
  }
  const [sessions, teams, projects, globalDeck] = await Promise.all([
    listSessions(),
    listAllTeams(),
    listProjects(),
    getDeck(),
  ]);

  // Card codes collide across projects, so the admin resolves one deck per project
  // present among the teams (plus the global deck). A project whose Carmelita
  // backend is down degrades to no triad cards rather than 500-ing the admin.
  const projById = new Map(projects.map((p) => [p.id, p]));
  const projectIds = [...new Set(teams.map((t) => t.projectId).filter((x): x is string => Boolean(x)))];
  const projDeckEntries = await Promise.all(
    projectIds.map(async (id): Promise<[string, Card[]]> => {
      const p = projById.get(id);
      try {
        const { deck } = await getDeck(p?.carmelitaProjectRef ?? undefined);
        return [id, deck.cards];
      } catch {
        return [id, []];
      }
    })
  );
  const cardsByProject: Record<string, Card[]> = {
    global: globalDeck.deck.cards,
    ...Object.fromEntries(projDeckEntries),
  };
  const projectMeta = Object.fromEntries(
    projects.map((p) => [p.id, { slug: p.slug, name: p.name }])
  );
  const projectNameById = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-10">
      <Link href="/admin" className="eyebrow blue">
        ← Admin
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow ink">All projects</span>
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="eyebrow ink">Entries</span>
          <Link
            href="/admin/analysis"
            className="text-[11px] font-bold uppercase tracking-[0.08em] text-blue underline hover:text-ink"
          >
            View analysis →
          </Link>
        </div>
        <AdminTeamsManager
          teams={teams}
          cardsByProject={cardsByProject}
          projectMeta={projectMeta}
        />
      </section>

      <section className="mt-12">
        <span className="eyebrow ink">All sessions</span>
        <AdminSessionsList sessions={sessions} projectNameById={projectNameById} />
      </section>
    </main>
  );
}
