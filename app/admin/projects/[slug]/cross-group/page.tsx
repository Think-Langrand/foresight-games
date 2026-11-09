import { Suspense } from "react";
import { notFound } from "next/navigation";
import { supabaseConfigured } from "@/lib/workshop";
import { getProjectBySlugAny } from "@/lib/projects";
import { buildProjectExport } from "@/lib/cohort-export";
import {
  columnsFor,
  crossGroupWarnings,
  listCrossGroupFields,
  notShownCounts,
  type CrossGroupColumn,
  type CrossGroupField,
} from "@/lib/cross-group-shape";
import {
  buildUncertaintyGrid,
  type UncertaintyGrid,
} from "@/lib/cross-group-uncertainties-shape";
import {
  describeForesightFailure,
  foresightConfigured,
  getForesightUncertainties,
  getScenario,
} from "@/lib/foresight/client";
import type { Scenario } from "@/lib/foresight/types";
import { CrossGroupBoard, UNCERTAINTIES_FIELD_ID } from "@/components/admin/CrossGroupBoard";

export const dynamic = "force-dynamic";
// One board read per (group x board-backed week) — 16 for a four-group, four-week project.
// The sibling export route carries the same note: a dozen-odd board reads is well inside any
// limit, and unlike the project dashboard this page is opened deliberately. Render cost grows
// linearly with groups x weeks.
export const maxDuration = 300;

// Admin: every design group's answers to ONE field, side by side.
//
// The proxy gates /admin, so there is no separate session check here — same as the sibling
// cohort-analysis and group-answers pages.
//
// EVERY FIELD'S COLUMNS ARE COMPUTED HERE, ONCE, AND HANDED TO THE CLIENT. The Next guide's
// rule for search params is to use `useSearchParams` when they only filter a list already
// loaded via props, which is exactly this: switching chips re-reads nothing. The alternative
// — resolving the chip server-side — would re-pay all 16 board reads on every click, seconds
// of wait to show data the browser already had. The cells are a fraction of the raw export,
// which carries whole RippleCard rows, canvases and rosters this board never renders.
export default async function CrossGroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!supabaseConfigured()) notFound();

  const project = await getProjectBySlugAny(slug);
  if (!project) notFound();

  const payload = await buildProjectExport({
    id: project.id,
    slug: project.slug,
    name: project.name,
  });

  const fields = listCrossGroupFields(payload);
  const columns: Record<string, CrossGroupColumn[]> = {};
  for (const f of fields) columns[f.id] = columnsFor(payload, f.id);

  // The uncertainty grid comes from the platform, not from a board, so it is loaded
  // separately and is allowed to fail on its own: a Carmelita outage must cost this page its
  // uncertainty chip and nothing else.
  let grid: UncertaintyGrid | null = null;
  let gridReason: string | null = null;
  if (!foresightConfigured()) {
    gridReason = "The foresight platform is not configured for this environment.";
  } else if (!project.carmelitaProjectRef) {
    // Told apart from the line above on purpose: collapsing them sends an admin to check env
    // vars when the platform is fine and it is this project's record that is empty. The two
    // fixes are in different places.
    gridReason = `This project has no Carmelita reference set, so its scenarios cannot be looked up. Set one on the project record.`;
  } else {
    try {
      const ref = project.carmelitaProjectRef;
      const [catalogue, scenarios] = await Promise.all([
        getForesightUncertainties(ref),
        Promise.all(
          payload.groups.map(async (g) => ({
            groupId: g.groupId,
            scenario: g.scenarioRef ? await getScenario(g.scenarioRef, ref) : null,
          }))
        ),
      ]);
      grid = buildUncertaintyGrid({ catalogue, scenarios: scenarios as { groupId: string; scenario: Scenario | null }[] });
    } catch (err) {
      gridReason = describeForesightFailure(err);
    }
  }

  // Prepended rather than returned by listCrossGroupFields: every other chip is read off a
  // board, and this one is not.
  //
  // THE CHIP IS ALWAYS OFFERED, EVEN WHEN THE GRID FAILED TO LOAD. An earlier version hid it
  // on failure, which meant a Carmelita outage removed a whole field from the page with
  // nothing to say it had ever been there — "looking finished while a field is missing",
  // which is the failure this board is least allowed to commit. Now the chip stays and the
  // panel explains itself.
  const uncertaintyField: CrossGroupField | null =
    payload.groups.length === 0
      ? null
      : {
          id: UNCERTAINTIES_FIELD_ID,
          fieldKey: "uncertainties",
          label: "Uncertainties",
          weekSort: null,
          weekTitle: null,
          tier: "primary",
          counts: Object.fromEntries(
            payload.groups.map((g) => [
              g.groupId,
              grid ? grid.rows.filter((r) => r.cells[g.groupId]?.resolution !== null).length : 0,
            ])
          ),
        };

  return (
    <Suspense>
      <CrossGroupBoard
        slug={slug}
        projectName={project.name}
        exportedAt={payload.exportedAt}
        fields={uncertaintyField ? [uncertaintyField, ...fields] : fields}
        columns={columns}
        groups={payload.groups.map((g) => ({
          groupId: g.groupId,
          groupName: g.groupName,
          color: g.color,
          scenarioTitle: g.scenarioTitle,
        }))}
        grid={grid}
        gridReason={gridReason}
        warnings={crossGroupWarnings(payload)}
        notShown={notShownCounts(payload)}
      />
    </Suspense>
  );
}
