import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { getSessionUser } from "@/lib/supabase-auth";
import { getSessionByCode } from "@/lib/workshop";
import { getDesignGroup } from "@/lib/design-groups";
import { getExercise } from "@/lib/design-group-exercises";
import { getRippleScenario, getRippleDrivers } from "@/lib/ripples";
import { exerciseStatus, getExerciseType } from "@/lib/exercise-types";
import { RipplesTeamView } from "@/components/workshop/RipplesTeamView";
import { WorksheetView } from "@/components/workshop/WorksheetView";

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

// One exercise (week), full-screen. Gated on schedule + lock (admins bypass the
// schedule). The exercise type decides the renderer: the implications tree, the
// spec-driven worksheet, or a "being designed" placeholder.
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
  if (status === "scheduled" && !isAdmin) {
    const opens = exercise.opensAt ? new Date(exercise.opensAt).toLocaleDateString() : "soon";
    return (
      <Gate backHref={backHref} title={exercise.title}>
        This week opens on {opens}. Check back then.
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

  const [scenario, drivers] = await Promise.all([
    getRippleScenario(session),
    getRippleDrivers(session),
  ]);
  const render = getExerciseType(exercise.type)?.render ?? "placeholder";

  if (render === "implications") {
    return (
      <RipplesTeamView
        code={session.code}
        scenario={scenario}
        drivers={drivers}
        basePath={`/project/${title}`}
      />
    );
  }
  if (render === "worksheet") {
    // Prefer the exercise's own (admin-edited) question snapshot; fall back to the code
    // template for pre-migration weeks that were never customized.
    const sections =
      exercise.sections.length > 0 ? exercise.sections : getExerciseType(exercise.type)?.sections ?? [];
    return (
      <WorksheetView
        code={session.code}
        sections={sections}
        title={exercise.title}
        backHref={backHref}
        scenario={scenario}
        drivers={drivers}
      />
    );
  }
  return (
    <Gate backHref={backHref} title={exercise.title}>
      This exercise is being designed — it&rsquo;ll open here soon.
    </Gate>
  );
}
