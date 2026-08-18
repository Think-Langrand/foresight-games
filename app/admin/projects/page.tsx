import Link from "next/link";
import { supabaseConfigured } from "@/lib/supabase";
import { listProjects } from "@/lib/projects";
import {
  AdminProjectsManager,
  type AdminProject,
} from "@/components/admin/AdminProjectsManager";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  if (!supabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-16">
        <h1 className="text-[26px] font-extrabold uppercase tracking-tight">Projects</h1>
        <p className="mt-3 text-[14px] text-muted">Database is not configured on the server.</p>
      </main>
    );
  }

  // Strip the passphrase hash before it reaches the client; expose only a boolean.
  const projects: AdminProject[] = (await listProjects()).map(
    ({ passphraseHash, ...p }) => ({ ...p, hasPassphrase: Boolean(passphraseHash) })
  );

  return (
    <main className="mx-auto min-h-screen max-w-[1000px] px-6 py-10">
      <Link href="/admin" className="eyebrow blue">
        ← Admin
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow ink">Multi-tenant</span>
          <h1 className="mt-2 text-[30px] font-extrabold uppercase leading-[1.05] tracking-tight">
            Projects
          </h1>
        </div>
      </div>
      <p className="mt-4 max-w-[720px] text-[13px] text-muted">
        Each project is a gated micro-site at <code>/project/&lt;slug&gt;</code>. Its
        scenario sets come from the Carmelita project id you set here; the password is
        stored only as a hash and validated on the server.
      </p>

      <AdminProjectsManager projects={projects} />
    </main>
  );
}
