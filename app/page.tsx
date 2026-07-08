import Link from "next/link";
import { getModel } from "@/lib/model";
import { MarkText } from "@/components/Mark";

export default async function Home() {
  const { model, source } = await getModel();
  const drivers = model.drivers.length;
  let uncertainties = 0;
  let outcomes = 0;
  for (const d of model.drivers) {
    uncertainties += d.uncertainties.length;
    for (const u of d.uncertainties) outcomes += u.outcomes.length;
  }

  return (
    <main className="mx-auto max-w-[980px] px-6 py-16 md:py-24">
      <span className="eyebrow blue">NNPHI · Foresight for Public Health · to 2035</span>
      <h1
        className="mt-4 font-sans font-extrabold uppercase leading-[1.02] tracking-tight"
        style={{ fontSize: "clamp(34px, 6vw, 60px)" }}
      >
        <MarkText>Future of Public Health</MarkText>
      </h1>
      <p className="serif mt-6 max-w-[720px] text-[22px] leading-[1.35] text-ink md:text-[26px]">
        A relational model of how public health could change by 2035, and a live room for a
        workshop to argue with it: the biggest drivers, their sharpest uncertainties, and the
        ways each could resolve.
      </p>

      <div className="mt-12 grid gap-5 md:grid-cols-2">
        <EntryCard
          href="/explore"
          eyebrow="Browse the model"
          title="Explore"
          body="Step through the drivers and their uncertainties. See the outcomes each can resolve into, their alignment, and how they hit the systems maps."
        />
        <EntryCard
          href="/workshop"
          eyebrow="Run it live"
          title="Workshop"
          body="Open any uncertainty as a live session. Participants add ways it could play out and react to the outcomes on their phones; results land in Airtable and show on the screen."
          accent
        />
      </div>

      <div className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--rule)] pt-5 text-[12px] text-muted">
        <span className="font-semibold">
          {drivers} drivers · {uncertainties} uncertainties · {outcomes} outcomes
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: source === "airtable" ? "var(--green)" : "var(--amber)" }}
          />
          {source === "airtable"
            ? "Live from Airtable"
            : "Bundled snapshot (Airtable not connected)"}
        </span>
      </div>
    </main>
  );
}

function EntryCard({
  href,
  eyebrow,
  title,
  body,
  accent,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-[3px] border border-[var(--hairline)] bg-card p-6 transition-colors hover:border-ink"
      style={accent ? { borderTop: "3px solid var(--lime-deep)" } : undefined}
    >
      <span className="eyebrow">{eyebrow}</span>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-sans text-[26px] font-extrabold uppercase tracking-tight">
          {title}
        </span>
        <span className="text-lime-deep transition-transform group-hover:translate-x-1">→</span>
      </div>
      <p className="mt-3 text-[13.5px] leading-[1.55] text-muted">{body}</p>
    </Link>
  );
}
