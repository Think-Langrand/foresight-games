import type { ExecSummaryOverride } from "@/lib/exec-summary-shape";

// The body of handoff slide 02: either the group's own lead, or the projected Session 4
// answers when nobody has written one.
//
// READ-ONLY, AND A SERVER COMPONENT. It used to carry an Edit button and a form. Editing
// now lives on Session 4's "Build handoff guide" step, where the group already has a
// player row on the board — on the deck it had to ask people to go and open their board
// first, which is a bad answer to "why can't I type here". Keeping the deck purely a
// reader also means the group's copy and the committee's public copy differ only in
// chrome, which is what stopped one of them quietly serving the wrong text.
export default function ExecSummaryBody({
  override,
  projected,
}: {
  override: ExecSummaryOverride | null;
  // What the slide says when nobody has written a lead: the projected blocks, rendered by
  // the caller so the default view is exactly what it has always been.
  projected: React.ReactNode;
}) {
  if (!override) return <>{projected}</>;
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
