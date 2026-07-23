import { listSessions, supabaseConfigured } from "@/lib/workshop";
import { AdminSessionsList } from "@/components/admin/AdminSessionsList";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!supabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-16">
        <h1 className="text-[26px] font-extrabold uppercase tracking-tight">Admin</h1>
        <p className="mt-3 text-[14px] text-muted">Database is not configured on the server.</p>
      </main>
    );
  }
  const sessions = await listSessions();

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow blue">Admin</span>
          <h1 className="mt-2 text-[30px] font-extrabold uppercase leading-[1.05] tracking-tight">
            Sessions
          </h1>
        </div>
        <span className="text-[12px] text-muted">{sessions.length} total</span>
      </div>

      <div className="mt-4 rounded-[3px] border border-amber bg-amber/10 px-4 py-2.5 text-[12px] leading-[1.5]">
        <span className="font-bold uppercase tracking-[0.06em]">No auth yet</span> — this page is
        readable and can delete data by anyone with the URL. Add access control before sharing.
      </div>

      <AdminSessionsList sessions={sessions} />
    </main>
  );
}
