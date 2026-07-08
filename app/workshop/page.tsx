"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MarkText } from "@/components/Mark";

export default function WorkshopLanding() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) router.push(`/workshop/s/${encodeURIComponent(c)}`);
  }

  return (
    <main className="mx-auto max-w-[720px] px-6 py-16 md:py-24">
      <Link href="/" className="eyebrow blue">
        ← Home
      </Link>
      <h1 className="mt-4 text-[40px] font-extrabold uppercase leading-[1.02] tracking-tight">
        <MarkText>Workshop</MarkText>
      </h1>
      <p className="serif mt-5 text-[22px] leading-[1.35] text-ink">
        Join a live session on your phone, or open one from a driver's uncertainty and put it
        on the screen.
      </p>

      <form
        onSubmit={join}
        className="mt-10 rounded-[3px] border border-[var(--hairline)] bg-card p-6"
      >
        <label className="eyebrow" htmlFor="code">
          Join with a code
        </label>
        <div className="mt-3 flex gap-2">
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD"
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            className="w-40 rounded-[2px] border border-ink bg-paper px-4 py-3 text-[24px] font-bold uppercase tracking-[0.2em] outline-none"
          />
          <button
            type="submit"
            className="rounded-[2px] border border-ink bg-lime px-6 py-3 text-[12px] font-bold uppercase tracking-[0.1em] hover:bg-lime-deep"
          >
            Join →
          </button>
        </div>
      </form>

      <div className="mt-6 rounded-[3px] border border-[var(--hairline)] bg-card p-6">
        <span className="eyebrow">Run a new session</span>
        <p className="mt-3 text-[14px] leading-[1.55] text-muted">
          Open{" "}
          <Link href="/explore" className="font-semibold text-blue underline">
            Explore
          </Link>
          , pick any driver, and hit <span className="font-semibold">Run workshop →</span> on
          the uncertainty you want the room to work on. You'll get a projection screen and a
          join code to share.
        </p>
      </div>
    </main>
  );
}
