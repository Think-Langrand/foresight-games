"use client";

// The scenario ↔ exercise header toggle, shared by the design-group renderers so every
// week transitions the same way (Langrand blue). Shows the exercise label while the
// scenario is up (click to go to the exercise), "View scenario" while the exercise is up.
export function ScenarioToggle({
  showingScenario,
  exerciseLabel,
  onToggle,
  disabled = false,
}: {
  showingScenario: boolean;
  exerciseLabel: string;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className="rounded-[2px] border border-[#1f33dd] bg-[#1f33dd] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-white hover:opacity-90 disabled:opacity-50"
    >
      {showingScenario ? exerciseLabel : "View scenario"}
    </button>
  );
}
