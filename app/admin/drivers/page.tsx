import Link from "next/link";
import { getDrivers } from "@/lib/drivers";
import { supabaseConfigured } from "@/lib/workshop";
import { AdminDriversManager } from "@/components/admin/AdminDriversManager";

export const dynamic = "force-dynamic";

export default async function AdminDriversPage() {
  if (!supabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-16">
        <h1 className="text-[26px] font-extrabold uppercase tracking-tight">Drivers</h1>
        <p className="mt-3 text-[14px] text-muted">Database is not configured on the server.</p>
      </main>
    );
  }
  const drivers = await getDrivers();

  return (
    <main className="mx-auto min-h-screen max-w-[1000px] px-6 py-10">
      <Link href="/admin" className="eyebrow blue">
        ← Admin
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow ink">Content · curated</span>
          <h1 className="mt-2 text-[30px] font-extrabold uppercase leading-[1.05] tracking-tight">
            Drivers
          </h1>
        </div>
        <Link
          href="/drivers"
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-blue underline hover:text-ink"
        >
          View public page →
        </Link>
      </div>

      <AdminDriversManager drivers={drivers} />
    </main>
  );
}
