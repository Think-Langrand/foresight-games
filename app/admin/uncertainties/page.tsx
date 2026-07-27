import Link from "next/link";
import { getUncertaintyRows } from "@/lib/cards";
import { getDrivers } from "@/lib/drivers";
import { supabaseConfigured } from "@/lib/workshop";
import { AdminUncertaintiesManager } from "@/components/admin/AdminUncertaintiesManager";

export const dynamic = "force-dynamic";

export default async function AdminUncertaintiesPage() {
  if (!supabaseConfigured()) {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-16">
        <h1 className="text-[26px] font-extrabold uppercase tracking-tight">Uncertainties</h1>
        <p className="mt-3 text-[14px] text-muted">Database is not configured on the server.</p>
      </main>
    );
  }
  const [uncertainties, drivers] = await Promise.all([getUncertaintyRows(), getDrivers()]);

  return (
    <main className="mx-auto min-h-screen max-w-[1000px] px-6 py-10">
      <Link href="/admin" className="eyebrow blue">
        ← Admin
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow ink">Content · the deck</span>
          <h1 className="mt-2 text-[30px] font-extrabold uppercase leading-[1.05] tracking-tight">
            Uncertainties
          </h1>
        </div>
        <Link
          href="/uncertainties"
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-blue underline hover:text-ink"
        >
          View public page →
        </Link>
      </div>

      <AdminUncertaintiesManager uncertainties={uncertainties} drivers={drivers} />
    </main>
  );
}
