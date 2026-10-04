"use client";

import { useState } from "react";
import type { HopeFear } from "@/lib/synthesis-shape";
import { AddCardForm } from "@/components/workshop/synthesis/SynthesisCard";

// The two big cards at the foot of the hopes & fears step: pick one, then write.
//
// Deliberately a choice between two objects rather than two small "＋ add" buttons. The
// step asks something genuinely two-sided — what do you hope this theme leads to, what do
// you fear — and a pair of cards you choose between puts that question on the table
// instead of burying it in a toolbar.

const FACE: Record<HopeFear, { title: string; blurb: string; mark: string; className: string }> = {
  hope: {
    title: "A hope",
    blurb: "What would it mean to us if this went well? What do we want to protect or advance?",
    mark: "☀",
    className: "border-[var(--lime-deep)] bg-lime/40 hover:bg-lime/60",
  },
  fear: {
    title: "A fear",
    blurb: "What would we hate to lose here, and why does that matter to us?",
    mark: "☂",
    className: "border-coral bg-coral/15 hover:bg-coral/25",
  },
};

export function HopeFearPicker({
  busy,
  disabled,
  onAdd,
}: {
  busy: boolean;
  // True when the chain has bottomed out — nothing more can hang off this theme.
  disabled?: boolean;
  onAdd: (kind: HopeFear, text: string) => void;
}) {
  const [picked, setPicked] = useState<HopeFear | null>(null);

  if (disabled) return null;

  return (
    <div>
      <div className="mb-3 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          Write about this theme — pick one
        </p>
        {/* The distinction the whole step rests on. Step 2 asked what could happen; this
            asks why it matters to us, or the two exercises produce the same list twice. */}
        <p className="mx-auto mt-1 max-w-[54ch] text-[12px] italic leading-[1.45] text-muted">
          Not what could happen — that was the last step. What value, commitment or identity
          does it touch?
        </p>
      </div>
      {/* Both cards stay up while you write into one. Picking a fear used to replace the
          pair with a single centred box, which took the hope off the table at the moment
          the step is asking you to weigh the two against each other. */}
      <div className="flex flex-wrap items-stretch justify-center gap-4">
        {(["hope", "fear"] as const).map((kind) => {
          const face = FACE[kind];
          if (picked === kind) {
            return (
              <div
                key={kind}
                className={
                  "flex h-[13rem] w-[15rem] flex-col rounded-[6px] border-2 p-4 shadow-[2px_3px_0_rgba(36,36,34,0.14)] " +
                  face.className
                }
              >
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-extrabold uppercase tracking-[0.08em]">
                    {face.title}
                  </span>
                  <span aria-hidden className="text-[18px] leading-none opacity-40">
                    {face.mark}
                  </span>
                </div>
                <AddCardForm
                  label={face.blurb}
                  busy={busy}
                  autoFocus
                  onAdd={(text) => onAdd(kind, text)}
                  onDone={() => setPicked(null)}
                />
              </div>
            );
          }
          return (
            <button
              key={kind}
              onClick={() => setPicked(kind)}
              className={
                "flex h-[13rem] w-[15rem] flex-col items-center justify-center gap-3 rounded-[6px] border-2 p-5 text-center shadow-[2px_3px_0_rgba(36,36,34,0.14)] transition-all hover:-translate-y-1 hover:shadow-[3px_6px_0_rgba(36,36,34,0.18)] " +
                face.className
              }
            >
              <span aria-hidden className="text-[38px] leading-none opacity-45">
                {face.mark}
              </span>
              <span className="text-[17px] font-extrabold uppercase tracking-[0.06em]">
                {face.title}
              </span>
              <span className="max-w-[18ch] text-[11.5px] leading-[1.4] text-ink/70">
                {face.blurb}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
