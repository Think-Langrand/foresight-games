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
  // Shown in place of empty text, as a single-click affordance. Without it, an empty
  // field has nothing to double-click and is effectively unreachable.
  emptyLabel,
  maxLength = CARD_TEXT_MAX,
  rows,
  // A pencil beside the text that starts editing on a single click. Double-click is not
  // discoverable on a headline nobody expects to be editable; the pencil says so.
  editIcon = false,
}: {
  text: string;
  editable: boolean;
  busy?: boolean;
  onSave: (next: string) => void;
  className?: string;
  placeholder?: string;
  emptyLabel?: string;
  maxLength?: number;
  rows?: number;
  editIcon?: boolean;
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
    // An optional field may be cleared; a required one falls back to what it was.
    if (next !== text && (next || emptyLabel)) onSave(next);
    else setDraft(text);
  };

  if (!editing && !text && emptyLabel) {
    if (!editable) return null;
    return (
      <button
        onClick={() => {
          setDraft("");
          setEditing(true);
        }}
        className={"text-left text-[11px] font-bold uppercase tracking-[0.05em] text-blue hover:underline " + className}
      >
        {emptyLabel}
      </button>
    );
  }

  if (!editing) {
    const start = () => {
      if (!editable) return;
      setDraft(text);
      setEditing(true);
    };
    const body = (
      <div
        className={
          "whitespace-pre-wrap break-words " +
          (editable ? "cursor-text rounded-[2px] hover:bg-black/[0.03] " : "") +
          className
        }
        onDoubleClick={start}
        title={editable ? "Double-click to edit" : undefined}
      >
        {text}
      </div>
    );
    if (!editIcon || !editable) return body;
    return (
      <span className="flex flex-wrap items-start gap-x-2.5 gap-y-1">
        <span className="min-w-0">{body}</span>
        <button
          onClick={start}
          aria-label="Edit"
          title="Edit"
          // Normal weight and case whatever the headline around it is set in, so the
          // pencil reads as a control rather than as part of the text.
          className="mt-[0.2em] shrink-0 rounded-[2px] border border-[var(--hairline)] bg-paper px-1.5 py-0.5 text-[12px] font-normal normal-case leading-none tracking-normal text-muted hover:border-ink hover:text-ink"
        >
          ✎
        </button>
      </span>
    );
  }

  return (
    <textarea
      ref={ref}
      value={draft}
      maxLength={maxLength}
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
      rows={rows ?? Math.min(6, Math.max(2, Math.ceil(draft.length / 34)))}
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

// A "⋯" overflow menu. Card actions live in here rather than on the card face, so the card
// reads as its text and nothing else until you go looking for an action.
export function CardMenu({
  label = "Card actions",
  children,
}: {
  label?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  // Subscribing to document events is what effects are for. Closing on an outside click
  // has to be on the document, because the click that dismisses the menu by definition
  // lands somewhere this component does not render.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        title={label}
        // Not draggable: a mousedown here must open the menu, not start dragging the card.
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        className={
          // Always visible, just quiet. It used to appear on group-hover, which meant a
          // card with no `group` ancestor only revealed it on click — and revealed it to
          // nobody at all on a touch screen, where there is no hover.
          "rounded-[2px] px-1.5 py-0.5 text-[14px] font-bold leading-none transition-all hover:bg-black/10 hover:text-ink " +
          (open ? "bg-black/10 text-ink" : "text-muted/70 hover:text-ink")
        }
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 flex min-w-[11rem] flex-col rounded-[3px] border border-ink bg-paper py-1 shadow-[2px_3px_0_rgba(36,36,34,0.18)]"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// One row inside a CardMenu.
export function CardMenuItem({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={
        "px-3 py-1.5 text-left text-[12px] font-bold uppercase tracking-[0.05em] hover:bg-lime " +
        (danger ? "text-coral" : "text-ink")
      }
    >
      {children}
    </button>
  );
}
