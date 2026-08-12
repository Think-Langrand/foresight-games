// A scenario tile for the set grid. Cover image (or the mood colour as a solid
// fallback, since most scenarios have no image) with a scrim and white overlay
// text, mirroring the card idiom in app/scenario-molecules/page.tsx.

import Link from "next/link";
import type { ScenarioCard as ScenarioCardData } from "@/lib/foresight/types";
import { CoverImage } from "./SignedImage";

export function ScenarioCard({
  card,
  href,
  index,
}: {
  card: ScenarioCardData;
  href: string;
  index?: number;
}) {
  const horizon = card.timeHorizon.label ?? String(card.timeHorizon.year);
  const number = String((index ?? card.position) + 1).padStart(2, "0");

  return (
    <Link
      href={href}
      className="group relative flex min-h-[340px] flex-col overflow-hidden rounded-[4px] transition-transform hover:-translate-y-0.5"
      style={{ background: card.mood.colorHex }}
    >
      <CoverImage src={card.coverImageUrl} alt={card.title} fallbackColor={card.mood.colorHex} />

      <div className="relative flex grow flex-col p-5">
        {/* Masthead — theme + issue number. */}
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-white/85">
            {card.theme.label}
          </span>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.24em] text-white/70">
            Nº {number}
          </span>
        </div>

        <h3 className="mt-5 line-clamp-3 text-[26px] font-extrabold uppercase leading-[0.98] tracking-tight text-white">
          {card.title}
        </h3>

        {card.headline && (
          <p className="serif mt-3 line-clamp-3 text-[18px] italic leading-[1.3] text-white/85">
            {card.headline}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between border-t border-white/20 pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-white/80">
            {horizon}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-white group-hover:underline">
            Read →
          </span>
        </div>
      </div>
    </Link>
  );
}
