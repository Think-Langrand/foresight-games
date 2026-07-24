"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  useParticipant,
  useSessionView,
  postSubmission,
  postResponse,
  deleteUpvote,
} from "@/components/workshop/hooks";
import { Poles } from "@/components/Poles";
import { ReferenceDrawer } from "@/components/workshop/ReferenceDrawer";
import type { DriverLite } from "@/lib/drivers-shared";
import type { Lean, ScenarioLite } from "@/lib/workshop-types";

// localStorage-backed set, per session/uncertainty/device. Supports toggling entries.
function useLocalSet(key: string) {
  const [set, setSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setSet(raw ? new Set(JSON.parse(raw)) : new Set());
    } catch {
      setSet(new Set());
    }
  }, [key]);
  const write = useCallback(
    (mutate: (next: Set<string>) => void) =>
      setSet((prev) => {
        const next = new Set(prev);
        mutate(next);
        localStorage.setItem(key, JSON.stringify([...next]));
        return next;
      }),
    [key]
  );
  const add = useCallback((v: string) => write((n) => n.add(v)), [write]);
  const remove = useCallback((v: string) => write((n) => n.delete(v)), [write]);
  return { set, add, remove };
}

// localStorage-backed single value (for a poll answer the participant can change).
function useLocalValue(key: string) {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    try {
      setValue(localStorage.getItem(key));
    } catch {
      setValue(null);
    }
  }, [key]);
  const save = useCallback(
    (v: string) => {
      setValue(v);
      localStorage.setItem(key, v);
    },
    [key]
  );
  return { value, save };
}

export function ParticipantView({
  code,
  scenarios,
  drivers,
}: {
  code: string;
  scenarios: ScenarioLite[];
  drivers: DriverLite[];
}) {
  const { pid, nick, saveNick } = useParticipant();
  const { view, error, loading, refresh } = useSessionView(code, 3000);
  const [nickDraft, setNickDraft] = useState("");
  const [selfIndex, setSelfIndex] = useState(0); // participant-paced position
  const [showJump, setShowJump] = useState(false);

  const byId = useMemo(
    () => new Map(scenarios.map((s) => [s.id, s])),
    [scenarios]
  );

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

  const { session } = view;
  const closed = session.status === "Closed";
  const isFull = session.scope === "Full";
  const participantPaced = isFull && session.pacing === "Participant-paced";

  // Which uncertainty this participant is on right now.
  const activeId = participantPaced
    ? scenarios[Math.min(selfIndex, scenarios.length - 1)]?.id ?? ""
    : session.uncertaintyId ?? "";
  const active = byId.get(activeId);
  const results = view.byUncertainty[activeId] ?? {
    submissions: [],
    poleLean: { "Toward Pole A": 0, "Toward Pole B": 0, "Neither / both": 0 },
    submissionCount: 0,
  };
  const position = scenarios.findIndex((s) => s.id === activeId);

  return (
    <>
    <main className="mx-auto min-h-screen max-w-[560px] px-5 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <span className="eyebrow blue">
          {active?.capabilityDomain || active?.driverNames[0] || "Workshop"}
        </span>
        <span className="rounded-[2px] border border-ink bg-lime px-2 py-1 text-[11px] font-bold uppercase tracking-[0.14em]">
          {code}
        </span>
      </div>

      {/* Full-session navigation / progress */}
      {isFull && (
        <div className="mt-3 rounded-[2px] border border-[var(--hairline)] bg-card px-3 py-2.5">
          {participantPaced ? (
            <div className="flex items-center gap-2">
              <NavBtn
                disabled={position <= 0}
                onClick={() => setSelfIndex((i) => Math.max(0, i - 1))}
              >
                ← Prev
              </NavBtn>
              <button
                onClick={() => setShowJump((s) => !s)}
                className="flex-1 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-muted"
              >
                {position + 1} / {scenarios.length} · {active?.workshopId}
              </button>
              <NavBtn
                disabled={position >= scenarios.length - 1}
                onClick={() =>
                  setSelfIndex((i) => Math.min(scenarios.length - 1, i + 1))
                }
              >
                Next →
              </NavBtn>
            </div>
          ) : (
            <div className="text-center text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
              Following facilitator · {active?.workshopId} · {position + 1} /{" "}
              {scenarios.length}
            </div>
          )}
          {participantPaced && showJump && (
            <JumpList
              scenarios={scenarios}
              activeId={activeId}
              onPick={(idx) => {
                setSelfIndex(idx);
                setShowJump(false);
              }}
            />
          )}
        </div>
      )}

      <h1 className="mt-3 text-[24px] font-extrabold uppercase leading-[1.08] tracking-tight">
        {active?.label}
      </h1>
      <p className="serif mt-2 text-[17px] italic leading-[1.35] text-muted">
        {active?.question}
      </p>
      {active && (
        <div className="mt-4">
          <Poles a={active.poleA} b={active.poleB} />
        </div>
      )}

      {closed && <Banner>This session is closed. Thanks for taking part.</Banner>}

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

      {active && (
        <PoleLeanPoll
          key={`pole-${activeId}`}
          code={code}
          pid={pid}
          uncertaintyId={activeId}
          labelA={active.poleA}
          labelB={active.poleB}
          disabled={closed}
          onDone={refresh}
        />
      )}

      {active && (
        <DivergentSection
          key={`div-${activeId}`}
          code={code}
          pid={pid}
          nick={nick}
          uncertaintyId={activeId}
          labelA={active.poleA}
          labelB={active.poleB}
          submissions={results.submissions}
          disabled={closed}
          onChange={refresh}
        />
      )}

      <div className="mt-10 text-center text-[11px] text-muted">
        {view.participantCount} in the room · {results.submissionCount} ideas here
      </div>
    </main>
    <ReferenceDrawer
      uncertainties={scenarios.map((s) => ({
        id: s.id,
        title: s.label,
        domain: s.capabilityDomain,
        question: s.question,
      }))}
      drivers={drivers}
    />
    </>
  );
}

function NavBtn({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function JumpList({
  scenarios,
  activeId,
  onPick,
}: {
  scenarios: ScenarioLite[];
  activeId: string;
  onPick: (idx: number) => void;
}) {
  return (
    <div className="mt-3 max-h-[280px] overflow-y-auto border-t border-[var(--hairline)] pt-2">
      {scenarios.map((s, idx) => (
        <button
          key={s.id}
          onClick={() => onPick(idx)}
          className={
            "block w-full rounded-[2px] px-2 py-1.5 text-left text-[12.5px] leading-[1.25] " +
            (s.id === activeId ? "bg-lime font-bold" : "hover:bg-[rgba(36,36,34,0.05)]")
          }
        >
          <span className="text-muted">{s.workshopId}</span> {s.label}
        </button>
      ))}
    </div>
  );
}

function PoleLeanPoll({
  code,
  pid,
  uncertaintyId,
  labelA,
  labelB,
  disabled,
  onDone,
}: {
  code: string;
  pid: string;
  uncertaintyId: string;
  labelA: string;
  labelB: string;
  disabled: boolean;
  onDone: () => void;
}) {
  const { value: picked, save } = useLocalValue(`fpw:${code}:${uncertaintyId}:pole`);
  const [busy, setBusy] = useState(false);

  async function pick(v: Lean) {
    if (disabled || busy || v === picked) return;
    setBusy(true);
    save(v);
    try {
      await postResponse(code, {
        kind: "Poll answer",
        participantId: pid,
        scenarioUncertaintyId: uncertaintyId,
        pollKey: "pole-lean",
        value: v,
        label: `Pole lean · ${v}`,
      });
      onDone();
    } finally {
      setBusy(false);
    }
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
            disabled={disabled || busy}
            onClick={() => pick(o.v)}
            aria-pressed={picked === o.v}
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
      {picked && (
        <div className="mt-2 text-[11px] font-semibold text-muted">
          Recorded — tap another to change your answer.
        </div>
      )}
    </section>
  );
}

function DivergentSection({
  code,
  pid,
  nick,
  uncertaintyId,
  labelA,
  labelB,
  submissions,
  disabled,
  onChange,
}: {
  code: string;
  pid: string;
  nick: string;
  uncertaintyId: string;
  labelA: string;
  labelB: string;
  submissions: { id: string; text: string; author: string; lean: Lean | null; upvotes: number }[];
  disabled: boolean;
  onChange: () => void;
}) {
  const [text, setText] = useState("");
  const [lean, setLean] = useState<Lean | "">("");
  const [busy, setBusy] = useState(false);
  const {
    set: upvoted,
    add: addUpvote,
    remove: removeUpvoteLocal,
  } = useLocalSet(`fpw:${code}:${uncertaintyId}:upvotes`);

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
        scenarioUncertaintyId: uncertaintyId,
      });
      setText("");
      setLean("");
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function toggleUpvote(id: string) {
    if (disabled) return;
    if (upvoted.has(id)) {
      removeUpvoteLocal(id);
      await deleteUpvote(code, { participantId: pid, submissionId: id });
    } else {
      addUpvote(id);
      await postResponse(code, {
        kind: "Upvote submission",
        participantId: pid,
        scenarioUncertaintyId: uncertaintyId,
        submissionId: id,
        label: "Upvote",
      });
    }
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
              onClick={() => toggleUpvote(s.id)}
              disabled={disabled}
              aria-pressed={upvoted.has(s.id)}
              className={
                "flex flex-none flex-col items-center rounded-[2px] border px-2.5 py-1.5 text-[11px] font-bold transition-colors " +
                (upvoted.has(s.id)
                  ? "border-lime-deep bg-lime"
                  : "border-[var(--hairline)] hover:border-ink disabled:opacity-50")
              }
              aria-label={upvoted.has(s.id) ? "Remove upvote" : "Upvote"}
              title={upvoted.has(s.id) ? "Tap to remove your vote" : "Upvote"}
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
