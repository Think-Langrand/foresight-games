"use client";

import { Eyebrow } from "@/components/workshop/commitments/StarterQuestions";

// A short note set apart from the prose around it. `blue` is the house accent on a pale
// wash with a rule down the left (an instruction, a sentence starter, the vision read
// back); `paper` is a bordered definition box (what a scale means).
export function Callout({
  tone = "blue",
  label,
  children,
}: {
  tone?: "blue" | "paper";
  label?: string;
  children: React.ReactNode;
}) {
  if (tone === "paper") {
    return (
      <div
        className="rounded-[3px] border border-[var(--hairline)] px-4 py-3"
        style={{ background: "var(--board)" }}
      >
        {label && <div className="text-[14px] font-extrabold">{label}</div>}
        <div className="mt-1 text-[13px] leading-[1.5]">{children}</div>
      </div>
    );
  }
  return (
    <div
      className="rounded-[3px] border-l-[3px] border-blue px-5 py-3.5"
      style={{ background: "rgba(39,93,226,0.08)" }}
    >
      {label && <Eyebrow>{label}</Eyebrow>}
      <div className={"text-[14.5px] leading-[1.5]" + (label ? " mt-1.5" : "")}>{children}</div>
    </div>
  );
}
