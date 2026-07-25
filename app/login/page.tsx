"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseAuthBrowser } from "@/lib/supabase-auth-browser";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = supabaseAuthBrowser();
    if (!supabase) {
      setError("Auth is not configured on this deployment.");
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    // Full navigation so the proxy re-reads the freshly-set auth cookies.
    router.refresh();
    router.push(next);
  }

  return (
    <main className="mx-auto max-w-[420px] px-6 py-20">
      <Link href="/" className="eyebrow blue">
        ← Home
      </Link>
      <h1 className="mt-4 text-[30px] font-extrabold uppercase leading-[1.05] tracking-tight">
        Facilitator sign-in
      </h1>
      <p className="mt-2 text-[13.5px] leading-[1.5] text-muted">
        The admin area is private. Sign in with your facilitator account.
      </p>

      <form
        onSubmit={submit}
        className="mt-8 rounded-[3px] border border-[var(--hairline)] bg-card p-6"
      >
        <label className="eyebrow" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full rounded-[2px] border border-ink bg-paper px-3 py-2.5 text-[15px] outline-none"
          required
        />

        <label className="eyebrow mt-4 block" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full rounded-[2px] border border-ink bg-paper px-3 py-2.5 text-[15px] outline-none"
          required
        />

        {error && <div className="mt-4 text-[13px] font-semibold text-coral">{error}</div>}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-[2px] border border-ink bg-lime px-6 py-3 text-[13px] font-bold uppercase tracking-[0.1em] hover:bg-lime-deep disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in →"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
