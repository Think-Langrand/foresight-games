"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import joinBg from "@/public/image.png";

// Slim "join a table" entry for the home page: type a session code, go to its
// play surface. (Facilitators start games from /admin.)
export function JoinSession({ basePath = "" }: { basePath?: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) router.push(`${basePath}/workshop/s/${encodeURIComponent(c)}`);
  }

  return (
    <form
      onSubmit={join}
      className="relative flex flex-wrap items-center gap-3 overflow-hidden rounded-[3px] border border-ink px-4 py-3"
      style={{ borderLeft: "3px solid var(--lime)" }}
    >
      {/* Eco-village band from the contact sheet, slowly panning across. */}
      <Image
        src={joinBg}
        alt=""
        placeholder="blur"
        sizes="(max-width: 980px) 100vw, 980px"
        style={{ objectPosition: "50% 72%" }}
        className="animate-pan-x pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(90deg, rgba(9,20,12,0.88) 0%, rgba(9,20,12,0.66) 55%, rgba(9,20,12,0.78) 100%)",
        }}
      />
      <span className="eyebrow" style={{ color: "var(--lime)" }}>
        Have a code?
      </span>
      <span className="text-[13px] text-white/70">Join a table someone&apos;s running.</span>
      <span className="grow" />
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABCD"
        maxLength={6}
        autoCapitalize="characters"
        autoCorrect="off"
        aria-label="Session code"
        className="w-28 rounded-[2px] border border-lime bg-transparent px-3 py-2 text-[16px] font-bold uppercase tracking-[0.2em] text-lime outline-none placeholder:text-white/30 focus:border-lime"
      />
      <button
        type="submit"
        className="rounded-[2px] bg-lime px-5 py-2 text-[12px] font-bold uppercase tracking-[0.1em] text-ink transition-colors hover:bg-white"
      >
        Join →
      </button>
    </form>
  );
}
