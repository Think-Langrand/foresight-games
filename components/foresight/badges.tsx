// Small metadata badges for a scenario's theme / mood / time horizon, shared by
// the scenario card and the detail header so the styling lives in one place.
// Plain (server-renderable) components; they reuse the `.chip` primitive.

import type { Mood, Theme, TimeHorizon } from "@/lib/foresight/types";

export function ThemeBadge({ theme }: { theme: Theme }) {
  return <span className="chip">{theme.label}</span>;
}

export function MoodBadge({ mood }: { mood: Mood }) {
  return (
    <span
      className="chip inline-flex items-center gap-1.5"
      title={mood.emotionalRegister || undefined}
    >
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-[1px] ring-1 ring-[var(--hairline)]"
        style={{ background: mood.colorHex }}
      />
      {mood.label}
    </span>
  );
}

export function TimeHorizonBadge({ timeHorizon }: { timeHorizon: TimeHorizon }) {
  // `label` is often null from the API — fall back to the year.
  return <span className="chip">{timeHorizon.label ?? String(timeHorizon.year)}</span>;
}
