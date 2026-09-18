"use client";

import { useMemo, useRef, useState } from "react";
import {
  CARD_TEXT_MAX,
  PHASE_PREFIXES,
  buildChildrenMap,
  childOrderOf,
  type CardOrder,
  type RippleCard,
} from "@/lib/ripples-types";
import { rippleRoleColor } from "@/components/workshop/RippleCard";

// An auto-arranged, horizontal implications tree grown from flat cards + parentId.
// Scenario-name root → key changes (FIRST) → SECOND → TERMINAL, each branching into
// any number of children. Connectors are pure CSS (stub + spine + ticks); new nodes
// animate in. Interactive mode shows ＋ (add child), ✎ / click-to-edit and ✕ (delete),
// each gated per card; read-only mode (done/present/admin) just renders the shape.
export function ImplicationTree({
  cards,
  scenarioTitle,
  interactive = false,
  busy = false,
  canDelete,
  canEdit,
  challengeEnabled = false,
  onAddRoot,
  onAddChild,
  onDelete,
  onEdit,
  onFlag,
  onVote,
}: {
  cards: RippleCard[];
  scenarioTitle: string;
  interactive?: boolean;
  busy?: boolean;
  // Which cards this viewer may delete (author-owned). Defaults to all in interactive mode.
  canDelete?: (card: RippleCard) => boolean;
  // Which cards this viewer may reword. No onEdit → nothing is editable.
  canEdit?: (card: RippleCard) => boolean;
  challengeEnabled?: boolean;
  onAddRoot?: (text: string) => void; // add a key change (FIRST) off the scenario root
  onAddChild?: (parent: RippleCard, order: CardOrder, text: string) => void;
  onDelete?: (card: RippleCard) => void;
  onEdit?: (cardId: string, text: string) => void;
  onFlag?: (card: RippleCard) => void;
  onVote?: (card: RippleCard) => void;
}) {
  const childrenMap = useMemo(() => buildChildrenMap(cards), [cards]);
  // Tree roots are the key changes (FIRST) — brainstorm STICKY notes share the null
  // parent but are not part of the tree.
  const roots = (childrenMap.get(null) ?? []).filter((c) => c.order === "FIRST");

  // Inline edit of one node at a time. State lives here (nodes are render functions, not
  // components). `handled` guards against the commit firing twice (Enter then blur).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const handled = useRef(false);
  const startEdit = (c: RippleCard) => {
    handled.current = false;
    setEditingId(c.id);
    setEditText(c.text);
  };
  const commitEdit = () => {
    if (handled.current) return;
    handled.current = true;
    const id = editingId;
    const original = cards.find((c) => c.id === id)?.text;
    const t = editText.trim();
    setEditingId(null);
    setEditText("");
    if (id && t && t.length <= CARD_TEXT_MAX && t !== original) onEdit?.(id, t);
  };
  const cancelEdit = () => {
    handled.current = true;
    setEditingId(null);
    setEditText("");
  };

  // Connectors are fresh elements (functions), and the whole tree is rendered with
  // plain render functions (NOT inner components) so React reconciles nodes in place
  // by key instead of remounting them on every re-render (which would replay the
  // grow-in animation and flicker). New nodes still animate because they mount fresh.
  const stub = () => <span className="h-0 w-5 flex-none self-center border-t-2 border-[var(--hairline)]" />;
  const tick = () => <span className="h-0 w-4 flex-none self-center border-t-2 border-[var(--hairline)]" />;

  const renderNode = (card: RippleCard) => {
    const deletable = interactive && (canDelete ? canDelete(card) : true);
    const editable = interactive && !!onEdit && !card.greyed && (canEdit ? canEdit(card) : true);
    const editing = editable && editingId === card.id;
    return (
      <div
        className={
          "w-56 flex-none animate-rise rounded-[4px] border border-[var(--hairline)] bg-card p-2.5 shadow-[0_1px_0_rgba(36,36,34,0.06)] " +
          (card.greyed ? "rotate-[-1.2deg] opacity-40" : "")
        }
        style={{ borderLeft: `4px solid ${rippleRoleColor(card.order)}` }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted">
            {PHASE_PREFIXES[card.order]}
          </span>
          {card.greyed && (
            <span className="text-[8.5px] font-bold uppercase tracking-[0.06em] text-muted">today-thinking</span>
          )}
        </div>
        {editing ? (
          <div className="mt-1">
            <textarea
              value={editText}
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
              autoFocus
              aria-label="Edit node"
              className="w-full resize-none rounded-[2px] border border-ink bg-paper p-1.5 text-[12.5px] leading-[1.35] outline-none"
            />
            <span
              className={
                "text-[10px] " + (editText.length > CARD_TEXT_MAX ? "font-bold text-coral" : "text-muted")
              }
            >
              {editText.length}/{CARD_TEXT_MAX} · Enter to save, Esc to cancel
            </span>
          </div>
        ) : (
          <p
            className={"mt-1 text-[12.5px] leading-[1.35] " + (editable ? "cursor-text" : "")}
            onClick={editable ? () => startEdit(card) : undefined}
            onKeyDown={
              editable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      startEdit(card);
                    }
                  }
                : undefined
            }
            role={editable ? "button" : undefined}
            tabIndex={editable ? 0 : undefined}
            title={editable ? "Click to edit" : undefined}
          >
            {card.text}
          </p>
        )}
        {card.sourceLabel && (
          <p className="mt-1 truncate text-[9px] uppercase tracking-[0.06em] text-muted" title={`Seeded from ${card.sourceLabel}`}>
            ↳ from {card.sourceLabel}
          </p>
        )}
        {interactive && (challengeEnabled || deletable || editable) && !card.greyed && !editing && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {editable && (
              <MiniBtn onClick={() => startEdit(card)} label="Edit">
                ✎
              </MiniBtn>
            )}
            {challengeEnabled &&
              (!card.flagged ? (
                <MiniBtn tone="warn" onClick={() => onFlag?.(card)}>
                  ⚑
                </MiniBtn>
              ) : (
                <MiniBtn tone="warn" onClick={() => onVote?.(card)}>
                  vote
                </MiniBtn>
              ))}
            {deletable && (
              <MiniBtn onClick={() => onDelete?.(card)} label="Delete">
                ✕
              </MiniBtn>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderBranch = (card: RippleCard): React.ReactNode => {
    const kids = childrenMap.get(card.id) ?? [];
    const nextOrder = childOrderOf(card.order);
    const canAdd = interactive && nextOrder !== null && !card.greyed;
    return (
      <div className="flex items-center">
        {renderNode(card)}
        {(kids.length > 0 || canAdd) && (
          <div className="flex items-center">
            {stub()}
            <div className="flex flex-col justify-center gap-3 border-l-2 border-[var(--hairline)]">
              {kids.map((k) => (
                <div key={k.id} className="flex items-center">
                  {tick()}
                  {renderBranch(k)}
                </div>
              ))}
              {canAdd && nextOrder && (
                <div className="flex items-center">
                  {tick()}
                  <AddChildNode order={nextOrder} busy={busy} onAdd={(text) => onAddChild?.(card, nextOrder, text)} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="overflow-x-auto pb-2">
      <div className="inline-flex items-center">
        {/* scenario root node */}
        <div className="w-52 flex-none rounded-[4px] border-2 border-ink bg-lime p-3">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink/70">Scenario</div>
          <div className="mt-0.5 text-[14px] font-extrabold uppercase leading-[1.1] tracking-tight">
            {scenarioTitle || "This world"}
          </div>
        </div>
        <div className="flex items-center">
          {stub()}
          <div className="flex flex-col justify-center gap-3 border-l-2 border-[var(--hairline)]">
            {roots.map((r) => (
              <div key={r.id} className="flex items-center">
                {tick()}
                {renderBranch(r)}
              </div>
            ))}
            {interactive ? (
              <div className="flex items-center">
                {tick()}
                <AddChildNode order="FIRST" busy={busy} onAdd={(text) => onAddRoot?.(text)} />
              </div>
            ) : (
              roots.length === 0 && (
                <div className="flex items-center">
                  {tick()}
                  <span className="text-[12px] italic text-muted">No key changes.</span>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// A dashed "＋" node that expands into a small input to add a child of `order`.
function AddChildNode({
  order,
  busy,
  onAdd,
}: {
  order: CardOrder;
  busy: boolean;
  onAdd: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const over = text.length > CARD_TEXT_MAX;
  const submit = () => {
    const t = text.trim();
    if (!t || over) return;
    onAdd(t);
    setText("");
  };
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-56 flex-none rounded-[4px] border border-dashed border-[var(--hairline)] bg-paper p-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted hover:border-ink hover:text-ink"
      >
        ＋ {PHASE_PREFIXES[order]}
      </button>
    );
  }
  return (
    <div
      className="w-56 flex-none rounded-[4px] border border-ink bg-card p-2"
      style={{ borderLeft: `4px solid ${rippleRoleColor(order)}` }}
    >
      <div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted">
        {PHASE_PREFIXES[order]}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        rows={2}
        autoFocus
        placeholder="…add a node."
        className="mt-1 w-full resize-none rounded-[2px] border border-[var(--hairline)] bg-paper p-1.5 text-[12.5px] outline-none focus:border-ink"
      />
      <div className="mt-1 flex items-center justify-between">
        <span className={"text-[10px] " + (over ? "font-bold text-coral" : "text-muted")}>
          {text.length}/{CARD_TEXT_MAX}
        </span>
        <span className="flex gap-1">
          <MiniBtn onClick={() => setOpen(false)}>close</MiniBtn>
          <button
            onClick={submit}
            disabled={busy || !text.trim() || over}
            className="rounded-[2px] border border-ink bg-lime px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em] disabled:opacity-40"
          >
            Add
          </button>
        </span>
      </div>
    </div>
  );
}

function MiniBtn({
  children,
  onClick,
  tone,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "warn";
  label?: string; // accessible name for icon-only buttons
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        "rounded-[2px] border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] " +
        (tone === "warn"
          ? "border-coral text-coral hover:bg-coral hover:text-white"
          : "border-[var(--hairline)] text-muted hover:border-ink hover:text-ink")
      }
    >
      {children}
    </button>
  );
}
