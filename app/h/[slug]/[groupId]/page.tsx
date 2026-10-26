import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { loadHandoff } from "@/lib/handoff";
import GroupSummaryView from "@/components/design-groups/GroupSummary";

export const dynamic = "force-dynamic";

// The PUBLIC handoff: the deck as a steering committee reads it.
//
// WHY IT IS NOT UNDER /project/<slug>. app/project/[title]/layout.tsx applies the project
// passphrase gate to that whole subtree, so anything living there is only as shareable as
// the project is open. A committee has no passphrase. Putting the reader at a top-level
// segment decouples "this handoff is shareable" from "this project happens to have no
// passphrase today", which is the condition that currently makes the group's own URL work.
//
// IT PASSES execOverride BUT NOT execEdit. The committee must read the lead the group
// actually wrote, so the override renders here exactly as it does on the group's own copy;
// omitting execEdit is what keeps the Edit control off. Nothing here reads getSessionUser,
// deliberately — a page whose output depends on who is looking is a page that will
// eventually show the wrong person a button.
//
// Gated by one project-wide switch, so revoking is flipping it back off. Group ids are
// uuids, so the URL is unguessable in practice; it is unlisted rather than secret.
export default async function PublicHandoffPage({
  params,
}: {
  params: Promise<{ slug: string; groupId: string }>;
}) {
  const { slug, groupId } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();
  if (!project.homeConfig.handoffPublic) notFound();

  const data = await loadHandoff(project.id, groupId);
  if (!data) notFound();

  return (
    <GroupSummaryView
      s={data.summary}
      implications={data.implications}
      projectSlug={slug}
      groupId={groupId}
      execOverride={data.execOverride}
      images={data.images}
      publicView
    />
  );
}
