"use client";

// Scenario artwork for the Ripples play surface. The Foresight image URLs are
// signed with a short TTL, so — like FigureImage — we use a plain <img>, load
// EAGERLY, and hide on error rather than showing a broken box. URLs arrive fresh
// from a force-dynamic page (never snapshotted), so they're valid at first paint.

import { useState } from "react";
import type { RippleArtImage } from "@/lib/ripples-types";

// A hero banner for the premise step: the image behind a soft ink scrim.
export function RippleHero({
  image,
  alt = "",
}: {
  image: RippleArtImage | undefined;
  alt?: string;
}) {
  const [ok, setOk] = useState(true);
  if (!image?.url || !ok) return null;
  return (
    <div className="relative aspect-[16/7] w-full overflow-hidden rounded-[3px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={image.prompt || alt}
        loading="eager"
        onError={() => setOk(false)}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(13,28,61,0.05) 0%, rgba(13,28,61,0.10) 60%, rgba(13,28,61,0.28) 100%)",
        }}
      />
    </div>
  );
}

// A faint art band woven behind a phase header, so the scenario's look carries
// through every step. Renders nothing (transparent) when there's no image.
export function RippleArtBand({ image }: { image: RippleArtImage | undefined }) {
  const [ok, setOk] = useState(true);
  if (!image?.url || !ok) return null;
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt=""
        loading="eager"
        onError={() => setOk(false)}
        className="h-full w-full object-cover opacity-[0.12]"
      />
      <div className="absolute inset-0" style={{ background: "var(--paper)", opacity: 0.35 }} />
    </div>
  );
}
