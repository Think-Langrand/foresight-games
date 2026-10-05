import Link from "next/link";
import { supabaseConfigured } from "@/lib/workshop";
import { listProjects } from "@/lib/projects";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { CardGameLauncher } from "@/components/CardGameLauncher";
import { AdminProjectsManager, type AdminProject } from "@/components/admin/AdminProjectsManager";

export const dynamic = "force-dynamic";

const contentLink =
  "rounded-[3px] border border-[var(--rule)] bg-paper px-4 py-3 text-[13px] font-bold hover:border-ink hover:bg-card";

// The facilitator's hub: a way into each project and into the content editors, nothing
// more. The cross-project entries and sessions tables live at /admin/sessions — keeping
// them off here is what lets this page render on one query instead of a deck per project.
export default async function AdminPage() {
  if (!supabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-16">
        <h1 className="text-[26px] font-extrabold uppercase tracking-tight">Admin</h1>
        <p className="mt-3 text-[14px] text-muted">Database is not configured on the server.</p>
      </main>
    );
  }
  const projects = await listProjects();
  const launcherProjects = projects.filter((p) => p.enabled).map((p) => ({ slug: p.slug, name: p.name }));
  // The same cards as Manage projects — dashboard, activity, edit, delete, new — so a
  // project can be worked on from here. The passphrase hash never reaches the client.
  const adminProjects: AdminProject[] = projects.map(({ passphraseHash, ...p }) => ({
    ...p,
    hasPassphrase: Boolean(passphraseHash),
  }));

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow blue">Admin · facilitator</span>
          <h1 className="mt-2 text-[30px] font-extrabold uppercase leading-[1.05] tracking-tight">
            Admin
          </h1>
        </div>
        <SignOutButton />
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="eyebrow ink">Projects</span>
          <Link
            href="/admin/projects"
            className="text-[11px] font-bold uppercase tracking-[0.08em] text-blue underline hover:text-ink"
          >
            Manage projects →
          </Link>
        </div>
        <AdminProjectsManager projects={adminProjects} />
      </section>

      <section className="mt-12">
        <span className="eyebrow ink">Content</span>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href="/admin/drivers" className={contentLink}>
            Edit drivers →
          </Link>
          <Link href="/admin/uncertainties" className={contentLink}>
            Edit uncertainties &amp; outcomes →
          </Link>
          <Link href="/admin/projects" className={contentLink}>
            Manage projects →
          </Link>
          <Link href="/admin/templates" className={contentLink}>
            Exercise templates →
          </Link>
        </div>
      </section>

      <section className="mt-12">
        <span className="eyebrow ink">Run a facilitated game</span>
        <div className="mt-3">
          <CardGameLauncher projects={launcherProjects} />
        </div>
      </section>

      <section className="mt-12">
        <span className="eyebrow ink">Across all projects</span>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href="/admin/sessions" className={contentLink}>
            Entries &amp; sessions →
          </Link>
          <Link href="/admin/analysis" className={contentLink}>
            Analysis →
          </Link>
        </div>
      </section>
    </main>
  );
}
