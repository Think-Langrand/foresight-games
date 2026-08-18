"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import gateImage from "@/public/image3.png";

// Server-validated per-project password screen. Unlike the global SiteGate, the
// password is never in the client bundle: this form POSTs the attempt to
// /api/project/[title]/unlock, which verifies it against the stored scrypt hash
// and (on success) sets an httpOnly unlock cookie. We then refresh so the
// project layout re-runs and reveals the page.
export function ProjectGate({
  title,
  projectName,
}: {
  title: string;
  projectName: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/project/${encodeURIComponent(title)}/unlock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passphrase: value }),
        }
      );
      if (!res.ok) {
        setError(true);
        setBusy(false);
        return;
      }
      // Cookie is set; re-run the (now unlocked) layout to reveal the page.
      router.refresh();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden px-5">
      {/* Heavily blurred photo — reads as soft abstract texture, not a photo. */}
      <div
        className="absolute inset-0 scale-110 bg-cover bg-center"
        style={{ backgroundImage: `url(${gateImage.src})`, filter: "blur(22px)" }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(13,28,61,0.55) 0%, rgba(13,28,61,0.30) 60%, rgba(13,28,61,0.35) 100%)",
        }}
      />
      <form onSubmit={submit} className="relative w-full max-w-[360px] text-center">
        <span className="eyebrow" style={{ color: "rgba(255,255,255,0.72)" }}>
          {projectName}
        </span>
        <h1 className="mt-2 font-sans text-[30px] font-extrabold uppercase leading-[1.05] tracking-tight text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.45)]">
          Enter passphrase
        </h1>

        <input
          id="project-password"
          type="password"
          autoFocus
          autoComplete="off"
          placeholder="Passphrase"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(false);
          }}
          className="mt-7 w-full rounded-[2px] border border-white/50 bg-white/10 px-3 py-2.5 text-center text-[15px] text-white outline-none backdrop-blur-sm placeholder:text-white/55 focus:border-lime focus:bg-white/20"
        />

        {error && (
          <div className="mt-3 text-[13px] font-semibold text-[#ffb4a8]">
            That&rsquo;s not it — try again.
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-[2px] border border-ink bg-lime px-6 py-3 text-[13px] font-bold uppercase tracking-[0.1em] text-ink hover:bg-lime-deep disabled:opacity-50"
        >
          {busy ? "Checking…" : "Unlock →"}
        </button>
      </form>
    </div>
  );
}
