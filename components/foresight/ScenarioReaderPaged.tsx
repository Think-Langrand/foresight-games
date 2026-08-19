"use client";

import { useState } from "react";
import type { Scenario } from "@/lib/foresight/types";
import { ScenarioReader } from "@/components/foresight/ScenarioReader";
import { ScenarioBody } from "@/components/foresight/ScenarioBody";
import { extractScenarioDeepSections } from "@/lib/foresight/deep-sections";

// The scenario reader as a two-page read: page 1 is the editorial overview
// (ScenarioReader), page 2 collects the deeper "what it means" sections parsed from
// the body markdown — "What this world makes possible", "Structural blind spot",
// "Why this future arrives". The pager only appears when page 2 has content, so a
// scenario without those sections still reads as a single page.
export function ScenarioReaderPaged({ scenario }: { scenario: Scenario }) {
  const deep = extractScenarioDeepSections(scenario.body);
  const [page, setPage] = useState<1 | 2>(1);

  if (deep.length === 0) return <ScenarioReader scenario={scenario} />;

  return (
    <div>
      {page === 1 ? (
        <ScenarioReader scenario={scenario} />
      ) : (
        <div>
          <span className="eyebrow blue">What it means · {scenario.title}</span>
          <div className="mt-6 flex flex-col gap-10">
            {deep.map((s) => (
              <section key={s.key} className="border-t border-[var(--rule)] pt-6 first:border-0 first:pt-0">
                <h2 className="text-[19px] font-extrabold uppercase leading-[1.1] tracking-tight">
                  {s.label}
                </h2>
                <div className="mt-3 max-w-[760px]">
                  <ScenarioBody body={s.content} />
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {/* Page flip */}
      <nav className="mt-12 flex items-center justify-between border-t border-[var(--rule)] pt-5">
        <button
          onClick={() => setPage(1)}
          disabled={page === 1}
          className="text-[12px] font-bold uppercase tracking-[0.08em] text-blue enabled:hover:text-ink disabled:opacity-30"
        >
          ← Overview
        </button>
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          Page {page} / 2
        </span>
        <button
          onClick={() => setPage(2)}
          disabled={page === 2}
          className="text-[12px] font-bold uppercase tracking-[0.08em] text-blue enabled:hover:text-ink disabled:opacity-30"
        >
          What it means →
        </button>
      </nav>
    </div>
  );
}
