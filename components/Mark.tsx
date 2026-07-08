// Hand-drawn highlighter mark used behind titles.
export function Marker({ color }: { color?: string }) {
  return (
    <svg
      className="mark-svg"
      viewBox="0 0 300 24"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M3 16 C 60 7, 120 18, 180 11 S 285 8, 297 14"
        stroke={color || "var(--lime)"}
        strokeWidth="11"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MarkText({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span className="mark-wrap">
      <Marker color={color} />
      <span className="mark-txt">{children}</span>
    </span>
  );
}
