"use client";

import { useState } from "react";
import {
  EXEC_SUMMARY_LIMITS,
  type ExecSummaryOverride,
  shouldAdoptExecSummary,
} from "@/lib/exec-summary-shape";

// Step 5's composer: the place a group writes the lead its handoff opens with.
//
// FOUR STATES, in order. Locked, while an earlier step is unfinished and drafting would
// produce a confident paragraph out of almost nothing. Ready, with the button. Generating.
// Then the draft, editable, which is where the group spends its time.
//
// THE DRAFT IS NOT THE PRODUCT. The model stitches the group's four steps into three
// paragraphs so nobody faces a blank box at the end of a long session; the group then
// rewrites it. That is why the saved text is labelled "drafted" until someone changes a
// word, and why Restore is always offered.

export type ComposerState = "locked" | "ready" | "generating";

export default function ExecSummaryComposer({
  sessionCode,
  participantId,
  override,
  missing,
  canEdit,
}: {
  sessionCode: string;
  participantId: string;
  override: ExecSummaryOverride | null;
  // Steps still unfinished, in tab order. Empty means drafting is available.
  missing: string[];
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState<ExecSummaryOverride | null>(override);
  const [text, setText] = useState(override?.text ?? "");
  const [state, setState] = useState<ComposerState>(missing.length ? "locked" : "ready");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // THE STORED LEAD CAN LAND AFTER THIS BOX IS ON SCREEN, so the text cannot be seeded from
  // the prop once at mount and left there. Two ways it happens: step 5 opens while the
  // board's own refresh is still in flight and the draft arrives a moment later, and
  // another member drafts, saves or deletes and realtime pushes the new config to every
  // open board. Without this the composer sits on "Draft our summary" beside a draft that
  // is already saved, and only a click on that button reveals it.
  //
  // ADJUSTED DURING RENDER rather than in an effect, which is what React asks for when
  // state has to follow a prop: the guard makes it settle in one extra render and nothing
  // paints in between. An effect would commit the stale frame first and flash the button.
  //
  // `state` is deliberately not touched. The four states belong to what THIS member asked
  // for, and whether the draft shows is already a question of `draft` being set — so a
  // lead arriving must not cut short a "generating" panel this browser is waiting on.
  if (shouldAdoptExecSummary(draft, override, dirty)) {
    setDraft(override);
    setText(override?.text ?? "");
  }

  async function call(path: string, method: "POST" | "DELETE", body?: object) {
    setError(null);
    const res = await fetch(`/api/sessions/${sessionCode}/ripples/exec-summary${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data as { override: ExecSummaryOverride | null };
  }

  // force: the route is idempotent by default so auto-generation cannot race or clobber,
  // and this button is the one place replacing an existing draft is the intent.
  async function generate(force = false) {
    setState("generating");
    setBusy(true);
    try {
      const { override: o } = await call("/generate", "POST", { force });
      setDraft(o);
      setText(o?.text ?? "");
      setDirty(false);
      setState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not draft the summary.");
      setState("ready");
    }
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    try {
      const { override: o } = await call("", "POST", { text });
      setDraft(o);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
    setBusy(false);
  }

  async function restore() {
    if (!confirm("Delete this summary? The handoff goes back to reading from Session 4.")) return;
    setBusy(true);
    try {
      await call("", "DELETE");
      setDraft(null);
      setText("");
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore.");
    }
    setBusy(false);
  }

  return (
    <section className="rounded-[3px] border border-ink">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink px-5 py-3">
        <h2 className="m-0 text-[15px] font-extrabold uppercase tracking-tight">
          Your executive summary
        </h2>
        <p className="m-0 max-w-[62ch] text-[13px] leading-[1.45] text-muted">
          The first thing the steering committee reads. Drawn from your four steps.
        </p>
        {draft && (
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
            {draft.source === "edited" ? "Written by your group" : "Drafted — not yet edited"}
          </span>
        )}
      </header>

      <div className="px-5 py-4">
        {state === "locked" && !draft && (
          <div>
            <p className="m-0 text-[13.5px] leading-[1.5] text-muted">
              Finish the earlier steps first. The summary is written from them, and there is
              not enough here yet to draw one from.
            </p>
            <ul className="m-0 mt-3 list-none p-0">
              {missing.map((m) => (
                <li
                  key={m}
                  className="border-b border-[var(--hairline)] py-2 font-mono text-[11px] uppercase tracking-[0.08em] last:border-b-0"
                >
                  <span className="mr-2 text-coral">&#9675;</span>
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ABOUT A MINUTE, and the copy says so. Measured at 48s against a full board: the
            model is reading four steps and writing three paragraphs. A spinner with no
            expectation set reads as broken at about the twenty-second mark, and somebody
            reloads the page. */}
        {state === "generating" && (
          <div>
            <p className="m-0 animate-pulse text-[14px] font-semibold">
              Reading your four steps and drafting a summary&hellip;
            </p>
            <p className="m-0 mt-1.5 text-[12.5px] leading-[1.45] text-muted">
              This takes about a minute. Leave the page open.
            </p>
          </div>
        )}

        {state === "ready" && !draft && (
          <div>
            <p className="m-0 mb-3 text-[13.5px] leading-[1.5] text-muted">
              Every step is done. Draft a summary from your own answers, then rewrite it
              until it sounds like your group. Drafting takes about a minute.
            </p>
            <button
              onClick={() => generate()}
              disabled={busy || !canEdit}
              className="rounded-[3px] bg-ink px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.06em] text-paper transition hover:bg-blue disabled:opacity-50"
            >
              Draft our summary
            </button>
          </div>
        )}

        {draft && state !== "generating" && (
          <div>
            <label htmlFor="exec-composer" className="sr-only">
              Your executive summary
            </label>
            <textarea
              id="exec-composer"
              value={text}
              maxLength={EXEC_SUMMARY_LIMITS.text}
              readOnly={!canEdit}
              onChange={(e) => {
                setText(e.target.value);
                setDirty(true);
              }}
              rows={14}
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
                  <button
                    onClick={() => generate(true)}
                    disabled={busy}
                    className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted"
                  >
                    Draft again
                  </button>
                  <button
                    onClick={restore}
                    disabled={busy}
                    className="ml-auto text-[12px] font-bold uppercase tracking-[0.06em] text-coral"
                  >
                    Delete it
                  </button>
                </>
              )}
            </div>
            {dirty && (
              <p className="m-0 mt-2 text-[11.5px] italic text-muted">
                Unsaved. Drafting again would replace what you have written.
              </p>
            )}
          </div>
        )}

        {error && <p className="m-0 mt-3 text-[12.5px] font-semibold text-coral">{error}</p>}
      </div>
    </section>
  );
}
