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
// THE GROUP'S COPY, not the committee's. The same deck is served read-only and outside the
// project passphrase gate at /h/<slug>/<groupId>; both render from loadHandoff so the two
// cannot drift. This one passes `exec`, which is what puts the Edit control on slide 02.
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
      // Presence is what makes slide 02 editable. Whoever can reach this page may edit:
      // there is no group-membership record to check against — see the route's own header —
      // so the honest gate is the board player row the API enforces, not anything here.
      execEdit={{ week4Code: data.week4Code }}
    />
  );
}
