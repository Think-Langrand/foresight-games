"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeSections } from "@/lib/foresight/sections";

function Caret({
  open,
  muted,
  spacer,
}: {
  open: boolean;
  muted?: boolean;
  spacer?: boolean;
}) {
  if (spacer) return <span className="inline-block w-3" />;
  return (
    <span
      aria-hidden
      className={
        "inline-block w-3 text-[9px] transition-transform " +
        (muted ? "text-muted " : "text-ink ") +
        (open ? "rotate-90" : "")
      }
    >
      ▶
    </span>
  );
}

function HideToggle({
  hidden,
  onClick,
  label,
}: {
  hidden: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={hidden}
      title={hidden ? `Show ${label}` : `Hide ${label}`}
      className={
        "shrink-0 rounded-[3px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] " +
        (hidden
          ? "border-[var(--hairline)] bg-card text-muted hover:text-ink"
          : "border-ink text-ink hover:bg-card")
      }
    >
      {hidden ? "Hidden" : "Hide"}
    </button>
  );
}

export function ScenarioSections({
  sections,
  storageKey,
  embedded = false,
}: {
  sections: Record<string, unknown>;
  storageKey: string;
  // When embedded in a column beside other content, drop the full-width top
  // border/margin chrome so it aligns with its neighbour.
  embedded?: boolean;
}) {
  const normalized = normalizeSections(sections);
  const lsKey = `fpw:sections:${storageKey}`;

  // Persisted per-device curation. Expand/collapse is ephemeral by design.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [customize, setCustomize] = useState(false);
  const loaded = useRef(false);

  // First paint keeps everything visible (matches SSR); apply the saved hidden
  // set right after mount, so there's no hydration mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          setHidden(new Set(arr.filter((x): x is string => typeof x === "string")));
        }
      }
    } catch {
      // corrupt or unavailable storage — start clean
    }
    loaded.current = true;
  }, [lsKey]);

  // Write only on user actions (never before the initial load), so we can't
  // clobber the stored value with the empty starting set.
  function commitHidden(next: Set<string>) {
    setHidden(next);
    if (!loaded.current) return;
    try {
      localStorage.setItem(lsKey, JSON.stringify([...next]));
    } catch {
      // non-fatal: they curate for this visit, just not remembered
    }
  }

  function toggleHidden(id: string) {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    commitHidden(next);
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (normalized.length === 0) return null;

  return (
    <section className={embedded ? "" : "mt-12 border-t border-[var(--rule)] pt-8"}>
      <div className="flex items-center justify-between gap-4">
        <span className="eyebrow ink">Sections</span>
        <div className="flex items-center gap-3">
          {customize && hidden.size > 0 && (
            <button
              type="button"
              onClick={() => commitHidden(new Set())}
              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted hover:text-ink"
            >
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={() => setCustomize((v) => !v)}
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-blue hover:opacity-80"
          >
            {customize ? "Done" : "Customize"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
        {normalized.map((section) => {
          const sectionHidden = hidden.has(section.key);
          if (sectionHidden && !customize) return null;
          const isOpen = expanded.has(section.key);
          return (
            <div key={section.key} className={sectionHidden ? "opacity-40" : undefined}>
              <div className="flex items-center gap-2 py-3">
                <button
                  type="button"
                  onClick={() => toggleExpanded(section.key)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <Caret open={isOpen} />
                  <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink">
                    {section.title}
                  </span>
                  {section.kind === "list" && (
                    <span className="text-[11px] font-semibold text-muted">
                      {section.items.length}
                    </span>
                  )}
                </button>
                {customize && (
                  <HideToggle
                    hidden={sectionHidden}
                    onClick={() => toggleHidden(section.key)}
                    label="section"
                  />
                )}
              </div>

              {isOpen && (
                <div className="pb-4 pl-5">
                  {section.kind === "prose" ? (
                    <p className="max-w-[760px] whitespace-pre-wrap text-[15px] leading-[1.6] text-ink">
                      {section.body}
                    </p>
                  ) : (
                    <div className="flex flex-col divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
                      {section.items.map((item) => {
                        const itemHidden = hidden.has(item.id);
                        if (itemHidden && !customize) return null;
                        const itemOpen = expanded.has(item.id);
                        return (
                          <div
                            key={item.id}
                            className={itemHidden ? "opacity-40" : undefined}
                          >
                            <div className="flex items-center gap-2 py-2.5">
                              <button
                                type="button"
                                onClick={() => toggleExpanded(item.id)}
                                disabled={!item.body}
                                className="flex flex-1 items-center gap-2 text-left disabled:cursor-default"
                              >
                                <Caret open={itemOpen} muted spacer={!item.body} />
                                <span className="text-[15px] font-semibold leading-[1.4] text-ink">
                                  {item.title}
                                </span>
                                {item.preferred && (
                                  <span className="chip">preferred</span>
                                )}
                              </button>
                              {customize && (
                                <HideToggle
                                  hidden={itemHidden}
                                  onClick={() => toggleHidden(item.id)}
                                  label="item"
                                />
                              )}
                            </div>
                            {itemOpen && item.body && (
                              <p className="max-w-[720px] whitespace-pre-wrap pb-3 pl-5 text-[14px] leading-[1.6] text-muted">
                                {item.body}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {customize && (
        <p className="mt-3 text-[12px] leading-[1.4] text-muted">
          Hidden items are saved on this device only — other visitors still see everything.
        </p>
      )}
    </section>
  );
}
