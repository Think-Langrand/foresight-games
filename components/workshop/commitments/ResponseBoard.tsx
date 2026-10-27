"use client";

import { useState } from "react";
import type { RippleCard } from "@/lib/ripples-types";
import type { Scenario } from "@/lib/foresight/types";
import type { CommitmentsBoard } from "@/lib/commitments-shape";
import { RESPONSES_FOR_DONE } from "@/lib/commitments-shape";
import { CardWall } from "@/components/workshop/synthesis/CardWall";
import { Directions, DIRECTIONS_FOLD } from "@/components/workshop/synthesis/Directions";
import { makePrefStore } from "@/components/workshop/synthesis/prefStore";
import type { AddResult } from "@/components/workshop/synthesis/SynthesisCard";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Week4Reference } from "@/components/workshop/commitments/Week4Reference";
import { StepIntro } from "@/components/workshop/commitments/StepIntro";
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
  "One move per card. Name who acts and what they do.",
  "For this step quantity is as good as quality. Step 6 asks for three moves, and you build them out of this wall.",
  `Aim for well more than ${RESPONSES_FOR_DONE}. You want enough here to combine two into something stronger.`,
  "Write the uncomfortable ones too. Nothing on this wall is a commitment.",
];

export function ResponseBoard({
  board,
  outcomes,
  priorities,
  week3Cards,
  week2Cards,
  scenario,
  editable,
  busy,
  onAdd,
  onEdit,
  onDelete,
}: {
  board: CommitmentsBoard;
  // Act 3's answers and act 2's starred picks, for the rail. This step writes responses
  // LINKED to both, so they are the thing to have beside the wall rather than a panel
  // above it that scrolls away the moment anyone starts typing.
  outcomes: string[];
  priorities: RippleCard[];
  week3Cards: RippleCard[];
  week2Cards?: RippleCard[];
  scenario?: Scenario | null;
  editable: boolean;
  busy: boolean;
  onAdd: (text: string) => AddResult;
  onEdit: (card: RippleCard, text: string) => void;
  onDelete: (card: RippleCard) => void;
}) {
  // The wall asks; this step confirms. A response may already carry milestones from step 4,
  // and deleting it takes them along, so the count has to be said out loud.
  const [pending, setPending] = useState<RippleCard | null>(null);
  const pendingMilestones = pending
    ? [...(board.milestones.get(pending.id)?.values() ?? [])].flat().length
    : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* WHAT THE STEP IS, in the same block every other step uses. The outcomes it says
          to link to are in the rail, not here: a panel of them above the wall was the
          first thing to scroll away once anyone started typing. */}
      <StepIntro n="04" title="Generate strategic responses">
        <p className="m-0">
          Create a range of strategic options linked to your top priorities and outcomes.
          Begin with individual idea generation, then share, collaborate, and discuss.
        </p>
      </StepIntro>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <CardWall
            tone="response"
            title="Strategic responses"
            cards={board.responses}
            editable={editable}
            busy={busy}
            tall
            slotQuestion="What could we do about any of this?"
            addLabel="One move. Who does what…"
            emptyHint="What would it take to get there?"
            onAdd={onAdd}
            onEdit={onEdit}
            onRequestDelete={setPending}
            // NO badgeFor. `shortlisted` is dormant data from the parked down-select, and a
            // star here would mark a choice this week no longer asks anyone to make — on
            // boards worked under the old shape it would light cards at random.
          />
          <Directions
            title="Filling the wall"
            lines={RESPONSE_DIRECTIONS}
            fold={responseDirections}
          />
        </div>
        {/* THIS STEP'S OWN MATERIAL ON TOP, open, then the earlier sessions' underneath
            and closed. The responses are written toward the outcomes and the priorities;
            Week 3's walls are where those came from and are one click away. */}
        <div className="flex flex-col gap-4">
          <Week4Reference outcomes={outcomes} priorities={priorities} />
          <Week3Reference
            cards={week3Cards}
            week2Cards={week2Cards}
            scenario={scenario}
            variant="collapsed"
          />
        </div>
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
