import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { getSessionUser } from "@/lib/supabase-auth";
import { cookieNameFor, verifyUnlock } from "@/lib/project-gate";
import { ProjectGate } from "@/components/project/ProjectGate";

// Route-family gate. Resolves the project for every /project/<title>/* request;
// if it has a passphrase and the request lacks a valid unlock cookie, renders the
// gate INSTEAD of `children` — so the page subtree (and its Foresight fetch) never
// runs. A project with no passphrase is never gated. Reading cookies() opts these
// routes into dynamic rendering, which is already the case (all are force-dynamic).
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ title: string }>;
}) {
  const { title } = await params;
  const project = await getProjectBySlug(title);
  if (!project) notFound();

  // No passphrase set => open project, never gate (and skip the cookie read).
  if (!project.passphraseHash) return <>{children}</>;

  const store = await cookies();
  const unlocked = verifyUnlock(
    project.id,
    store.get(cookieNameFor(project.id))?.value
  );
  if (unlocked) return <>{children}</>;

  // Facilitator bypass: a signed-in admin can view any project's gated content
  // without its passphrase (so the admin dashboard's View/Open links just work).
  // Checked only here — open/unlocked requests never pay the auth round-trip.
  if (await getSessionUser()) return <>{children}</>;

  return <ProjectGate title={title} projectName={project.name} />;
}
