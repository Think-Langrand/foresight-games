"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import type { WorksheetSection } from "@/lib/exercise-types";
import type { CommitmentsBoard } from "@/lib/commitments-shape";
import { RESPONSES_FOR_DONE } from "@/lib/commitments-shape";
import { CardWall } from "@/components/workshop/synthesis/CardWall";
import { Directions, DIRECTIONS_FOLD } from "@/components/workshop/synthesis/Directions";
import { makePrefStore } from "@/components/workshop/synthesis/prefStore";
import type { AddResult } from "@/components/workshop/synthesis/SynthesisCard";
import { ConfirmModal } from "@/components/ConfirmModal";
import { AspirationRecap } from "@/components/workshop/commitments/AspirationRecap";
import { Week3Reference } from "@/components/workshop/commitments/Week3Reference";

// STEP 2 — strategic responses. One wall, filled as fast as the group can type: what could
// we actually do that moves us towards the aspiration? The aspiration sits above the wall
// and Session 3's risks and opportunities sit beside it, so responses are written against
// what the group already found rather than from memory.
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
  "Volume first. You are choosing three of these on the next step, so give yourselves something to choose between.",
  `Aim for more than ${RESPONSES_FOR_DONE}. A wall of three is a formality, not a choice.`,
  "A response can be uncomfortable. The next step is where you decide whether you mean it.",
];

export function ResponseBoard({
  board,
  sections,
  cards,
  week3Cards,
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
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
            // Step 3's picks, shown here too: a group that has already chosen should see
            // which cards are spoken for without changing tab.
            badgeFor={(c) => (c.shortlisted ? "★ a bold move" : null)}
          />
          <Directions
            title="Opening the option space"
            lines={RESPONSE_DIRECTIONS}
            fold={responseDirections}
          />
        </div>
        <Week3Reference cards={week3Cards} />
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
