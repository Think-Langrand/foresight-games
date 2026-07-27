import Link from "next/link";
import { listAllTeams } from "@/lib/teams";
import { getDeck } from "@/lib/cards";
import { teamTriadIds, type Card } from "@/lib/workshop-types";
import { CardArtBand } from "@/components/workshop/CardArt";
import { artFor } from "@/lib/card-art";

export const dynamic = "force-dynamic";

// Role → accent hex, mirrors roleHex() in CardArt (kept local so this server
// component doesn't import from the "use client" CardArt module).
function roleHex(role: Card["role"]): string {
  return role === "Wildcard" ? "#ff644e" : role === "Edge" ? "#b9860b" : "#a6e84b";
}

export default async function ScenarioMoleculesPage() {
  const [teams, { deck }] = await Promise.all([
    listAllTeams({ onlySubmitted: true }),
    getDeck(),
  ]);
  const byId = new Map(deck.cards.map((c) => [c.id, c]));

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-6 py-12 md:py-16">
      <Link href="/" className="eyebrow blue">
        ← Home
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule)] pb-5">
        <div>
          <span className="eyebrow ink">Built in the room</span>
          <h1 className="mt-2 text-[34px] font-extrabold uppercase leading-[1.03] tracking-tight md:text-[44px]">
            Scenario-blocks
          </h1>
        </div>
        <span className="text-[12px] text-muted">{teams.length} worlds</span>
      </div>
      <p className="serif mt-4 max-w-[720px] text-[19px] leading-[1.35] text-ink">
        Every future scenario teams have built by combining outcome cards — the drivers and
        uncertainties bound together into a small world.
      </p>

      {teams.length === 0 ? (
        <p className="mt-12 text-[15px] text-muted">
          No finished scenarios yet. Play a card game and submit a world to see it here.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t, i) => {
            const triad = teamTriadIds(t)
              .map((id) => byId.get(id))
              .filter((c): c is Card => Boolean(c));
            // Full-card colour comes from the world's dominant dimension.
            const artDimension = triad[0]?.dimension;
            const hue = artDimension ? artFor(artDimension).hue : t.color;
            return (
              <Link
                key={t.id}
                href={`/scenario-molecules/${t.id}`}
                className="group relative flex min-h-[360px] flex-col overflow-hidden rounded-[4px] transition-transform hover:-translate-y-0.5"
                style={{ background: hue }}
              >
                {/* The dimension's motif as a cover band (native aspect so every
                    motif shows), drawn in white and faded into the colour below. */}
                {artDimension && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-[196px]">
                    <CardArtBand
                      dimension={artDimension}
                      height="100%"
                      className="h-full"
                      strokeColor="rgba(255,255,255,0.62)"
                      bg="transparent"
                    />
                    <div
                      className="absolute inset-0"
                      style={{ background: `linear-gradient(180deg, ${hue}00 40%, ${hue} 100%)` }}
                    />
                  </div>
                )}
                {/* Soft white wash to lighten the colour a touch. */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ background: "rgba(255,255,255,0.11)" }}
                />
                {/* Darkening veil so white type stays legible on any hue. */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(12,12,16,0.06) 0%, rgba(12,12,16,0.24) 52%, rgba(12,12,16,0.68) 100%)",
                  }}
                />

                <div className="relative flex grow flex-col p-5">
                  {/* Masthead — issue number. */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/85">
                      Futures · Nº {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>

                  {/* Headline. */}
                  {t.worldTitle && (
                    <h3 className="mt-5 line-clamp-3 text-[27px] font-extrabold uppercase leading-[0.98] tracking-tight text-white">
                      {t.worldTitle}
                    </h3>
                  )}

                  {/* The scenario sentence, as a serif pull-quote. */}
                  {t.convergence && (
                    <p className="serif mt-4 line-clamp-3 text-[19px] italic leading-[1.3] text-white/85">
                      {t.convergence}
                    </p>
                  )}

                  {/* Cover lines: the outcome cards, ticked in their type colour. */}
                  <div className="mt-auto flex flex-col gap-1.5 pt-6">
                    {triad.map((c) => (
                      <div key={c.id} className="flex items-center gap-2.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-[1px] ring-1 ring-white/40"
                          style={{ background: roleHex(c.role) }}
                        />
                        <span className="truncate text-[12.5px] font-semibold leading-tight text-white/90">
                          {c.title}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-white/20 pt-3">
                    <span
                      className="inline-block h-3 w-3 rounded-[2px] ring-1 ring-white/50"
                      style={{ background: t.color }}
                    />
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-white group-hover:underline">
                      View world →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
