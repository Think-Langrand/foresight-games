import Link from "next/link";
import { getModel } from "@/lib/model";
import { MarkText } from "@/components/Mark";
import { JoinSession } from "@/components/JoinSession";

export default async function Home() {
  const { model, source } = await getModel();
  const scenarios = model.scenarioUncertainties.length;
  const referencedDrivers = new Set(
    model.scenarioUncertainties.flatMap((s) => s.sourceDriverIds)
  ).size;

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
        A relational model of how public health could change by 2035, and a live room to argue with
        it: build a future from the scenario cards, and browse the biggest drivers and their
        sharpest uncertainties.
      </p>

      <div className="mt-12 grid gap-5 md:grid-cols-2">
        <EntryCard
          href="/play"
          eyebrow="Play the card game"
          title="Start a future"
          body="Deal yourself a hand of outcomes and build a small future scenario."
          accent
        />
        <EntryCard
          href="/scenario-molecules"
          eyebrow="The gallery"
          title="View entries"
          body="Every future scenario built so far — drivers and uncertainties bound into small worlds. See what the room has made."
        />
      </div>

      <div className="mt-5">
        <JoinSession />
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <EntryCard
          href="/drivers"
          eyebrow="Browse the model"
          title="Drivers"
          body="The biggest forces reshaping public health to 2035 — each driver, the theme it belongs to, and the headline shift it names."
        />
        <EntryCard
          href="/uncertainties"
          eyebrow="Browse the model"
          title="Uncertainties"
          body="The sharpest open questions that cut across the drivers, each with the ways it could resolve — the outcome cards the game is built from."
        />
      </div>

      <div className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--rule)] pt-5 text-[12px] text-muted">
        <span className="font-semibold">
          {referencedDrivers} drivers · {scenarios} scenario uncertainties
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: source === "supabase" ? "var(--green)" : "var(--amber)" }}
          />
          {source === "supabase"
            ? "Live from Supabase"
            : "Bundled snapshot (database not connected)"}
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
