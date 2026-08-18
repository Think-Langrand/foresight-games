"use client";

// Client-side JSON export for a Ripples session. Self-contained (no server round
// trip), so it keeps working after the app is closed. Shared by the facilitator
// present view and solo play.

import {
  PHASE_PREFIXES,
  chipCountByCard,
  enumerateChains,
  longestChain,
  mostBranchedFirstOrder,
  mostChippedCards,
  type RipplesView,
} from "@/lib/ripples-types";

export function buildRipplesExport(view: RipplesView) {
  const { session, config, teams, players, cards, chips } = view;
  const chipCounts = chipCountByCard(chips);
  return {
    code: session.code,
    title: config.scenarioTitle,
    scenarioRef: config.scenarioRef,
    exportedAt: new Date().toISOString(),
    phase: session.phase,
    solo: config.solo,
    config,
    teams: teams.map((t) => {
      const tc = cards.filter((c) => c.teamId === t.id);
      const tch = chips.filter((c) => c.teamId === t.id);
      const longest = longestChain(tc);
      const topChipped = mostChippedCards(tc, tch, 1)[0];
      const branch = mostBranchedFirstOrder(tc);
      return {
        id: t.id,
        name: t.name,
        color: t.color,
        joinOrder: t.joinOrder,
        players: players
          .filter((p) => p.teamId === t.id)
          .map((p) => ({
            id: p.id,
            displayName: p.displayName,
            submittedAt: p.submittedAt,
            answers: config.questions.map((q, i) => ({ question: q, answer: p.answers[String(i)] ?? "" })),
          })),
        cards: tc.map((c) => ({
          id: c.id,
          order: c.order,
          parentId: c.parentId,
          prefix: PHASE_PREFIXES[c.order],
          text: c.text,
          authorPlayerId: c.authorPlayerId,
          flagged: c.flagged,
          greyed: c.greyed,
          chipTotal: chipCounts.get(c.id) ?? 0,
        })),
        chains: enumerateChains(cards, chips, t.id),
        highlights: {
          longestChain: longest?.chain.map((c) => c.text) ?? [],
          mostChipped: topChipped
            ? { text: topChipped.card.text, chipTotal: topChipped.chipTotal }
            : null,
          mostBranchedFirstOrder: branch
            ? { text: branch.card.text, branchCount: branch.branchCount }
            : null,
        },
      };
    }),
  };
}

export function downloadRipplesExport(view: RipplesView) {
  const payload = buildRipplesExport(view);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `implication-map-${view.session.code}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
