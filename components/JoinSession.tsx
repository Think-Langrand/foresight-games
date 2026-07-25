"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Slim "join a table" entry for the home page: type a session code, go to its
// play surface. (Facilitators start games from /admin.)
export function JoinSession() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) router.push(`/workshop/s/${encodeURIComponent(c)}`);
  }

  return (
    <form
      onSubmit={join}
      className="flex flex-wrap items-center gap-3 rounded-[3px] border border-[var(--hairline)] bg-card px-4 py-3"
    >
      <span className="eyebrow">Have a code?</span>
      <span className="text-[13px] text-muted">Join a table someone's running.</span>
      <span className="grow" />
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABCD"
        maxLength={6}
        autoCapitalize="characters"
        autoCorrect="off"
        aria-label="Session code"
        className="w-28 rounded-[2px] border border-ink bg-paper px-3 py-2 text-[16px] font-bold uppercase tracking-[0.2em] outline-none"
      />
      <button
        type="submit"
        className="rounded-[2px] border border-ink bg-paper px-5 py-2 text-[12px] font-bold uppercase tracking-[0.1em] hover:bg-lime"
      >
        Join →
      </button>
    </form>
  );
}
