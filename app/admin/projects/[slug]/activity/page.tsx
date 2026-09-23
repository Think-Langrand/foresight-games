import { notFound } from "next/navigation";
import { supabaseConfigured } from "@/lib/workshop";
import { getProjectBySlugAny } from "@/lib/projects";
import { getProgramActivity } from "@/lib/design-activity";
import { shapeExerciseAnswers } from "@/lib/group-answers";
import { AdminProgramActivity, type WeekDetail } from "@/components/admin/AdminProgramActivity";

export const dynamic = "force-dynamic";

// Admin: the project's program seen week-first — a weeks × groups grid of how much each
// group has added, and (with ?week=<n>, 1-based) that one week opened across every group.
// The grid is cheap: two batched queries for the whole project. The detail costs one board
// read per group, so it's loaded only when a week is actually open.
export default async function ProjectActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { slug } = await params;
  const { week } = await searchParams;
  if (!supabaseConfigured()) notFound();

  const project = await getProjectBySlugAny(slug);
  if (!project) notFound();

  const activity = await getProgramActivity(project.id);
  const { program, groups, exercisesByGroup } = activity;

  // ?week is 1-based to match the column labels; anything out of range just shows the grid.
  const weekNo = Number(week);
  const weekIndex =
    Number.isInteger(weekNo) && weekNo >= 1 && weekNo <= program.weeks.length ? weekNo - 1 : null;

  let weekDetail: WeekDetail | undefined;
  if (weekIndex !== null) {
    const w = program.weeks[weekIndex];
    const byGroup = await Promise.all(
      groups.map(async (g) => {
        const exId = w.slots[g.id];
        const ex = exercisesByGroup[g.id]?.find((e) => e.id === exId);
        if (!ex) return null;
        const answers = await shapeExerciseAnswers(ex, {
          scenarioTitle: g.scenarioTitle,
          includeRemoved: true,
        });
        return { groupId: g.id, exerciseId: ex.id, answers };
      })
    );
    weekDetail = {
      index: weekIndex,
      title: w.title,
      groups: byGroup.filter((x): x is NonNullable<typeof x> => x !== null),
    };
  }

  return (
    <AdminProgramActivity
      slug={slug}
      projectName={project.name}
      program={program}
      tallyByCode={activity.tallyByCode}
      peopleByCode={activity.peopleByCode}
      namesByPlayerId={activity.namesByPlayerId}
      weekDetail={weekDetail}
    />
  );
}
