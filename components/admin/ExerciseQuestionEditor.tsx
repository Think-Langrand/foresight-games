"use client";

import { useState } from "react";
import { newSectionKey, type WorksheetSection } from "@/lib/exercise-types";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

// Per-exercise question editor. Edits a worksheet's sections (its questions + brainstorm
// areas) as an ordered list. Section `key`s are permanent ids (written onto answer cards)
// so they are minted here but never shown or renamed — deleting a row drops the question
// from the spec while its existing answers stay in the DB (just unrendered).
//
// Renders inside a full-width admin table row. Save sends the full array up; the parent
// PATCHes it onto the exercise and refreshes.

const input =
  "rounded-[2px] border border-[var(--rule)] bg-paper px-2 py-1 text-[12px] focus:border-ink focus:outline-none";
const btn =
  "rounded-[2px] border border-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] disabled:opacity-40";

export function ExerciseQuestionEditor({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: WorksheetSection[];
  busy: boolean;
  onSave: (sections: WorksheetSection[]) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<WorksheetSection[]>(() => initial.map((s) => ({ ...s })));
  const [pendingDeleteIdx, setPendingDeleteIdx] = useState<number | null>(null);

  const patch = (i: number, p: Partial<WorksheetSection>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const move = (i: number, dir: -1 | 1) =>
    setRows((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const remove = (i: number) => setRows((prev) => prev.filter((_, j) => j !== i));

  const add = (kind: WorksheetSection["kind"]) =>
    setRows((prev) => [...prev, { key: newSectionKey(), kind, label: "" }]);

  return (
    <div className="rounded-[3px] border border-[var(--hairline)] bg-paper p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Questions</p>

      {rows.length === 0 && (
        <p className="mb-2 text-[12px] italic text-muted">No questions yet — add one below.</p>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={r.key} className="rounded-[2px] border border-[var(--hairline)] bg-card p-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-col">
                <button className={btn + " leading-none"} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  ↑
                </button>
                <button
                  className={btn + " leading-none"}
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Move down"
                >
                  ↓
                </button>
              </div>
              <select
                value={r.kind}
                onChange={(e) => patch(i, { kind: e.target.value as WorksheetSection["kind"] })}
                className={input}
              >
                <option value="question">Question</option>
                <option value="brainstorm">Brainstorm</option>
              </select>
              <input
                value={r.label}
                onChange={(e) => patch(i, { label: e.target.value })}
                placeholder={r.kind === "question" ? "Question prompt…" : "Area heading…"}
                className={input + " min-w-[280px] flex-1"}
              />
              <input
                value={r.step ?? ""}
                onChange={(e) => patch(i, { step: e.target.value || undefined })}
                placeholder="Tab (optional)"
                className={input + " w-[140px]"}
              />
              {r.kind === "brainstorm" && (
                <label className="flex items-center gap-1 text-[11px] text-muted">
                  <input
                    type="checkbox"
                    checked={r.board === true}
                    onChange={(e) => patch(i, { board: e.target.checked || undefined })}
                  />
                  Board
                </label>
              )}
              <button
                onClick={() => setPendingDeleteIdx(i)}
                className={btn + " border-coral text-coral"}
                aria-label="Delete question"
                title="Delete question"
              >
                🗑
              </button>
            </div>
            <textarea
              value={r.help ?? ""}
              onChange={(e) => patch(i, { help: e.target.value || undefined })}
              placeholder="Help / guidance (optional)"
              rows={2}
              className={input + " mt-2 w-full resize-none"}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => add("question")} className={btn + " bg-paper"}>
          + Question
        </button>
        <button onClick={() => add("brainstorm")} className={btn + " bg-paper"}>
          + Brainstorm area
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onCancel} disabled={busy} className={btn + " bg-paper"}>
            Cancel
          </button>
          <button onClick={() => onSave(rows)} disabled={busy} className={btn + " bg-lime hover:bg-lime-deep"}>
            Save questions
          </button>
        </div>
      </div>

      <ConfirmModal
        open={pendingDeleteIdx !== null}
        title="Remove question"
        confirmLabel="Remove"
        message={
          <>
            Remove <strong>{(pendingDeleteIdx !== null && rows[pendingDeleteIdx]?.label) || "this question"}</strong>?
            Any answers already given are kept in the database but no longer shown. Takes effect when you Save.
          </>
        }
        onCancel={() => setPendingDeleteIdx(null)}
        onConfirm={() => {
          if (pendingDeleteIdx !== null) remove(pendingDeleteIdx);
          setPendingDeleteIdx(null);
        }}
      />
    </div>
  );
}
