"use client";

import { useState } from "react";
import {
  EXEC_SUMMARY_LIMITS,
  type ExecSummaryOverride,
  shouldAdoptExecSummary,
} from "@/lib/exec-summary-shape";

// The last box on Session 4's handoff step: anything the group wants the steering committee
// to know about this scenario that the four steps never asked it.
//
// A PLAIN BOX, deliberately. This was briefly a model-drafted executive summary, with a
// Draft button, a generating state and a chip saying whether a human had touched the words.
// The drafting is out for now — the route, the prompt and the staleness check are all still
// there, just unwired — and what is left is somewhere to type. Nothing here is generated,
// so nothing has to declare who wrote it.
//
// AN OVERLAY, NOT AN EDIT OF THE WORK. Stored at sessions.config.execSummary on the Week 4
// board, which is never itself written to. So Delete is just dropping the key, and the
// handoff goes back to reading from Session 4's answers alone.
export default function ExecSummaryComposer({
  sessionCode,
  participantId,
  override,
  canEdit,
}: {
  sessionCode: string;
  participantId: string;
  override: ExecSummaryOverride | null;
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState<ExecSummaryOverride | null>(override);
  const [text, setText] = useState(override?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // THE STORED NOTE CAN CHANGE UNDER THIS BOX, so the text cannot be seeded from the prop
  // once at mount and left there: realtime pushes one member's save or delete to every open
  // board, and without this their composers would never show it.
  //
  // ADJUSTED DURING RENDER rather than in an effect, which is what React asks for when
  // state has to follow a prop — it settles in one extra render and nothing paints in
  // between, where an effect would commit the stale frame first.
  //
  // UNSAVED EDITS ARE NEVER OVERWRITTEN; see shouldAdoptExecSummary. Somebody mid-sentence
  // when another member saves keeps what they are typing, and their own Save settles it.
  if (shouldAdoptExecSummary(draft, override, dirty)) {
    setDraft(override);
    setText(override?.text ?? "");
  }

  async function call(method: "POST" | "DELETE", body?: object) {
    setError(null);
    const res = await fetch(`/api/sessions/${sessionCode}/ripples/exec-summary`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data as { override: ExecSummaryOverride | null };
  }

  async function save() {
    setBusy(true);
    try {
      const { override: o } = await call("POST", { text });
      setDraft(o);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
    setBusy(false);
  }

  async function remove() {
    if (!confirm("Delete these notes? Nothing else on your board changes.")) return;
    setBusy(true);
    try {
      await call("DELETE");
      setDraft(null);
      setText("");
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
    }
    setBusy(false);
  }

  return (
    <section className="rounded-[3px] border border-ink">
      <header className="border-b border-ink px-5 py-3">
        <h2 className="m-0 text-[15px] font-extrabold uppercase tracking-tight">
          Additional thoughts for the steering committee
        </h2>
        <p className="m-0 mt-1 max-w-[68ch] text-[13px] leading-[1.45] text-muted">
          Anything about this scenario the four steps did not ask you &mdash; a caveat, a
          disagreement worth recording, something you would want read alongside the rest.
          Optional: leave it empty if the steps have said it all.
        </p>
      </header>

      <div className="px-5 py-4">
        <label htmlFor="exec-composer" className="sr-only">
          Additional thoughts for the steering committee
        </label>
        <textarea
          id="exec-composer"
          value={text}
          maxLength={EXEC_SUMMARY_LIMITS.text}
          readOnly={!canEdit}
          rows={8}
          className="w-full resize-y rounded-[2px] border border-[var(--hairline)] bg-paper px-4 py-3 text-[15px] leading-[1.6] outline-none focus:border-ink"
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-mono text-[10px] text-muted">
            {text.trim().length}/{EXEC_SUMMARY_LIMITS.text}
          </span>
          {canEdit && (
            <>
              <button
                onClick={save}
                disabled={busy || !dirty}
                className="rounded-[3px] bg-blue px-4 py-2 text-[12px] font-bold uppercase tracking-[0.06em] text-white disabled:opacity-40"
              >
                {busy ? "Saving…" : dirty ? "Save" : "Saved"}
              </button>
              {/* Only once something is stored. Delete over a box that has never been saved
                  is a button with nothing to do. */}
              {draft && (
                <button
                  onClick={remove}
                  disabled={busy}
                  className="ml-auto text-[12px] font-bold uppercase tracking-[0.06em] text-coral"
                >
                  Delete it
                </button>
              )}
            </>
          )}
        </div>
        {dirty && (
          <p className="m-0 mt-2 text-[11.5px] italic text-muted">
            Unsaved. The committee sees what is saved, not what is in the box.
          </p>
        )}
        {error && <p className="m-0 mt-3 text-[12.5px] font-semibold text-coral">{error}</p>}
      </div>
    </section>
  );
}
