import Link from "next/link";
import { supabaseConfigured } from "@/lib/supabase";
import { listTemplates, ensureDefaultTemplates } from "@/lib/exercise-templates";
import { AdminTemplates } from "@/components/admin/AdminTemplates";

export const dynamic = "force-dynamic";

// The global exercise-template library. Auto-gated for facilitators by proxy.ts (like the
// rest of /admin). Seeds the built-ins on first load, then hands the list to the editor.
export default async function AdminTemplatesPage() {
  if (!supabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-16">
        <h1 className="text-[26px] font-extrabold uppercase tracking-tight">Templates</h1>
        <p className="mt-3 text-[14px] text-muted">Database is not configured on the server.</p>
      </main>
    );
  }
  await ensureDefaultTemplates();
  const templates = await listTemplates();

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-10">
      <Link href="/admin" className="eyebrow blue">
        ← Admin
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow ink">Content</span>
          <h1 className="mt-2 text-[30px] font-extrabold uppercase leading-[1.05] tracking-tight">
            Exercise templates
          </h1>
        </div>
        <span className="text-[12px] text-muted">{templates.length} templates</span>
      </div>
      <p className="mt-4 max-w-[560px] text-[13px] leading-[1.5] text-muted">
        Build reusable exercises once — a set of question and brainstorm blocks — and stamp
        them into any design group from its weeks table. Editing a template here never
        changes a group that already ran it.
      </p>
      <AdminTemplates initialTemplates={templates} />
    </main>
  );
}
