"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import type { WorksheetSection } from "@/lib/exercise-types";
import type { Scenario } from "@/lib/foresight/types";
import type { CommitmentsBoard } from "@/lib/commitments-shape";
import { RESPONSES_FOR_DONE } from "@/lib/commitments-shape";
import { CardWall } from "@/components/workshop/synthesis/CardWall";
import { Directions, DIRECTIONS_FOLD } from "@/components/workshop/synthesis/Directions";
import { makePrefStore } from "@/components/workshop/synthesis/prefStore";
import type { AddResult } from "@/components/workshop/synthesis/SynthesisCard";
import { ConfirmModal } from "@/components/ConfirmModal";
import { AspirationRecap } from "@/components/workshop/commitments/AspirationRecap";
import { Week3Reference } from "@/components/workshop/commitments/Week3Reference";

// STEP 3 — strategic responses. One wall, filled as fast as the group can type: what could
// we actually do about any of this? Step 1's reading of the world sits above the wall and
// Session 3's risks and opportunities sit beside it, so responses are written against what
// the group already found rather than from memory.
//
// NOTHING ON THIS WALL IS CHOSEN. Step 4 does not pick three of these; it asks the group to
// write three bold moves with this wall as raw material, which is why there is no star here
// and no counter. The old down-select is parked (see MovesBoard).
//
// NO TAGGING. A response points at nothing: no theme, no risk, no opportunity. Session 3
// is the evidence for that decision — every optional field on that board came back empty
// in all four groups, so a required tag would stall the wall and an optional one would go
// unused. The reference material is next to the wall instead of linked from it.

// Its own fold key: putting away how this step works should not put away another step's.
const responseDirections = makePrefStore(
  "commitments.directions.responses",
  "open",
  DIRECTIONS_FOLD
);

const RESPONSE_DIRECTIONS = [
  "One move per card. Say what someone would do, not what should be true.",
  "Volume first. The next step asks for three bold moves and this wall is what you build them from, so give yourselves material.",
  `Aim for more than ${RESPONSES_FOR_DONE}. A wall of three leaves you nothing to combine.`,
  "A response can be uncomfortable. Nothing here commits you to it.",
];

export function ResponseBoard({
  board,
  sections,
  cards,
  week3Cards,
  scenario,
  editable,
  busy,
  onAdd,
  onEdit,
  onDelete,
  onGoToAspiration,
}: {
  board: CommitmentsBoard;
  sections: WorksheetSection[];
  cards: RippleCard[];
  week3Cards: RippleCard[];
  scenario?: Scenario | null;
  editable: boolean;
  busy: boolean;
  onAdd: (text: string) => AddResult;
  onEdit: (card: RippleCard, text: string) => void;
  onDelete: (card: RippleCard) => void;
  onGoToAspiration: () => void;
}) {
  // The wall asks; this step confirms. A response may already carry milestones from step 4,
  // and deleting it takes them along, so the count has to be said out loud.
  const [pending, setPending] = useState<RippleCard | null>(null);
  const pendingMilestones = pending
    ? [...(board.milestones.get(pending.id)?.values() ?? [])].flat().length
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <AspirationRecap
        sections={sections}
        cards={cards}
        onGoToAspiration={onGoToAspiration}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <CardWall
            tone="response"
            title="Strategic responses"
            cards={board.responses}
            editable={editable}
            busy={busy}
            tall
            slotQuestion="What could we do that moves us towards this?"
            addLabel="One move, said as something someone does…"
            emptyHint="What would it take to get there?"
            onAdd={onAdd}
            onEdit={onEdit}
            onRequestDelete={setPending}
            // NO badgeFor. `shortlisted` is dormant data from the parked down-select, and a
            // star here would mark a choice this week no longer asks anyone to make — on
            // boards worked under the old shape it would light cards at random.
          />
          <Directions
            title="Opening the option space"
            lines={RESPONSE_DIRECTIONS}
            fold={responseDirections}
          />
        </div>
        <Week3Reference cards={week3Cards} scenario={scenario} />
      </div>

      <ConfirmModal
        open={pending !== null}
        title="Delete this response?"
        message={
          <>
            <span className="block">{pending?.text}</span>
            {pendingMilestones > 0 && (
              <span className="mt-2 block font-bold">
                This takes {pendingMilestones} milestone
                {pendingMilestones === 1 ? "" : "s"} from the timeline with it.
              </span>
            )}
          </>
        }
        busy={busy}
        onConfirm={() => {
          if (pending) onDelete(pending);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
