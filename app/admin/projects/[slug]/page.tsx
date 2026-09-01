import Link from "next/link";
import { notFound } from "next/navigation";
import { listSessions, supabaseConfigured } from "@/lib/workshop";
import { listAllTeams } from "@/lib/teams";
import { getDeck } from "@/lib/cards";
import { listRippleMaps } from "@/lib/ripples";
import { getProjectBySlugAny } from "@/lib/projects";
import { listDesignGroups, implicationCountsByCode } from "@/lib/design-groups";
import { listExercises } from "@/lib/design-group-exercises";
import { getScenarios, foresightConfigured } from "@/lib/foresight/client";
import type { Card } from "@/lib/workshop-types";
import { AdminSessionsList } from "@/components/admin/AdminSessionsList";
import { AdminRippleMaps } from "@/components/admin/AdminRippleMaps";
import { AdminDesignGroups, type AdminScenarioOption } from "@/components/admin/AdminDesignGroups";
import { AdminTeamsManager } from "@/components/admin/AdminTeamsManager";
import { CardGameLauncher } from "@/components/CardGameLauncher";

export const dynamic = "force-dynamic";

const contentLink =
  "rounded-[3px] border border-[var(--rule)] bg-paper px-4 py-3 text-[13px] font-bold hover:border-ink hover:bg-card";

// Per-project admin: the global /admin surfaces (entries, sessions, kernels,
// launcher, stats) scoped to one project. Auto-gated for facilitators by proxy.ts.
export default async function ProjectAdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!supabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-16">
        <h1 className="text-[26px] font-extrabold uppercase tracking-tight">Project</h1>
        <p className="mt-3 text-[14px] text-muted">Database is not configured on the server.</p>
      </main>
    );
  }

  const project = await getProjectBySlugAny(slug);
  if (!project) notFound();

  const [sessions, teams, designGroups] = await Promise.all([
    listSessions({ projectId: project.id }),
    listAllTeams({ projectId: project.id }),
    listDesignGroups(project.id),
  ]);

  // Design groups: each group's exercises (weeks) + card counts per backing board,
  // plus the project's scenarios for the assignment picker (tolerate platform down).
  const groupExercises = await Promise.all(designGroups.map((g) => listExercises(g.id)));
  const exCounts = await implicationCountsByCode(
    groupExercises.flat().map((e) => e.sessionCode ?? "").filter(Boolean)
  );
  const designGroupRows = designGroups.map((g, i) => ({
    id: g.id,
    name: g.name,
    sort: g.sort,
    color: g.color,
    scenarioRef: g.scenarioRef,
    scenarioTitle: g.scenarioTitle,
    exercises: groupExercises[i].map((e) => ({
      id: e.id,
      sort: e.sort,
      title: e.title,
      type: e.type,
      sessionCode: e.sessionCode,
      locked: e.locked,
      opensAt: e.opensAt,
      sections: e.sections,
      cards: e.sessionCode ? exCounts.get(e.sessionCode.toUpperCase()) ?? 0 : 0,
    })),
  }));
  const foresightUp = foresightConfigured();
  let designScenarios: AdminScenarioOption[] = [];
  if (foresightUp) {
    try {
      const cards = await getScenarios({ ref: project.carmelitaProjectRef });
      designScenarios = cards.map((s) => ({ id: s.id, title: s.title, headline: s.headline }));
    } catch (err) {
      console.error("[project admin] failed to load scenarios for design groups", err);
    }
  }

  // Implication maps = this project's Ripples sessions. Roll up player/implication/
  // submitted counts, then keep the ones someone actually built on.
  const rippleSessions = sessions.map((s) => s.session).filter((s) => s.scope === "Ripples");
  const rippleMaps = rippleSessions.length
    ? (await listRippleMaps(rippleSessions)).filter((m) => m.implications > 0)
    : [];

  // This project's Carmelita deck (for the entries' triad cards). Tolerate the
  // platform being down — entries still list, just without their cards.
  let cards: Card[] = [];
  let deckDown = false;
  try {
    cards = (await getDeck(project.carmelitaProjectRef)).deck.cards;
  } catch {
    deckDown = true;
  }
  const cardsByProject: Record<string, Card[]> = { [project.id]: cards };
  const projectMeta = { [project.id]: { slug: project.slug, name: project.name } };
  const projectNameById = { [project.id]: project.name };

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-10">
      <Link href="/admin/projects" className="eyebrow blue">
        ← Projects
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow ink">
            Project admin{!project.enabled && " · disabled"}
          </span>
          <h1 className="mt-2 text-[30px] font-extrabold uppercase leading-[1.05] tracking-tight">
            {project.name}
          </h1>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-muted">
          <span>
            {teams.length} entries · {sessions.length} sessions
          </span>
          <a
            href={`/project/${project.slug}`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-blue underline hover:text-ink"
          >
            Open site →
          </a>
        </div>
      </div>

      {deckDown && (
        <p className="mt-4 rounded-[3px] border border-[var(--rule)] bg-card px-4 py-3 text-[13px] text-muted">
          The foresight platform for <span className="font-semibold text-ink">{project.carmelitaProjectRef}</span> is
          unreachable, so entries below may show without their cards.
        </p>
      )}

      <section className="mt-8">
        <span className="eyebrow ink">
          Content · Carmelita ({project.carmelitaProjectRef})
        </span>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href={`/project/${slug}/scenario-sets`} className={contentLink}>
            Scenario sets →
          </Link>
          <Link href={`/project/${slug}/drivers`} className={contentLink}>
            Drivers →
          </Link>
          <Link href={`/project/${slug}/uncertainties`} className={contentLink}>
            Uncertainties →
          </Link>
        </div>
      </section>

      <section className="mt-12">
        <span className="eyebrow ink">Run a card game</span>
        <div className="mt-3">
          <CardGameLauncher lockedProject={{ slug: project.slug, name: project.name }} />
        </div>
      </section>

      <section className="mt-12">
        <span className="eyebrow ink">Design groups</span>
        <p className="mt-2 max-w-[560px] text-[13px] leading-[1.5] text-muted">
          Set up the groups for this project and assign each one a scenario. Members
          self-select their group on the site&rsquo;s <span className="font-semibold text-ink">Design
          Groups</span> tab and build a shared implication map together, live. Finalize a
          group to lock its map into an output.
        </p>
        <AdminDesignGroups
          projectId={project.id}
          slug={slug}
          initialGroups={designGroupRows}
          scenarios={designScenarios}
          configured={foresightUp}
        />
      </section>

      <section className="mt-12">
        <span className="eyebrow ink">Run implication mapping</span>
        <p className="mt-2 max-w-[560px] text-[13px] leading-[1.5] text-muted">
          Pick one of this project&rsquo;s scenarios and have the room map its implications in three
          rounds, then answer the reflection questions.
        </p>
        <Link
          href={`/project/${slug}/workshop/ripples/new`}
          className="mt-3 inline-block rounded-[2px] border border-ink bg-lime px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.06em] hover:bg-lime-deep"
        >
          Set up implication mapping →
        </Link>
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="eyebrow ink">Entries</span>
          <Link
            href={`/admin/projects/${slug}/analysis`}
            className="text-[11px] font-bold uppercase tracking-[0.08em] text-blue underline hover:text-ink"
          >
            View analysis →
          </Link>
        </div>
        <AdminTeamsManager teams={teams} cardsByProject={cardsByProject} projectMeta={projectMeta} />
      </section>

      {rippleSessions.length > 0 && (
        <section className="mt-12">
          <span className="eyebrow ink">Implication maps</span>
          <AdminRippleMaps maps={rippleMaps} />
        </section>
      )}

      <section className="mt-12">
        <span className="eyebrow ink">All sessions</span>
        <AdminSessionsList sessions={sessions} projectNameById={projectNameById} />
      </section>
    </main>
  );
}
