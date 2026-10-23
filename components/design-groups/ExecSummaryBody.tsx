"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useParticipant } from "@/components/workshop/hooks";
import { EXEC_SUMMARY_LIMITS, type ExecSummaryOverride } from "@/lib/exec-summary-shape";

// The body of handoff slide 02, and the only editable thing in the deck.
//
// A CLIENT LEAF, for the reason SummaryMatrix documents: GroupSummary is server-rendered,
// so this takes serializable props only and owns its own state.
//
// IT OWNS THE BODY, NOT THE CHIP. The Slide component's `chip` is a sibling prop of its
// children, so a button mounted there could not open a form down here without context or a
// second mount. The chip stays a static server-rendered status and the Edit control lives
// in the body instead.
//
// Arrow keys are safe: HandoffDeck's key handler already bails on INPUT|TEXTAREA|SELECT, so
// typing in the form does not page the deck.

export interface ExecSummaryBodyProps {
  // Null when Session 4 has no board — then there is nothing to authenticate an edit
  // against and the slide is read-only whoever is looking.
  sessionCode: string | null;
  canEdit: boolean;
  override: ExecSummaryOverride | null;
  // What the slide says when nobody has edited it: the projected blocks, rendered by the
  // server. Kept as a node so the default view is identical to what it has always been.
  projected: React.ReactNode;
  // The same answers as plain text, to seed the editor. Built by execSummaryDefaultText so
  // the seed and the default render cannot drift.
  seed: string;
}

export default function ExecSummaryBody({
  sessionCode,
  canEdit,
  override,
  projected,
  seed,
}: ExecSummaryBodyProps) {
  const router = useRouter();
  const { pid } = useParticipant();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(override?.text ?? seed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = canEdit && Boolean(sessionCode);

  async function send(method: "POST" | "DELETE") {
    if (!sessionCode) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionCode}/ripples/exec-summary`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method === "POST" ? { participantId: pid, text } : { participantId: pid }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // The common refusal by far. A pid is minted on first visit to any page, but a
        // player row only exists once someone has actually opened the Week 4 board, so
        // "join first" really means "open your board once on this device".
        setError(
          res.status === 403
            ? "Open your Session 4 board once on this device, then come back."
            : data.error || "Could not save."
        );
        setBusy(false);
        return;
      }
      setOpen(false);
      setBusy(false);
      // Re-render from the stored blob rather than trusting local state, so what the slide
      // shows is what actually landed.
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  if (open) {
    return (
      <div>
        <label htmlFor="exec-summary" className="sr-only">
          Your executive summary
        </label>
        <textarea
          id="exec-summary"
          value={text}
          maxLength={EXEC_SUMMARY_LIMITS.text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          className="w-full resize-y rounded-[2px] border border-ink bg-paper px-4 py-3 text-[15px] leading-[1.55]"
        />
        <p className="m-0 mt-2 text-[12px] leading-[1.45] text-muted">
          Leave a blank line between paragraphs. This changes the summary slide only &mdash;
          your Session 4 board is untouched, and the full answers stay at the end of the deck.
        </p>
        {error && <p className="m-0 mt-2 text-[12.5px] font-semibold text-coral">{error}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => send("POST")}
            disabled={busy}
            className="rounded-[3px] bg-blue px-4 py-2 text-[13px] font-bold uppercase tracking-[0.06em] text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              setError(null);
              setText(override?.text ?? seed);
            }}
            disabled={busy}
            className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted"
          >
            Cancel
          </button>
          {override && (
            <button
              onClick={() => {
                if (confirm("Delete your edit? The slide goes back to reading from Session 4."))
                  send("DELETE");
              }}
              disabled={busy}
              className="ml-auto text-[13px] font-bold uppercase tracking-[0.06em] text-coral"
            >
              Restore the board&rsquo;s words
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {override ? (
        // An override replaces the projected blocks entirely: it is a lead the group wrote,
        // not a set of answers under their worksheet prompts.
        <div className="flex flex-col gap-4">
          {override.text.split(/\n{2,}/).map((para, i) => (
            <p key={i} className="m-0 max-w-[86ch] text-[15.5px] leading-[1.55]">
              {para}
            </p>
          ))}
        </div>
      ) : (
        projected
      )}
      {editable && (
        <button
          onClick={() => setOpen(true)}
          className="mt-5 rounded-[3px] border border-ink px-4 py-2 text-[12px] font-bold uppercase tracking-[0.06em] transition hover:bg-card"
        >
          {override ? "Edit this slide" : "Write your own summary"}
        </button>
      )}
    </div>
  );
}
