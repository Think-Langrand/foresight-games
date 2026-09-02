import Link from "next/link";
import type { StaticImageData } from "next/image";
import { MarkText } from "@/components/Mark";
import { JoinSession } from "@/components/JoinSession";
import type { HomeItem, HomeItemKey } from "@/lib/project-home";
import scenarioSetsImg from "@/public/image.png";
import playImg from "@/public/image2.png";
import galleryImg from "@/public/image3.png";
import driversImg from "@/public/image4.png";
import uncertaintiesImg from "@/public/image5.png";

// The per-project home. Mirrors the global homepage (app/page.tsx) but is driven
// by the project's `home_config`: only `visible` items render, in stored order.
//
// Only "scenario-sets" is genuinely per-project (its own Carmelita ref). The game
// items (play/gallery/drivers/uncertainties) link to the shared GLOBAL routes for
// now — they become project-scoped once the platform exposes per-project model.

type CardKey = Exclude<HomeItemKey, "join">;

interface CardDef {
  eyebrow: string;
  title: string;
  body: string;
  image: StaticImageData;
  accent?: boolean;
  href: (slug: string) => string;
}

const CARD_ITEMS: Record<CardKey, CardDef> = {
  "scenario-sets": {
    eyebrow: "From the foresight platform",
    title: "Scenarios",
    body: "Explore this project's divergent future-worlds — open one and read how it could unfold.",
    image: scenarioSetsImg,
    accent: true,
    href: (slug) => `/project/${slug}/scenario-sets`,
  },
  play: {
    eyebrow: "Play the card game",
    title: "Start a future",
    body: "Deal yourself a hand of this project's outcome cards and build a small future scenario.",
    image: playImg,
    href: (slug) => `/project/${slug}/play`,
  },
  ripples: {
    eyebrow: "Play solo",
    title: "Implication mapping",
    body: "Pick one of this project's scenarios and work out what follows — map its implications outward, one consequence leading to the next.",
    image: driversImg,
    accent: true,
    href: (slug) => `/project/${slug}/play/ripples`,
  },
  "design-groups": {
    eyebrow: "Work as a group",
    title: "Design Groups",
    body: "Join your design group and build a shared implication map together — everyone adds notes and consequences to the same board, live.",
    image: playImg,
    accent: true,
    href: (slug) => `/project/${slug}/design-groups`,
  },
  gallery: {
    eyebrow: "The gallery",
    title: "View entries",
    body: "Every scenario built for this project — drivers and uncertainties bound into small worlds.",
    image: galleryImg,
    href: (slug) => `/project/${slug}/scenario-molecules`,
  },
  drivers: {
    eyebrow: "Browse the model",
    title: "Drivers",
    body: "The biggest forces reshaping the future — each driver and the headline shift it names, pulled live for this project.",
    image: driversImg,
    href: (slug) => `/project/${slug}/drivers`,
  },
  uncertainties: {
    eyebrow: "Browse the model",
    title: "Uncertainties",
    body: "The sharpest open questions that cut across the drivers, each with the ways it could resolve — this project's outcome cards.",
    image: uncertaintiesImg,
    href: (slug) => `/project/${slug}/uncertainties`,
  },
};

// Walk the visible items into ordered segments: runs of cards (rendered as a
// 2-col grid) interleaved with any `join` strips (full-width), preserving order.
type Segment = { type: "cards"; keys: CardKey[] } | { type: "join" };

function toSegments(items: HomeItem[]): Segment[] {
  const segments: Segment[] = [];
  for (const item of items) {
    if (!item.visible) continue;
    if (item.key === "join") {
      segments.push({ type: "join" });
      continue;
    }
    const last = segments[segments.length - 1];
    if (last && last.type === "cards") last.keys.push(item.key);
    else segments.push({ type: "cards", keys: [item.key] });
  }
  return segments;
}

export function ProjectHome({
  projectName,
  slug,
  items,
  scenariosHref,
}: {
  projectName: string;
  slug: string;
  items: HomeItem[];
  scenariosHref?: string; // where the "Scenarios" card points (resolved server-side)
}) {
  // The top two cards render full-width (stacked "hero" rows); everything after keeps the
  // 2-up grid. Heroes are the leading run of card items (stop at a join strip or after 2).
  const visible = items.filter((i) => i.visible);
  const heroKeys: CardKey[] = [];
  let cut = 0;
  while (cut < visible.length && heroKeys.length < 2 && visible[cut].key !== "join") {
    heroKeys.push(visible[cut].key as CardKey);
    cut++;
  }
  const restSegments = toSegments(visible.slice(cut));

  const card = (key: CardKey, wide = false) => {
    const def = CARD_ITEMS[key];
    // The Scenarios card jumps straight into a set's scenarios (resolved server-side).
    const href = key === "scenario-sets" && scenariosHref ? scenariosHref : def.href(slug);
    return (
      <EntryCard
        key={key}
        href={href}
        eyebrow={def.eyebrow}
        title={def.title}
        body={def.body}
        image={def.image}
        accent={def.accent}
        wide={wide}
      />
    );
  };

  return (
    <main className="mx-auto max-w-[980px] px-6 py-16 md:py-24">
      <span className="eyebrow blue">Foresight</span>
      <h1
        className="mt-4 font-sans font-extrabold uppercase leading-[1.02] tracking-tight"
        style={{ fontSize: "clamp(34px, 6vw, 60px)" }}
      >
        <MarkText>{projectName}</MarkText>
      </h1>
      <p className="serif mt-6 max-w-[720px] text-[22px] leading-[1.35] text-ink md:text-[26px]">
        A live space to explore this project&rsquo;s futures: browse the scenario sets,
        build a world from the cards, and dig into the drivers and their sharpest
        uncertainties.
      </p>

      <div className="mt-12 flex flex-col gap-5">
        {heroKeys.map((key) => card(key, true))}
        {restSegments.map((seg, i) =>
          seg.type === "join" ? (
            <JoinSession key={`join-${i}`} basePath={`/project/${slug}`} />
          ) : (
            <div key={`cards-${i}`} className="grid gap-5 md:grid-cols-2">
              {seg.keys.map((key) => card(key))}
            </div>
          )
        )}
      </div>

      <div className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--rule)] pt-5 text-[12px] text-muted">
        <span className="font-semibold">Langrand 2026</span>
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
  image: StaticImageData; // still part of the card data; not shown in the solid-blue treatment
  accent?: boolean;
  wide?: boolean; // hero vs 2-up cell — a layout hint from the caller; unused in this treatment
}) {
  // Solid Langrand blue (var(--blue)) with white text — replaces the backdrop-image
  // + navy gradient overlay. Accent cards keep the lime top border.
  return (
    <Link
      href={href}
      className="group relative flex min-h-[260px] flex-col justify-end overflow-hidden rounded-[3px] bg-blue p-6 transition hover:brightness-110"
      style={accent ? { borderTop: "3px solid var(--lime-deep)" } : undefined}
    >
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
