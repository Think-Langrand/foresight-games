"use client";

// A signed cover image in a fixed aspect box. The URLs are signed with a short
// TTL, so we load EAGERLY (not lazily): a lazily-loaded image far down the page
// only fetches once scrolled into view, by which point its URL has expired and
// 403s. On genuine load error we still hide the figure so the layout reflows.

import { useState } from "react";
import type { ScenarioImage } from "@/lib/foresight/types";

export function FigureImage({
  image,
  alt,
  ratio = "aspect-[4/3]",
}: {
  image: ScenarioImage | undefined;
  alt: string;
  ratio?: string;
}) {
  const [ok, setOk] = useState(true);
  if (!image?.url || !ok) return null;
  return (
    <div className={`relative w-full ${ratio} overflow-hidden rounded-[4px] bg-card`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={image.prompt || alt}
        loading="eager"
        onError={() => setOk(false)}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}
