import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { getSessionUser } from "@/lib/supabase-auth";
import { loadHandoff } from "@/lib/handoff";
import GroupSummaryView from "@/components/design-groups/GroupSummary";

export const dynamic = "force-dynamic";

// A group's HANDOFF, the editable copy. Sibling of the [exerciseId] board route — `summary`
// is a static segment, so it wins over the dynamic one (exercise ids are uuids, so nothing
// collides).
//
// THE GROUP'S COPY, not the committee's. The same deck is served outside the project
// passphrase gate at /h/<slug>/<groupId>; both render from loadHandoff so the two cannot
// drift. Both are read-only: the lead is written on Session 4's "Handoff"
// step, not here.
export default async function DesignGroupSummaryPage({
  params,
}: {
  params: Promise<{ title: string; groupId: string }>;
}) {
  const { title, groupId } = await params;
  const project = await getProjectBySlug(title);
  if (!project) notFound();

  // The hub hides the link to this page unless the project has turned the handoff on, so
  // gate the route too — otherwise an old bookmark walks straight past the switch. Admins
  // read it either way, which is how they check a draft before revealing it.
  const isAdmin = Boolean(await getSessionUser());
  if (!project.homeConfig.handoffVisible && !isAdmin) notFound();

  const data = await loadHandoff(project.id, groupId);
  if (!data) notFound();

  return (
    <GroupSummaryView
      s={data.summary}
      implications={data.implications}
      projectSlug={title}
      groupId={groupId}
      execOverride={data.execOverride}
      images={data.images}
      scenario={data.scenario}
    />
  );
}
