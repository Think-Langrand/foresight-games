import Link from "next/link";
import Image from "next/image";
import { getModel } from "@/lib/model";
import { MarkText } from "@/components/Mark";
import { JoinSession } from "@/components/JoinSession";
import type { StaticImageData } from "next/image";
import communityWellness from "@/public/image2.png";
import muralStreet from "@/public/image3.png";
import ecoCityVista from "@/public/image4.png";
import solarpunkCity from "@/public/image5.png";

// One image per entry card, matched to what each destination is about.
const cardImages = {
  play: communityWellness, // human-scale, inviting — where you begin
  gallery: muralStreet, // "Our Health, Our Community, Our Future" — the room's made worlds
  drivers: ecoCityVista, // epic forces reshaping the future
  uncertainties: solarpunkCity, // a dense open world of what-ifs
} satisfies Record<string, StaticImageData>;

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
          image={cardImages.play}
          accent
        />
        <EntryCard
          href="/scenario-molecules"
          eyebrow="The gallery"
          title="View entries"
          body="Every submitted scenario starter built so far — drivers and uncertainties bound into small worlds. See what the room has made."
          image={cardImages.gallery}
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
          image={cardImages.drivers}
        />
        <EntryCard
          href="/uncertainties"
          eyebrow="Browse the model"
          title="Uncertainties"
          body="The sharpest open questions that cut across the drivers, each with the ways it could resolve — the outcome cards the game is built from."
          image={cardImages.uncertainties}
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
  image,
  accent,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  image: StaticImageData;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group relative flex min-h-[260px] flex-col justify-end overflow-hidden rounded-[3px] border border-[var(--hairline)] p-6 transition-colors hover:border-ink"
      style={accent ? { borderTop: "3px solid var(--lime-deep)" } : undefined}
    >
      <Image
        src={image}
        alt=""
        placeholder="blur"
        sizes="(max-width: 768px) 100vw, 480px"
        className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.05]"
      />
      {/* Scrim: dark from the bottom for legible text, plus a wash over the whole card. */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(to top, rgba(13,28,61,0.90) 8%, rgba(13,28,61,0.50) 45%, rgba(13,28,61,0.20) 100%)",
        }}
      />
      <span className="eyebrow" style={{ color: "rgba(255,255,255,0.75)" }}>
        {eyebrow}
      </span>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-sans text-[26px] font-extrabold uppercase tracking-tight text-white">
          {title}
        </span>
        <span className="text-lime transition-transform group-hover:translate-x-1">→</span>
      </div>
      <p className="mt-3 text-[13.5px] leading-[1.55] text-white/80">{body}</p>
    </Link>
  );
}
