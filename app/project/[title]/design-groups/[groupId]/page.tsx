import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/projects";
import { getSessionUser } from "@/lib/supabase-auth";
import { getDesignGroup } from "@/lib/design-groups";
import { listExercises } from "@/lib/design-group-exercises";
import { exerciseStatus } from "@/lib/exercise-types";

export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// A group's PROGRAM hub: the four weeks. Members open an unlocked, in-schedule week
// full-screen; a locked week is viewable read-only; a scheduled/placeholder week is
// not yet enterable (admins may preview scheduled weeks).
export default async function DesignGroupHubPage({
  params,
}: {
  params: Promise<{ title: string; groupId: string }>;
}) {
  const { title, groupId } = await params;
  const project = await getProjectBySlug(title);
  if (!project) notFound();
  const group = await getDesignGroup(groupId);
  if (!group || group.projectId !== project.id) notFound();

  const [exercises, isAdmin] = await Promise.all([
    listExercises(groupId),
    getSessionUser().then((u) => Boolean(u)),
  ]);
  const now = Date.now();

  return (
    <main className="mx-auto min-h-screen max-w-[900px] px-6 py-14">
      <Link href={`/project/${title}/design-groups`} className="eyebrow blue">
        ← Design Groups
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span
          className="inline-block h-6 w-6 shrink-0 rounded-[3px] border border-ink"
          style={{ background: group.color ?? "#ccc" }}
        />
        <h1 className="text-[32px] font-extrabold uppercase leading-[1.05] tracking-tight">{group.name}</h1>
      </div>
      {group.scenarioTitle && (
        <p className="mt-2 text-[15px] text-ink">
          <span className="text-muted">Scenario:</span>{" "}
          <span className="font-semibold">{group.scenarioTitle}</span>
          {group.scenarioSetId && group.scenarioRef && (
            <Link
              href={`/project/${title}/scenario-sets/${group.scenarioSetId}/${group.scenarioRef}`}
              className="ml-3 text-[12px] font-bold uppercase tracking-[0.06em] text-blue underline hover:text-ink"
            >
              View scenario →
            </Link>
          )}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3">
        {exercises.length === 0 && (
          <p className="rounded-[3px] border border-[var(--hairline)] bg-card px-4 py-6 text-[14px] text-muted">
            This program has no exercises yet.
          </p>
        )}
        {exercises.map((ex) => {
          const st = exerciseStatus(ex, now);
          const enterable = Boolean(
            ex.sessionCode && (st === "open" || st === "locked" || (st === "scheduled" && isAdmin))
          );
          const action =
            st === "placeholder"
              ? "Locked"
              : st === "scheduled" && !isAdmin
                ? ex.opensAt
                  ? `Opens ${fmtDate(ex.opensAt)}`
                  : "Not open yet"
                : enterable
                  ? st === "locked"
                    ? "View →"
                    : "Open →"
                  : "—";
          const body = (
            <>
              <span className="min-w-0 truncate text-[17px] font-extrabold uppercase tracking-tight text-white">
                {ex.title}
              </span>
              <span className="shrink-0 text-[13px] font-bold uppercase tracking-[0.06em] text-white">
                {action}
              </span>
            </>
          );
          const cls =
            "flex items-center justify-between gap-4 rounded-[3px] bg-blue px-5 py-4 text-white transition";
          return enterable ? (
            <Link
              key={ex.id}
              href={`/project/${title}/design-groups/${groupId}/${ex.id}`}
              className={cls + " hover:brightness-110"}
            >
              {body}
            </Link>
          ) : (
            // Not enterable yet → a faded-blue, non-interactive row (no lock overlay).
            <div key={ex.id} className={cls + " opacity-60"}>
              {body}
            </div>
          );
        })}
      </div>
    </main>
  );
}
