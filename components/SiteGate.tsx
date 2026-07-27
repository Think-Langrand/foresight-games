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

export function SiteGate({ children }: { children: React.ReactNode }) {
  // "checking" until the client reads storage; render the gate over the content
  // meanwhile so nothing leaks on a locked device.
  const [status, setStatus] = useState<"checking" | "locked" | "unlocked">("checking");
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
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
      setStatus("unlocked");
      return;
    }
    setError(true);
  }

  return (
    <>
      {children}
      {status !== "unlocked" && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-cover bg-center px-5"
          style={{ backgroundImage: `url(${gateImage.src})` }}
        >
          {/* Deep-blue scrim, echoing the entry cards on the home page. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(13,28,61,0.92) 10%, rgba(13,28,61,0.72) 55%, rgba(13,28,61,0.60) 100%)",
            }}
          />
          <form
            onSubmit={submit}
            className="relative w-full max-w-[400px] rounded-[3px] border border-white/40 bg-[rgba(245,244,236,0.55)] p-7 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md"
          >
            <span className="eyebrow blue">NNPHI · Foresight for Public Health</span>
            <h1 className="mt-3 font-sans text-[26px] font-extrabold uppercase leading-[1.05] tracking-tight">
              Future of Public Health
            </h1>
            <p className="serif mt-2 text-[16px] italic leading-[1.35] text-muted">
              This preview is private. Enter the password to continue.
            </p>

            <label className="eyebrow mt-6 block" htmlFor="site-password">
              Password
            </label>
            <input
              id="site-password"
              type="password"
              autoFocus
              autoComplete="off"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(false);
              }}
              className="mt-2 w-full rounded-[2px] border border-ink bg-[rgba(251,250,243,0.45)] px-3 py-2.5 text-[15px] outline-none backdrop-blur-sm focus:border-blue focus:bg-[rgba(251,250,243,0.7)]"
            />

            {error && (
              <div className="mt-3 text-[13px] font-semibold text-coral">
                That&rsquo;s not it — try again.
              </div>
            )}

            <button
              type="submit"
              className="mt-6 w-full rounded-[2px] border border-ink bg-lime px-6 py-3 text-[13px] font-bold uppercase tracking-[0.1em] hover:bg-lime-deep"
            >
              Unlock →
            </button>
          </form>
        </div>
      )}
    </>
  );
}
