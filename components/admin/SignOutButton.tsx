"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseAuthBrowser } from "@/lib/supabase-auth-browser";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const supabase = supabaseAuthBrowser();
    await supabase?.auth.signOut();
    router.refresh();
    router.push("/login");
  }

  return (
    <button
      onClick={signOut}
      disabled={busy}
      className="rounded-[2px] border border-ink bg-paper px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-coral hover:text-white disabled:opacity-50"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
