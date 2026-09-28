"use client";

import { isHopeFear, type SynthesisBoard } from "@/lib/synthesis-shape";

// STEP 3's prompt rail: the themes and the hopes & fears from step 2, read-only, so the
// group can generate risks and opportunities without flipping tabs. Zero writes, and no
// link back from a new idea to the fear that prompted it — ideas here are written fresh.

export function ReferenceRail({ board }: { board: SynthesisBoard }) {
  if (board.themes.length === 0) return null;

  return (
    <details className="rounded-[3px] border border-[var(--hairline)] bg-card px-4 py-3">
      <summary className="cursor-pointer text-[12px] font-bold uppercase tracking-[0.08em] text-muted">
        Your themes, hopes &amp; fears
      </summary>
      <div className="mt-3 flex flex-wrap gap-5">
        {board.themes.map((theme) => {
          // Flatten the theme's whole chain — at this point the group wants the raw
          // material, not the shape of it.
          const rows: { id: string; text: string; kind: "hope" | "fear"; depth: number }[] = [];
          const walk = (parentId: string, depth: number) => {
            for (const c of board.chains.get(parentId) ?? []) {
              if (!isHopeFear(c.cardKind)) continue;
              if (board.chainDepth.get(c.id) === undefined) continue;
              rows.push({ id: c.id, text: c.text, kind: c.cardKind, depth });
              walk(c.id, depth + 1);
            }
          };
          walk(theme.id, 0);

          return (
            <div key={theme.id} className="min-w-[16rem] flex-1">
              <h4 className="text-[12.5px] font-bold">{theme.text}</h4>
              {rows.length === 0 ? (
                <p className="mt-1 text-[11.5px] italic text-muted">No hopes or fears yet.</p>
              ) : (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {rows.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-start gap-1.5 text-[12px] leading-[1.4]"
                      style={{ paddingLeft: `${r.depth * 12}px` }}
                    >
                      <span
                        className={
                          "mt-[1px] shrink-0 rounded-[2px] px-1 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.06em] " +
                          (r.kind === "hope" ? "bg-lime text-ink" : "bg-coral text-white")
                        }
                      >
                        {r.kind}
                      </span>
                      <span className="min-w-0">{r.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}
