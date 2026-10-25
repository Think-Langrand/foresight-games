import type { ExecSummaryOverride } from "@/lib/exec-summary-shape";

// The body of the handoff's closing note: whatever the group typed for the steering
// committee, as paragraphs.
//
// IT USED TO BE SLIDE 02, standing in for the projected Session 4 answers whenever a group
// had written a lead. That was when the box above it was an executive summary. It is now a
// note BESIDE the deck's own account rather than instead of it, so slide 02 went back to
// the projection and this renders one slide near the end.
//
// READ-ONLY, AND A SERVER COMPONENT. Editing lives on Session 4's handoff step, where the
// group already has a player row on the board — on the deck it had to ask people to go and
// open their board first, which is a bad answer to "why can't I type here".
export default function ExecSummaryBody({ override }: { override: ExecSummaryOverride }) {
  return (
    <div className="flex flex-col gap-4">
      {override.text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="m-0 max-w-[86ch] text-[15.5px] leading-[1.55]">
          {para}
        </p>
      ))}
    </div>
  );
}
