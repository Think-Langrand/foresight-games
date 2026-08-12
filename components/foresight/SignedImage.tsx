// Resilient image for the Foresight API's SIGNED, EXPIRING image URLs (§7).
//
// We deliberately use a plain <img>, not next/image: the URLs are re-signed on
// every read, which would defeat next/image's URL-keyed byte cache, and the app
// has no `images.remotePatterns` configured. Pages that render these are
// force-dynamic so the URLs are always fresh at render time.

// A Langrand-blue veil (--blue #275de2 washing into --navy #0d1c3d) so the white
// overlay text pops. A light blue tint up top keeps the image readable; it deepens
// to navy at the bottom where the footer text sits.
const SCRIM =
  "linear-gradient(180deg, rgba(39,93,226,0.30) 0%, rgba(21,48,102,0.58) 52%, rgba(13,28,61,0.88) 100%)";

// The raw, null-safe image. Renders nothing when there is no URL.
export function SignedImage({
  src,
  alt,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
}) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={className} />;
}

// A cover band: a solid fallback colour, the signed image if present, and a scrim
// on top so overlaid white text reads. Fills its (positioned) parent.
export function CoverImage({
  src,
  alt,
  fallbackColor,
  scrim = true,
}: {
  src: string | null | undefined;
  alt: string;
  fallbackColor: string;
  scrim?: boolean;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: fallbackColor }}
    >
      <SignedImage
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {scrim && (
        <div className="absolute inset-0" style={{ background: SCRIM }} />
      )}
    </div>
  );
}
