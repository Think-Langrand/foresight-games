import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { getSessionUser } from "@/lib/supabase-auth";
import { getSessionByCode } from "@/lib/workshop";
import { getDesignGroup } from "@/lib/design-groups";
import { getExercise, listExercises } from "@/lib/design-group-exercises";
import { getRippleScenario, getRippleDrivers } from "@/lib/ripples";
import { exerciseStatus, getExerciseType, isBoardBacked, resolveEffectiveSections } from "@/lib/exercise-types";
import { shapeExerciseAnswers } from "@/lib/group-answers";
import { RipplesTeamView } from "@/components/workshop/RipplesTeamView";
import { WorksheetView } from "@/components/workshop/WorksheetView";
import { SessionTabs } from "@/components/design-groups/SessionTabs";
import type { ExerciseAnswers } from "@/components/design-groups/AnswerPanels";

export const dynamic = "force-dynamic";

function Gate({ backHref, title, children }: { backHref: string; title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-[720px] px-6 py-16">
      <Link href={backHref} className="eyebrow blue">
        ← Program
      </Link>
      <h1 className="mt-4 text-[28px] font-extrabold uppercase leading-[1.05] tracking-tight">{title}</h1>
      <p className="mt-3 text-[15px] text-muted">{children}</p>
    </main>
  );
}

// One exercise (week), full-screen. Gated on close + schedule (admins bypass both). A
// `closed` or not-yet-`scheduled` week is blocked for members; `locked` still renders
// read-only. The exercise type decides the renderer: the implications tree, the
// spec-driven worksheet, or a "being designed" placeholder. Earlier weeks' answers ride
// along as read-only session tabs (shaped server-side — their board codes never reach
// the client, so a closed earlier week stays viewable but not writable).
export default async function DesignGroupExercisePage({
  params,
}: {
  params: Promise<{ title: string; groupId: string; exerciseId: string }>;
}) {
  const { title, groupId, exerciseId } = await params;
  const project = await getProjectBySlug(title);
  if (!project) notFound();
  const group = await getDesignGroup(groupId);
  if (!group || group.projectId !== project.id) notFound();
  const exercise = await getExercise(exerciseId);
  if (!exercise || exercise.groupId !== group.id) notFound();

  const backHref = `/project/${title}/design-groups/${groupId}`;
  const status = exerciseStatus(exercise, Date.now());
  const isAdmin = Boolean(await getSessionUser());

  if (status === "placeholder" || !exercise.sessionCode) {
    return (
      <Gate backHref={backHref} title={exercise.title}>
        This exercise is being designed — it&rsquo;ll open here soon.
      </Gate>
    );
  }
  if (status === "closed" && !isAdmin) {
    return (
      <Gate backHref={backHref} title={exercise.title}>
        This exercise isn&rsquo;t open yet. Check back soon.
      </Gate>
    );
  }
  if (status === "scheduled" && !isAdmin) {
    const opens = exercise.opensAt ? new Date(exercise.opensAt).toLocaleDateString() : "soon";
    return (
      <Gate backHref={backHref} title={exercise.title}>
        This session opens on {opens}. Check back then.
      </Gate>
    );
  }

  const session = await getSessionByCode(exercise.sessionCode);
  if (!session) {
    return (
      <Gate backHref={backHref} title={exercise.title}>
        This exercise&rsquo;s board could not be loaded.
      </Gate>
    );
  }

  // Earlier weeks = lower sort, board-backed (placeholders skipped). Closed ones included:
  // they're shown read-only, and only their shaped answers are sent.
  const earlier = (await listExercises(groupId)).filter(
    (ex) => ex.sort < exercise.sort && isBoardBacked(ex.type) && ex.sessionCode
  );
  const [scenario, drivers, pastWeeks] = await Promise.all([
    getRippleScenario(session),
    getRippleDrivers(session),
    // Each earlier week loads independently: the tabs are ancillary, so one failing board
    // becomes an "unavailable" tab rather than taking down the live session.
    Promise.all(
      earlier.map((ex) =>
        shapeExerciseAnswers(ex, { scenarioTitle: group.scenarioTitle }).catch((err): ExerciseAnswers => {
          console.error(`[design-group session] earlier week ${ex.id} failed to load`, err);
          return { kind: "placeholder", exerciseId: ex.id, title: ex.title, unavailable: true };
        })
      )
    ),
  ]);
  const render = getExerciseType(exercise.type)?.render ?? "placeholder";

  if (render === "implications") {
    return (
      <SessionTabs currentTitle={exercise.title} pastWeeks={pastWeeks}>
        <RipplesTeamView
          code={session.code}
          scenario={scenario}
          drivers={drivers}
          basePath={`/project/${title}`}
          hiddenSections={project.homeConfig.hiddenScenarioSections}
          sections={resolveEffectiveSections(exercise.type, exercise.sections)}
        />
      </SessionTabs>
    );
  }
  if (render === "worksheet") {
    // Prefer the exercise's own (admin-edited) question snapshot; fall back to the code
    // template for pre-migration weeks that were never customized.
    const sections = resolveEffectiveSections(exercise.type, exercise.sections);
    return (
      <SessionTabs currentTitle={exercise.title} pastWeeks={pastWeeks}>
        <WorksheetView
          code={session.code}
          sections={sections}
          title={exercise.title}
          backHref={backHref}
          scenario={scenario}
          drivers={drivers}
          hiddenSections={project.homeConfig.hiddenScenarioSections}
        />
      </SessionTabs>
    );
  }
  return (
    <Gate backHref={backHref} title={exercise.title}>
      This exercise is being designed — it&rsquo;ll open here soon.
    </Gate>
  );
}
