"use client";

import { useEffect, useState } from "react";
import gateImage from "@/public/image3.png";

// Soft, site-wide password screen. This is a light gate for a private preview —
// the password lives client-side, so it keeps the curious out, not attackers.
// Once unlocked, the flag is remembered on the device so returning visitors skip it.
const UNLOCK_KEY = "fpw:site:unlocked";
// Swap the gate password via NEXT_PUBLIC_SITE_PASSWORD (inlined at build time,
// since this runs in the browser). Falls back to the launch password if unset.
const PASSWORD = process.env.NEXT_PUBLIC_SITE_PASSWORD || "publicHealth35";
// Turn the gate off entirely with NEXT_PUBLIC_SITE_GATE_ENABLED=false (also
// inlined at build time). Anything other than an explicit off value keeps the
// gate on, so the default — and any misconfiguration — stays locked.
const GATE_ENABLED = !["false", "0", "off"].includes(
  (process.env.NEXT_PUBLIC_SITE_GATE_ENABLED ?? "").trim().toLowerCase()
);

export function SiteGate({ children }: { children: React.ReactNode }) {
  // "checking" until the client reads storage; render the gate over the content
  // meanwhile so nothing leaks on a locked device. When the gate is disabled we
  // start "unlocked" so the content shows immediately and no gate ever renders.
  const [status, setStatus] = useState<"checking" | "locked" | "unlocked">(
    GATE_ENABLED ? "checking" : "unlocked"
  );
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  // Once the password lands, fade the gate out over the revealed app before
  // unmounting it — a soft crossfade rather than an instant cut.
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!GATE_ENABLED) return; // gate off — stay unlocked, never touch storage
    try {
      setStatus(localStorage.getItem(UNLOCK_KEY) === "1" ? "unlocked" : "locked");
    } catch {
      setStatus("locked");
    }
  }, []);

  // Stop the page behind the gate from scrolling while it's shown.
  useEffect(() => {
    if (status === "unlocked") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [status]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value === PASSWORD) {
      try {
        localStorage.setItem(UNLOCK_KEY, "1");
      } catch {
        // Non-fatal: they're in for this visit, just not remembered.
      }
      setLeaving(true);
      window.setTimeout(() => setStatus("unlocked"), 650);
      return;
    }
    setError(true);
  }

  return (
    <>
      {children}
      {status !== "unlocked" && (
        <div
          className={
            "fixed inset-0 z-[100] flex items-center justify-center overflow-hidden px-5 transition-opacity duration-[650ms] ease-out " +
            (leaving ? "pointer-events-none opacity-0" : "opacity-100")
          }
        >
          {/* Heavily blurred photo — reads as soft abstract texture, not a photo.
              Scaled up so the blur doesn't feather transparent edges into view. */}
          <div
            className="absolute inset-0 scale-110 bg-cover bg-center"
            style={{ backgroundImage: `url(${gateImage.src})`, filter: "blur(22px)" }}
          />
          {/* Light scrim, just enough to keep the text legible over the photo. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(13,28,61,0.55) 0%, rgba(13,28,61,0.30) 60%, rgba(13,28,61,0.35) 100%)",
            }}
          />
          <form onSubmit={submit} className="relative w-full max-w-[360px] text-center">
            <span className="eyebrow" style={{ color: "rgba(255,255,255,0.72)" }}>
              NNPHI · Langrand
            </span>
            <h1 className="mt-2 font-sans text-[30px] font-extrabold uppercase leading-[1.05] tracking-tight text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.45)]">
              Future of Public Health
            </h1>

            <input
              id="site-password"
              type="password"
              autoFocus
              autoComplete="off"
              placeholder="Password"
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
              className="mt-4 w-full rounded-[2px] border border-ink bg-lime px-6 py-3 text-[13px] font-bold uppercase tracking-[0.1em] text-ink hover:bg-lime-deep"
            >
              Unlock →
            </button>
          </form>
        </div>
      )}
    </>
  );
}
