"use client";

import { useEffect, useRef, useState } from "react";
import { CARD_TEXT_MAX } from "@/lib/ripples-types";

// A small text card with inline editing, used across the Week 3 steps. Kept deliberately
// dumb: the parent owns the data and every mutation, so the same card renders in the
// cluster tray, inside a theme, and in the Parked drawer.

export function InlineText({
  text,
  editable,
  busy,
  onSave,
  className = "",
  placeholder = "Card text",
}: {
  text: string;
  editable: boolean;
  busy?: boolean;
  onSave: (next: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== text) onSave(next);
    else setDraft(text);
  };

  if (!editing) {
    return (
      <div
        className={
          "whitespace-pre-wrap break-words " +
          (editable ? "cursor-text rounded-[2px] hover:bg-black/[0.03] " : "") +
          className
        }
        onDoubleClick={() => {
          if (!editable) return;
          setDraft(text);
          setEditing(true);
        }}
        title={editable ? "Double-click to edit" : undefined}
      >
        {text}
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      value={draft}
      maxLength={CARD_TEXT_MAX}
      disabled={busy}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // Enter commits, Shift+Enter makes a new line, Escape abandons the edit.
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(text);
          setEditing(false);
        }
      }}
      placeholder={placeholder}
      rows={Math.min(6, Math.max(2, Math.ceil(draft.length / 34)))}
      className={"w-full resize-none rounded-[2px] border border-ink bg-paper p-1.5 text-[12.5px] leading-[1.4] outline-none " + className}
    />
  );
}

// A one-line "add a card" composer. Stays open after a successful add so a group can type
// several in a row, which is how these boards actually get used.
export function AddCardForm({
  label,
  busy,
  onAdd,
  autoFocus,
  onDone,
}: {
  label: string;
  busy?: boolean;
  onAdd: (text: string) => void;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const submit = () => {
    const next = text.trim();
    if (!next) return;
    onAdd(next);
    setText("");
    ref.current?.focus();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        ref={ref}
        value={text}
        maxLength={CARD_TEXT_MAX}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onDone?.();
          }
        }}
        placeholder={label}
        rows={2}
        className="w-full resize-none rounded-[2px] border border-[var(--rule)] bg-paper p-1.5 text-[12.5px] leading-[1.4] outline-none focus:border-ink"
      />
      <div className="flex items-center gap-1.5">
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="rounded-[2px] border border-ink bg-lime px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em] disabled:opacity-40"
        >
          Add
        </button>
        {onDone && (
          <button
            onClick={onDone}
            className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted hover:text-ink"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
