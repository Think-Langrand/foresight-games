import Link from "next/link";
import { listAllTeams } from "@/lib/teams";
import { getDeck } from "@/lib/cards";
import { teamTriadIds, type Card } from "@/lib/workshop-types";

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
            Scenario Molecules
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
          {teams.map((t) => {
            const triad = teamTriadIds(t)
              .map((id) => byId.get(id))
              .filter((c): c is Card => Boolean(c));
            return (
              <Link
                key={t.id}
                href={`/scenario-molecules/${t.id}`}
                className="group flex flex-col rounded-[3px] border border-[var(--hairline)] bg-card p-4 transition-shadow hover:border-ink hover:shadow-[0_2px_0_var(--ink)]"
                style={{ borderTop: `4px solid ${t.color}` }}
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-[2px] border border-ink"
                    style={{ background: t.color }}
                  />
                  <span className="text-[13px] font-extrabold">{t.name || "Team"}</span>
                </span>

                {t.worldTitle ? (
                  <div className="mt-3 text-[18px] font-extrabold uppercase leading-[1.1] tracking-tight">
                    {t.worldTitle}
                  </div>
                ) : (
                  <div className="mt-3 text-[13px] italic text-muted">Untitled world</div>
                )}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {triad.map((c) => (
                    <span
                      key={c.id}
                      className="rounded-[2px] border border-[var(--hairline)] bg-paper px-2 py-1 text-[10.5px] font-semibold"
                      style={{ borderLeft: `3px solid ${roleHex(c.role)}` }}
                    >
                      {c.title}
                    </span>
                  ))}
                </div>

                {t.convergence && (
                  <p className="serif mt-3 line-clamp-3 text-[13px] italic leading-[1.4] text-muted">
                    {t.convergence}
                  </p>
                )}

                <span className="mt-4 text-[11px] font-bold uppercase tracking-[0.06em] text-blue group-hover:underline">
                  View world →
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
