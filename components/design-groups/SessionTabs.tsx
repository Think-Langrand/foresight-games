"use client";

import { useState } from "react";
import {
  ImplicationsPanel,
  WorksheetPanel,
  type ExerciseAnswers,
  type MapView,
} from "@/components/design-groups/AnswerPanels";
import { SynthesisPanel } from "@/components/design-groups/SynthesisPanel";

// Session tabs on a design group's session page: the current session (the live board,
// passed as children) plus a read-only tab per earlier week, so a group can glance back at
// what it already answered without leaving. The live view stays MOUNTED (just hidden)
// while an earlier week is shown, so its realtime sync and scenario/build state survive.
// With no earlier weeks this renders the children alone.
// "Session 2 · Implication Mapping" → "Session 2". The row has to fit one line, and the
// number is the only part that distinguishes the tabs at a glance; the active tab shows
// the whole title, which is the one place it is actually worth the space.
function shortLabel(title: string): string {
  const numbered = title.match(/^\s*(session\s*\d+)/i);
  if (numbered) return numbered[1].replace(/\s+/g, " ").trim();
  const cut = title.search(/[-–—·:]/);
  const head = (cut > 0 ? title.slice(0, cut) : title).trim();
  return head || title;
}

export function SessionTabs({
  currentTitle,
  pastWeeks,
  children,
}: {
  currentTitle: string;
  pastWeeks: ExerciseAnswers[];
  children: React.ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null); // null = current session
  const [mapView, setMapView] = useState<MapView>("tree");
  if (pastWeeks.length === 0) return <>{children}</>;

  const active = pastWeeks.find((w) => w.exerciseId === activeId) ?? null;
  const tab = (id: string | null, label: string) => {
    const on = activeId === id;
    return (
      <button
        key={id ?? "current"}
        role="tab"
        aria-selected={on}
        onClick={() => setActiveId(id)}
        title={label}
        className={
          "rounded-[2px] border px-2.5 py-1.5 text-left text-[11.5px] font-bold uppercase tracking-[0.06em] transition-colors " +
          (on
            ? "border-ink bg-ink text-paper"
            : "border-[var(--rule)] bg-paper text-muted hover:border-ink hover:text-ink")
        }
      >
        {on ? label : shortLabel(label)}
      </button>
    );
  };

  return (
    <>
      <nav className="mx-auto max-w-[1100px] px-5 pt-4">
        <div role="tablist" aria-label="Sessions" className="flex flex-wrap items-center gap-1.5 pb-3">
          {pastWeeks.map((w) => tab(w.exerciseId, w.title))}
          {tab(null, currentTitle)}
        </div>
      </nav>

      <div hidden={active !== null}>{children}</div>

      {active && (
        <main className="mx-auto min-h-screen max-w-[1100px] px-5 py-6">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--rule)] pb-3">
            <div className="min-w-0">
              <div className="eyebrow">Read-only · earlier session</div>
              <h1 className="mt-1 text-[22px] font-extrabold uppercase leading-[1.05] tracking-tight">{active.title}</h1>
            </div>
            <button
              onClick={() => setActiveId(null)}
              className="rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime"
            >
              ← Back to {currentTitle}
            </button>
          </div>
          {active.kind === "worksheet" && <WorksheetPanel ex={active} showMeta={false} />}
          {active.kind === "implications" && (
            <ImplicationsPanel ex={active} view={mapView} setView={setMapView} showMeta={false} />
          )}
          {active.kind === "synthesis" && <SynthesisPanel ex={active} showMeta={false} />}
          {active.kind === "placeholder" && (
            <p className="text-[14px] italic text-muted">
              {active.unavailable
                ? "This session’s answers couldn’t be loaded right now. Try refreshing in a moment."
                : "No answers to show for this session."}
            </p>
          )}
        </main>
      )}
    </>
  );
}
