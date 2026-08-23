"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParticipant, postRipplePlayer } from "./hooks";
import type { RipplesView } from "@/lib/ripples-types";

// Which player (if any) this device is on a given board — persisted per session/device.
export function useJoinedPlayer(code: string) {
  const key = `fpw:${code}:player`;
  const [playerId, setPlayerId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setPlayerId(localStorage.getItem(key));
    } catch {
      setPlayerId(null);
    }
  }, [key]);
  const join = useCallback(
    (id: string) => {
      setPlayerId(id);
      try {
        localStorage.setItem(key, id);
      } catch {
        /* ignore */
      }
    },
    [key]
  );
  return { playerId, join };
}

// Shared-board membership for the no-lobby modes. Solo silently creates this device's
// own board; a shared board (design-group exercise) auto-joins the ONE pre-seeded team
// by id — no picker — so everyone edits the same map. Regular group mode (neither flag)
// returns without auto-joining; the caller renders a JoinPanel and calls join() itself.
export function useSharedBoardMembership(
  code: string,
  view: RipplesView | null | undefined,
  refresh: () => void
) {
  const { pid, nick, saveNick } = useParticipant();
  const { playerId, join } = useJoinedPlayer(code);
  const autoJoined = useRef(false);

  useEffect(() => {
    if (!view || playerId || autoJoined.current || !pid) return;
    const shared = view.config.sharedTeam;
    if (!view.config.solo && !shared) return;
    if (shared && view.teams.length === 0) return; // wait for the seeded board to load
    autoJoined.current = true;
    const body = shared
      ? { participantId: pid, displayName: nick || "You", teamId: view.teams[0].id }
      : { participantId: pid, displayName: nick || "You", teamName: "My map" };
    postRipplePlayer(code, body)
      .then((res) => {
        join(res.player.id);
        // Pull the freshly-created board/player straight away — don't wait on a
        // realtime event (which can be missed at mount), or the screen hangs.
        refresh();
      })
      .catch(() => {
        autoJoined.current = false;
      });
  }, [view, playerId, pid, nick, code, join, refresh]);

  return { pid, nick, saveNick, playerId, join };
}
