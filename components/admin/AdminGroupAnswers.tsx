"use client";

import Link from "next/link";
import { csvCell, download } from "@/components/admin/exportUtils";

// Read-only admin view of every question & answer across a design group's worksheet
// weeks, with JSON/CSV export. Data is shaped server-side (see the answers page) so this
// component just renders and serializes.

export interface AnswerRow {
  text: string;
  author: string;
  createdAt: string;
}
export interface QuestionBlock {
  key: string;
  label: string;
  kind: "brainstorm" | "question";
  removed?: boolean; // answers exist under a section key no longer in the spec
  answers: AnswerRow[];
}
export interface ExerciseAnswers {
  exerciseId: string;
  title: string;
  questions: QuestionBlock[];
}
export interface GroupAnswersData {
  groupName: string;
  scenarioTitle: string | null;
  exercises: ExerciseAnswers[];
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "group";
}

export function AdminGroupAnswers({ data, backHref }: { data: GroupAnswersData; backHref: string }) {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `answers-${slugify(data.groupName)}-${stamp}`;

  const exportJson = () => {
    download(JSON.stringify(data, null, 2), `${base}.json`, "application/json");
  };

  const exportCsv = () => {
    const header = ["Week", "Question", "Kind", "Answer", "Author", "Created"];
    const lines = [header.map(csvCell).join(",")];
    for (const ex of data.exercises) {
      for (const q of ex.questions) {
        for (const a of q.answers) {
          lines.push(
            [ex.title, q.label || q.key, q.kind, a.text, a.author, a.createdAt].map(csvCell).join(",")
          );
        }
      }
    }
    download("﻿" + lines.join("\r\n"), `${base}.csv`, "text/csv;charset=utf-8;");
  };

  const totalAnswers = data.exercises.reduce(
    (n, ex) => n + ex.questions.reduce((m, q) => m + q.answers.length, 0),
    0
  );

  return (
    <main className="mx-auto min-h-screen max-w-[900px] px-5 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-3">
        <div className="min-w-0">
          <Link href={backHref} className="eyebrow blue">
            ← Project admin
          </Link>
          <h1 className="mt-1 text-[24px] font-extrabold uppercase leading-[1.05] tracking-tight">
            {data.groupName} — Answers
          </h1>
          {data.scenarioTitle && <p className="mt-0.5 text-[13px] text-muted">{data.scenarioTitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportJson}
            disabled={totalAnswers === 0}
            className="rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime disabled:opacity-40"
          >
            ↓ JSON
          </button>
          <button
            onClick={exportCsv}
            disabled={totalAnswers === 0}
            className="rounded-[2px] border border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] hover:bg-lime disabled:opacity-40"
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {data.exercises.length === 0 && (
        <p className="text-[14px] italic text-muted">This group has no worksheet weeks yet.</p>
      )}

      <div className="flex flex-col gap-8">
        {data.exercises.map((ex) => (
          <section key={ex.exerciseId}>
            <h2 className="mb-3 border-b border-[var(--rule)] pb-1 text-[15px] font-extrabold uppercase tracking-tight">
              {ex.title}
            </h2>
            <div className="flex flex-col gap-5">
              {ex.questions.map((q) => (
                <div key={q.key}>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-bold">{q.label || q.key}</h3>
                    <span className="rounded-[2px] bg-[var(--hairline)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-muted">
                      {q.kind}
                    </span>
                    {q.removed && (
                      <span className="rounded-[2px] bg-coral px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-white">
                        removed question
                      </span>
                    )}
                  </div>
                  {q.answers.length === 0 ? (
                    <p className="mt-1 text-[13px] italic text-muted">No answers.</p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {q.answers.map((a, i) => (
                        <li
                          key={i}
                          className="rounded-[2px] border border-[var(--hairline)] bg-paper px-3 py-2 text-[13.5px] leading-[1.4]"
                        >
                          {a.text}
                          {a.author && (
                            <span className="ml-2 text-[10px] uppercase tracking-[0.06em] text-muted">— {a.author}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {ex.questions.length === 0 && (
                <p className="text-[13px] italic text-muted">No questions defined for this week.</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
