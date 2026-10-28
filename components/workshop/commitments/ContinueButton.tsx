"use client";

// The way to the next activity, at the foot of this one. Lime, like every "go" control on
// these boards. It only changes which tab is open: nothing is submitted and nothing is
// checked, because a group works a shared board asynchronously and a gate here would
// strand whoever is behind.
export function ContinueButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="flex justify-end border-t border-[var(--hairline)] pt-5">
      <button
        type="button"
        onClick={onClick}
        className="rounded-[3px] border border-ink bg-lime px-6 py-3 text-[15px] font-bold hover:bg-lime-deep"
      >
        {label}
      </button>
    </div>
  );
}
