import Link from "next/link";
import { getDrivers } from "@/lib/drivers";
import type { DriverLite } from "@/lib/drivers-shared";

export const dynamic = "force-dynamic";

export default async function DriversPage() {
  const drivers = await getDrivers();

  // Group by theme, preserving first-seen theme order and driver number order.
  const byTheme = new Map<string, DriverLite[]>();
  for (const d of [...drivers].sort((a, b) => a.number - b.number)) {
    const group = byTheme.get(d.theme) ?? [];
    group.push(d);
    byTheme.set(d.theme, group);
  }

  return (
    <main className="mx-auto min-h-screen max-w-[980px] px-6 py-12 md:py-16">
      <Link href="/" className="eyebrow blue">
        ← Home
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <h1 className="text-[34px] font-extrabold uppercase leading-[1.03] tracking-tight md:text-[44px]">
          Drivers
        </h1>
        <span className="text-[12px] text-muted">{drivers.length} drivers</span>
      </div>
      <p className="serif mt-4 max-w-[680px] text-[19px] leading-[1.35] text-ink">
        The biggest forces reshaping public health to 2035, grouped by the theme they belong to.
      </p>

      {[...byTheme.entries()].map(([theme, group]) => (
        <section key={theme} className="mt-12">
          <span className="eyebrow ink">{theme}</span>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {group.map((d) => (
              <article
                key={d.slug}
                className="rounded-[3px] border border-[var(--hairline)] bg-card p-5"
              >
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[12px] font-bold text-muted tabular-nums">
                    {String(d.number).padStart(2, "0")}
                  </span>
                  <h2 className="text-[18px] font-extrabold uppercase leading-[1.1] tracking-tight">
                    {d.name}
                  </h2>
                </div>
                {d.headline && (
                  <p className="serif mt-2 text-[15px] italic leading-[1.35] text-ink">
                    {d.headline}
                  </p>
                )}
                {d.body && (
                  <p className="mt-2.5 text-[13.5px] leading-[1.55] text-muted">{d.body}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
