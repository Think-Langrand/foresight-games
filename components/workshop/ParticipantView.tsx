"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  useParticipant,
  useSessionView,
  postSubmission,
  postResponse,
} from "@/components/workshop/hooks";
import { Poles } from "@/components/Poles";
import type { Lean } from "@/lib/workshop-types";
import { dirColor } from "@/lib/ui";

// localStorage-backed set for gating one-shot actions per session/device.
function useLocalSet(key: string) {
  const [set, setSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setSet(new Set(JSON.parse(raw)));
    } catch {}
  }, [key]);
  const add = useCallback(
    (v: string) =>
      setSet((prev) => {
        const next = new Set(prev);
        next.add(v);
        localStorage.setItem(key, JSON.stringify([...next]));
        return next;
      }),
    [key]
  );
  return { set, add };
}

export function ParticipantView({ code }: { code: string }) {
  const { pid, nick, saveNick } = useParticipant();
  const { view, error, loading, refresh } = useSessionView(code, 3000);
  const [nickDraft, setNickDraft] = useState("");

  useEffect(() => {
    setNickDraft(nick);
  }, [nick]);

  if (loading && !view) return <Centered>Loading session…</Centered>;
  if (error && !view)
    return (
      <Centered>
        <div className="text-center">
          <div className="text-[18px] font-bold">Session {code} not found</div>
          <div className="mt-2 text-[13px] text-muted">{error}</div>
          <Link href="/workshop" className="mt-4 inline-block text-blue underline">
            Try another code
          </Link>
        </div>
      </Centered>
    );
  if (!view) return null;

  const { session, context } = view;
  const closed = session.status === "Closed";
  const mode = session.mode;
  const showDivergent = mode === "Divergent" || mode === "Both";
  const showConvergent = mode === "Convergent" || mode === "Both";

  return (
    <main className="mx-auto min-h-screen max-w-[560px] px-5 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <span className="eyebrow blue">{context?.driverName}</span>
        <span className="rounded-[2px] border border-ink bg-lime px-2 py-1 text-[11px] font-bold uppercase tracking-[0.14em]">
          {code}
        </span>
      </div>
      <h1 className="mt-2 text-[24px] font-extrabold uppercase leading-[1.08] tracking-tight">
        {context?.uncertaintyLabel}
      </h1>
      <p className="serif mt-2 text-[17px] italic leading-[1.35] text-muted">
        {session.prompt}
      </p>
      {context && (
        <div className="mt-4">
          <Poles a={context.poleA} b={context.poleB} />
        </div>
      )}

      {closed && (
        <Banner>This session is closed. Thanks for taking part.</Banner>
      )}

      {!nick && (
        <div className="mt-6 rounded-[3px] border border-[var(--hairline)] bg-card p-4">
          <span className="eyebrow">Add a name (optional)</span>
          <div className="mt-2 flex gap-2">
            <input
              value={nickDraft}
              onChange={(e) => setNickDraft(e.target.value)}
              placeholder="Anonymous"
              className="flex-1 rounded-[2px] border border-[var(--hairline)] bg-paper px-3 py-2 text-[14px] outline-none focus:border-ink"
            />
            <button
              onClick={() => saveNick(nickDraft.trim())}
              className="rounded-[2px] border border-ink bg-lime px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em]"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {context && (
        <PoleLeanPoll
          code={code}
          pid={pid}
          labelA={context.poleA}
          labelB={context.poleB}
          disabled={closed}
          onDone={refresh}
        />
      )}

      {showDivergent && context && (
        <DivergentSection
          code={code}
          pid={pid}
          nick={nick}
          labelA={context.poleA}
          labelB={context.poleB}
          submissions={view.submissions}
          disabled={closed}
          onChange={refresh}
        />
      )}

      {showConvergent && context && (
        <ConvergentSection
          code={code}
          pid={pid}
          outcomes={context.outcomes}
          disabled={closed}
          onChange={refresh}
        />
      )}

      <div className="mt-10 text-center text-[11px] text-muted">
        {view.participantCount} in the room · {view.submissionCount} ideas
      </div>
    </main>
  );
}

function PoleLeanPoll({
  code,
  pid,
  labelA,
  labelB,
  disabled,
  onDone,
}: {
  code: string;
  pid: string;
  labelA: string;
  labelB: string;
  disabled: boolean;
  onDone: () => void;
}) {
  const { set, add } = useLocalSet(`fpw:${code}:pole`);
  const answered = set.has("done");
  const [picked, setPicked] = useState<Lean | null>(null);

  async function pick(v: Lean) {
    if (disabled || answered) return;
    setPicked(v);
    add("done");
    await postResponse(code, {
      kind: "Poll answer",
      participantId: pid,
      pollKey: "pole-lean",
      value: v,
      label: `Pole lean · ${v}`,
    });
    onDone();
  }

  const opts: { v: Lean; label: string }[] = [
    { v: "Toward Pole A", label: labelA },
    { v: "Neither / both", label: "Neither / both" },
    { v: "Toward Pole B", label: labelB },
  ];

  return (
    <section className="mt-7">
      <span className="eyebrow ink">Where do you land?</span>
      <div className="mt-3 grid grid-cols-1 gap-2">
        {opts.map((o) => (
          <button
            key={o.v}
            disabled={disabled || answered}
            onClick={() => pick(o.v)}
            className={
              "rounded-[2px] border px-4 py-3 text-left text-[13.5px] font-semibold transition-colors " +
              (picked === o.v
                ? "border-ink bg-lime"
                : "border-[var(--hairline)] bg-card hover:border-ink disabled:opacity-60")
            }
          >
            {o.label}
          </button>
        ))}
      </div>
      {answered && (
        <div className="mt-2 text-[11px] font-semibold text-muted">Recorded. Thanks.</div>
      )}
    </section>
  );
}

function DivergentSection({
  code,
  pid,
  nick,
  labelA,
  labelB,
  submissions,
  disabled,
  onChange,
}: {
  code: string;
  pid: string;
  nick: string;
  labelA: string;
  labelB: string;
  submissions: { id: string; text: string; author: string; lean: Lean | null; upvotes: number }[];
  disabled: boolean;
  onChange: () => void;
}) {
  const [text, setText] = useState("");
  const [lean, setLean] = useState<Lean | "">("");
  const [busy, setBusy] = useState(false);
  const { set: upvoted, add: addUpvote } = useLocalSet(`fpw:${code}:upvotes`);

  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await postSubmission(code, {
        text: t,
        author: nick,
        lean: lean || null,
        participantId: pid,
      });
      setText("");
      setLean("");
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function upvote(id: string) {
    if (upvoted.has(id) || disabled) return;
    addUpvote(id);
    await postResponse(code, {
      kind: "Upvote submission",
      participantId: pid,
      submissionId: id,
      label: "Upvote",
    });
    onChange();
  }

  return (
    <section className="mt-9">
      <span className="eyebrow ink">How else might this play out?</span>
      {!disabled && (
        <div className="mt-3 rounded-[3px] border border-[var(--hairline)] bg-card p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="A specific way this uncertainty could resolve…"
            className="w-full resize-none rounded-[2px] border border-[var(--hairline)] bg-paper px-3 py-2.5 text-[14px] leading-[1.5] outline-none focus:border-ink"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <LeanChip label={labelA} on={lean === "Toward Pole A"} onClick={() => setLean(lean === "Toward Pole A" ? "" : "Toward Pole A")} />
            <LeanChip label="Neither" on={lean === "Neither / both"} onClick={() => setLean(lean === "Neither / both" ? "" : "Neither / both")} />
            <LeanChip label={labelB} on={lean === "Toward Pole B"} onClick={() => setLean(lean === "Toward Pole B" ? "" : "Toward Pole B")} />
            <button
              onClick={submit}
              disabled={busy || !text.trim()}
              className="ml-auto rounded-[2px] border border-ink bg-lime px-5 py-2 text-[11px] font-bold uppercase tracking-[0.08em] hover:bg-lime-deep disabled:opacity-50"
            >
              {busy ? "…" : "Add"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {submissions.length === 0 && (
          <div className="text-[13px] text-muted">No ideas yet. Be the first.</div>
        )}
        {submissions.map((s) => (
          <div
            key={s.id}
            className="flex items-start gap-3 rounded-[2px] border border-[var(--hairline)] bg-card p-3"
          >
            <button
              onClick={() => upvote(s.id)}
              disabled={upvoted.has(s.id) || disabled}
              className={
                "flex flex-none flex-col items-center rounded-[2px] border px-2.5 py-1.5 text-[11px] font-bold transition-colors " +
                (upvoted.has(s.id)
                  ? "border-lime-deep bg-lime"
                  : "border-[var(--hairline)] hover:border-ink disabled:opacity-50")
              }
              aria-label="Upvote"
            >
              <span className="text-[12px] leading-none">▲</span>
              <span className="mt-0.5 tabular-nums">{s.upvotes}</span>
            </button>
            <div className="min-w-0">
              <div className="text-[14px] leading-[1.4]">{s.text}</div>
              <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                {s.author || "Anonymous"}
                {s.lean ? ` · ${s.lean.replace("Toward ", "")}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConvergentSection({
  code,
  pid,
  outcomes,
  disabled,
  onChange,
}: {
  code: string;
  pid: string;
  outcomes: { id: string; label: string; direction: string; narrative: string }[];
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <section className="mt-9">
      <span className="eyebrow ink">React to the outcomes</span>
      <div className="mt-3 flex flex-col gap-4">
        {outcomes.map((o) => (
          <OutcomeRater
            key={o.id}
            code={code}
            pid={pid}
            outcome={o}
            disabled={disabled}
            onChange={onChange}
          />
        ))}
      </div>
    </section>
  );
}

function OutcomeRater({
  code,
  pid,
  outcome,
  disabled,
  onChange,
}: {
  code: string;
  pid: string;
  outcome: { id: string; label: string; direction: string; narrative: string };
  disabled: boolean;
  onChange: () => void;
}) {
  const { set, add } = useLocalSet(`fpw:${code}:react:${outcome.id}`);
  const dc = dirColor(outcome.direction);

  async function rate(pollKey: "plausibility" | "desirability", n: number) {
    if (disabled || set.has(pollKey)) return;
    add(pollKey);
    await postResponse(code, {
      kind: "Outcome reaction",
      participantId: pid,
      outcomeId: outcome.id,
      pollKey,
      valueNumber: n,
      label: `${pollKey} ${n} · ${outcome.label}`,
    });
    onChange();
  }

  return (
    <div
      className="rounded-r-[2px] bg-card px-4 py-3"
      style={{ borderLeft: `3px solid ${dc}` }}
    >
      <div className="text-[15px] font-bold">{outcome.label}</div>
      <div className="mt-1 text-[13px] leading-[1.45] text-muted">{outcome.narrative}</div>
      <RatingRow
        label="How plausible?"
        lowLabel="Unlikely"
        highLabel="Very likely"
        answered={set.has("plausibility")}
        disabled={disabled}
        onPick={(n) => rate("plausibility", n)}
      />
      <RatingRow
        label="Good or bad for public health?"
        lowLabel="Bad"
        highLabel="Good"
        answered={set.has("desirability")}
        disabled={disabled}
        onPick={(n) => rate("desirability", n)}
      />
    </div>
  );
}

function RatingRow({
  label,
  lowLabel,
  highLabel,
  answered,
  disabled,
  onPick,
}: {
  label: string;
  lowLabel: string;
  highLabel: string;
  answered: boolean;
  disabled: boolean;
  onPick: (n: number) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
          {label}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            disabled={disabled || answered}
            onClick={() => {
              setPicked(n);
              onPick(n);
            }}
            className={
              "h-9 flex-1 rounded-[2px] border text-[13px] font-bold transition-colors " +
              (picked === n
                ? "border-ink bg-lime"
                : "border-[var(--hairline)] bg-paper hover:border-ink disabled:opacity-50")
            }
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] font-semibold uppercase tracking-[0.05em] text-muted">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

function LeanChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        "max-w-[45%] truncate rounded-[2px] border px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] transition-colors " +
        (on ? "border-ink bg-lime" : "border-[var(--hairline)] bg-paper hover:border-ink")
      }
    >
      {label}
    </button>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-[2px] border border-[var(--hairline)] bg-lime px-4 py-3 text-[13px] font-semibold">
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-[15px] text-muted">
      {children}
    </main>
  );
}
