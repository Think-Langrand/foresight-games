"use client";

import { useRef, useState } from "react";

// A small hover-reveal icon button that copies `text` to the clipboard and briefly
// confirms with a ✓. Copying is a read-only action, so — unlike the edit/delete
// controls — it is shown on every item regardless of ownership, letting people pull
// text from a teammate's answer or sticky note into their own. Callers pass the
// context-matching `className` (size/colour) and, on draggable surfaces, an
// `onMouseDown` that stops the drag from starting.
export function CopyButton({
  text,
  label = "Copy",
  className = "",
  onMouseDown,
}: {
  text: string;
  label?: string;
  className?: string;
  onMouseDown?: (e: React.MouseEvent) => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return; // Clipboard unavailable (e.g. insecure context) — fail quietly.
    }
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={copy}
      onMouseDown={onMouseDown}
      draggable={false}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className={"inline-flex items-center justify-center " + className}
    >
      {copied ? (
        <svg
          viewBox="0 0 24 24"
          width="1em"
          height="1em"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          width="1em"
          height="1em"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
    </button>
  );
}
