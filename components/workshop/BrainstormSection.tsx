"use client";

import { useRef, useState } from "react";
import { CARD_TEXT_MAX, type RippleCard } from "@/lib/ripples-types";

// A peel-off sticky pad: add notes, drag to reorder, click to edit your own. Shared by
// the implications worksheet (one brainstorm) and the scenario-assessment worksheet
// (several named brainstorm areas). The heading is passed in via `header` so each area
// can label itself; `readOnly` renders the notes without the pad / edit / drag affordances.
export const STICKY_BG = "#fbeea6"; // off-yellow

export function BrainstormSection({
  stickies,
  canEdit,
  busy,
  onAdd,
  onDelete,
  onReorder,
  onEdit,
  header,
  readOnly = false,
  placeholder = "＋ a note…",
}: {
  stickies: RippleCard[]; // pre-sorted by `sort`
  canEdit: (card: RippleCard) => boolean; // your own notes: editable + deletable
  busy: boolean;
  onAdd: (text: string) => void;
  onDelete: (card: RippleCard) => void;
  onReorder: (cardId: string, sort: number) => void;
  onEdit: (cardId: string, text: string) => void;
  header?: React.ReactNode;
  readOnly?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // Inline edit of one note at a time. `handled` guards against the commit firing
  // twice (Cmd+Enter/blur, or an Escape-then-unmount blur) in a single edit.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const handled = useRef(false);
  const over = text.length > CARD_TEXT_MAX;
  const submit = () => {
    const t = text.trim();
    if (!t || over) return;
    onAdd(t);
    setText("");
  };

  const startEdit = (c: RippleCard) => {
    handled.current = false;
    setEditingId(c.id);
    setEditText(c.text);
  };
  const commitEdit = () => {
    if (handled.current) return;
    handled.current = true;
    const id = editingId;
    const original = stickies.find((s) => s.id === id)?.text;
    const t = editText.trim();
    setEditingId(null);
    setEditText("");
    if (id && t && t.length <= CARD_TEXT_MAX && t !== original) onEdit(id, t);
  };
  const cancelEdit = () => {
    handled.current = true;
    setEditingId(null);
    setEditText("");
  };

  // Drop the dragged sticky just before `targetId` (or at the end when targetId null).
  const drop = (targetId: string | null) => {
    const dropped = dragId;
    setDragId(null);
    setOverId(null);
    if (!dropped || dropped === targetId) return;
    if (targetId === null) {
      const last = stickies[stickies.length - 1];
      if (last && last.id !== dropped) onReorder(dropped, last.sort + 1);
    } else {
      const idx = stickies.findIndex((s) => s.id === targetId);
      const target = stickies[idx];
      const prev = stickies[idx - 1];
      if (!target || prev?.id === dropped) return;
      const newSort = prev ? (prev.sort + target.sort) / 2 : target.sort - 1;
      onReorder(dropped, newSort);
    }
  };

  return (
    <section>
      {header}
      <div className="mt-3 flex items-start gap-5">
        {/* the pad — a stack of blank notes, pinned on the left */}
        {!readOnly && (
          <div className="flex-none">
            <div className="relative w-44">
              <span
                aria-hidden
                className="absolute left-2 top-2 h-full w-full rounded-[2px] border border-black/10"
                style={{ background: STICKY_BG }}
              />
              <span
                aria-hidden
                className="absolute left-1 top-1 h-full w-full rounded-[2px] border border-black/10"
                style={{ background: STICKY_BG }}
              />
              <div
                className="relative rounded-[2px] border border-dashed border-black/30 p-2 shadow-[2px_3px_0_rgba(36,36,34,0.12)]"
                style={{ background: STICKY_BG }}
              >
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
                  }}
                  rows={3}
                  placeholder={placeholder}
                  className="w-full resize-none rounded-[2px] border border-black/15 bg-white/60 p-1.5 text-[12.5px] outline-none focus:border-ink"
                />
                <div className="mt-1 flex items-center justify-between">
                  <span className={"text-[10px] " + (over ? "font-bold text-coral" : "text-black/40")}>
                    {text.length}/{CARD_TEXT_MAX}
                  </span>
                  <button
                    onClick={submit}
                    disabled={busy || !text.trim() || over}
                    className="rounded-[2px] border border-ink bg-lime px-3 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em] disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-muted">New note</p>
          </div>
        )}

        {/* the notes you've peeled off — flow left→right, wrap, drop-to-reorder */}
        <div
          className="flex min-h-[8.5rem] flex-1 flex-wrap content-start items-start gap-3 rounded-[3px] border border-dashed border-black/10 p-3"
          onDragOver={(e) => !readOnly && e.preventDefault()}
          onDrop={() => !readOnly && drop(null)}
        >
          {stickies.length === 0 && (
            <p className="m-auto text-[12px] italic text-muted">
              {readOnly ? "No notes." : "Notes you add appear here."}
            </p>
          )}
          {stickies.map((c) => {
            const isDragging = dragId === c.id;
            const showDropBar = dragId && overId === c.id && dragId !== c.id;
            const mine = !readOnly && canEdit(c);
            const editing = editingId === c.id;
            return (
              <div key={c.id} className="relative">
                {showDropBar && (
                  <span className="absolute -left-2 bottom-0 top-0 w-1 rounded bg-[var(--lime-deep)]" />
                )}
                <div
                  draggable={!editing && !readOnly}
                  onDragStart={() => !readOnly && setDragId(c.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  onDragOver={(e) => {
                    if (readOnly) return;
                    e.preventDefault();
                    if (dragId && dragId !== c.id) setOverId(c.id);
                  }}
                  onDragLeave={() => setOverId((v) => (v === c.id ? null : v))}
                  onDrop={(e) => {
                    if (readOnly) return;
                    e.stopPropagation();
                    drop(c.id);
                  }}
                  className={
                    "group relative w-44 rounded-[2px] border border-black/10 shadow-[2px_3px_0_rgba(36,36,34,0.12)] transition-transform " +
                    (editing || readOnly
                      ? ""
                      : "cursor-grab hover:-translate-y-0.5 hover:shadow-[3px_5px_0_rgba(36,36,34,0.16)] active:cursor-grabbing ") +
                    (isDragging ? "rotate-2 opacity-50" : "")
                  }
                  style={{ background: STICKY_BG }}
                >
                  <div className="flex items-center justify-between px-2 pt-1 text-black/30">
                    <span aria-hidden className="text-[11px] leading-none tracking-[-2px]">
                      {readOnly ? "" : "⠿⠿"}
                    </span>
                    {mine && (
                      <button
                        onClick={() => onDelete(c)}
                        onMouseDown={(e) => e.stopPropagation()}
                        draggable={false}
                        className="rounded-[2px] px-1 text-[11px] font-bold text-black/40 opacity-0 hover:text-ink group-hover:opacity-100"
                        aria-label="Delete note"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {editing ? (
                    <div className="px-2 pb-2">
                      <textarea
                        value={editText}
                        autoFocus
                        onChange={(e) => setEditText(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") cancelEdit();
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            commitEdit();
                          }
                        }}
                        rows={3}
                        className="w-full resize-none rounded-[2px] border border-black/25 bg-white/70 p-1.5 text-[12.5px] leading-[1.35] outline-none focus:border-ink"
                      />
                    </div>
                  ) : (
                    <p
                      onClick={() => mine && startEdit(c)}
                      onKeyDown={
                        mine
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                startEdit(c);
                              }
                            }
                          : undefined
                      }
                      role={mine ? "button" : undefined}
                      tabIndex={mine ? 0 : undefined}
                      title={mine ? "Click to edit" : undefined}
                      className={
                        "px-2.5 pb-2.5 text-[12.5px] leading-[1.35] " +
                        (mine ? "cursor-text rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ink" : "")
                      }
                    >
                      {c.text}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
