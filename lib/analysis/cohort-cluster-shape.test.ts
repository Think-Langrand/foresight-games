import { describe, it, expect } from "vitest";
import {
  cohortWeeks,
  deriveCohortThemes,
  groupStateFor,
  buildGrid,
  type CohortGroupInfo,
} from "./cohort-cluster-shape";
import type { SuggestedTheme } from "./implication-cluster-shape";

const theme = (label: string, ...memberIds: string[]): SuggestedTheme => ({
  label,
  summary: `${label} summary`,
  memberIds,
  cohesion: null,
});

// itemId -> groupId
const owners = (m: Record<string, string>) => new Map(Object.entries(m));

const groupInfo = (
  id: string,
  state: CohortGroupInfo["state"],
  itemCount: number
): CohortGroupInfo => ({
  id,
  name: id.toUpperCase(),
  color: null,
  scenarioTitle: null,
  itemCount,
  state,
});

describe("cohortWeeks", () => {
  it("offers the week present in the most groups first", () => {
    const got = cohortWeeks([
      { groupId: "g1", exercises: [{ id: "e1", sort: 1, title: "Session 2" }] },
      { groupId: "g2", exercises: [{ id: "e2", sort: 1, title: "Session 2" }] },
      { groupId: "g3", exercises: [{ id: "e3", sort: 4, title: "Session 5" }] },
    ]);
    expect(got.map((w) => [w.sort, w.groupCount])).toEqual([
      [1, 2],
      [4, 1],
    ]);
  });

  it("keys a week on sort, not on title, so a group that renamed its week still joins", () => {
    const got = cohortWeeks([
      { groupId: "g1", exercises: [{ id: "e1", sort: 1, title: "Session 2" }] },
      { groupId: "g2", exercises: [{ id: "e2", sort: 1, title: "Session 2 — implications" }] },
    ]);
    expect(got).toHaveLength(1);
    expect(got[0].groupCount).toBe(2);
    // The title shown is the one the most groups use.
    expect(got[0].title).toBe("Session 2");
  });

  it("breaks a tie on group count by taking the earlier week", () => {
    const got = cohortWeeks([
      { groupId: "g1", exercises: [{ id: "a", sort: 5, title: "Late" }] },
      { groupId: "g2", exercises: [{ id: "b", sort: 2, title: "Early" }] },
    ]);
    expect(got.map((w) => w.sort)).toEqual([2, 5]);
  });

  it("counts a group once even when it holds two implications weeks at one sort", () => {
    const got = cohortWeeks([
      {
        groupId: "g1",
        exercises: [
          { id: "a", sort: 1, title: "Session 2" },
          { id: "b", sort: 1, title: "Session 2 redo" },
        ],
      },
    ]);
    expect(got[0].groupCount).toBe(1);
  });

  it("returns nothing for a cohort with no implications weeks at all", () => {
    expect(cohortWeeks([{ groupId: "g1", exercises: [] }])).toEqual([]);
  });
});

describe("deriveCohortThemes", () => {
  it("tallies which groups fed a theme, busiest group first", () => {
    const got = deriveCohortThemes(
      [theme("Power shifts", "a", "b", "c")],
      owners({ a: "g1", b: "g2", c: "g1" })
    );
    expect(got[0].byGroup).toEqual([
      { groupId: "g1", count: 2 },
      { groupId: "g2", count: 1 },
    ]);
    expect(got[0].groupCount).toBe(2);
  });

  it("counts an implication that sits in two themes in BOTH of them", () => {
    // clusterByEmbedding produces this via secondaryMemberships; it is intent, not error.
    const got = deriveCohortThemes(
      [theme("Legitimacy", "a", "b"), theme("Planning", "b", "c")],
      owners({ a: "g1", b: "g2", c: "g3" })
    );
    expect(got[0].groupCount).toBe(2);
    expect(got[1].groupCount).toBe(2);
    expect(got[1].byGroup).toEqual([
      { groupId: "g2", count: 1 },
      { groupId: "g3", count: 1 },
    ]);
  });

  it("marks a single-group theme as exactly that — the outlier is the finding", () => {
    const got = deriveCohortThemes([theme("Alone", "a", "b")], owners({ a: "g1", b: "g1" }));
    expect(got[0].groupCount).toBe(1);
    expect(got[0].byGroup).toEqual([{ groupId: "g1", count: 2 }]);
  });

  it("keeps the theme's own fields untouched", () => {
    const got = deriveCohortThemes([theme("Power", "a")], owners({ a: "g1" }));
    expect(got[0].label).toBe("Power");
    expect(got[0].summary).toBe("Power summary");
    expect(got[0].memberIds).toEqual(["a"]);
  });

  it("ignores a member it cannot attribute rather than inventing a group", () => {
    const got = deriveCohortThemes([theme("Power", "a", "ghost")], owners({ a: "g1" }));
    expect(got[0].byGroup).toEqual([{ groupId: "g1", count: 1 }]);
    expect(got[0].groupCount).toBe(1);
  });

  it("PROPERTY: the group tallies always re-add to the attributable members", () => {
    const groups = ["g1", "g2", "g3", "g4"];
    const owner = new Map<string, string>();
    for (let i = 0; i < 60; i++) owner.set(`i${i}`, groups[i % groups.length]);

    // A deterministic spread of themes, including overlaps and a single-group theme.
    const built: SuggestedTheme[] = [];
    for (let t = 0; t < 7; t++) {
      const ids: string[] = [];
      for (let i = t; i < 60; i += 3 + (t % 4)) ids.push(`i${i}`);
      built.push(theme(`T${t}`, ...ids));
    }

    for (const ct of deriveCohortThemes(built, owner)) {
      const tallied = ct.byGroup.reduce((n, b) => n + b.count, 0);
      expect(tallied).toBe(ct.memberIds.filter((id) => owner.has(id)).length);
      expect(ct.groupCount).toBe(ct.byGroup.length);
      expect(ct.byGroup.every((b) => groups.includes(b.groupId))).toBe(true);
      // No group listed twice, and never a zero row.
      expect(new Set(ct.byGroup.map((b) => b.groupId)).size).toBe(ct.byGroup.length);
      expect(ct.byGroup.every((b) => b.count > 0)).toBe(true);
    }
  });
});

describe("groupStateFor", () => {
  it("separates a group with no board at this week from one whose board is empty", () => {
    expect(groupStateFor({ hasWeek: false, itemCount: 0 })).toBe("missing");
    expect(groupStateFor({ hasWeek: true, itemCount: 0 })).toBe("empty");
    expect(groupStateFor({ hasWeek: true, itemCount: 12 })).toBe("ok");
  });
});

describe("buildGrid", () => {
  const groups = [groupInfo("g1", "ok", 10), groupInfo("g2", "ok", 8), groupInfo("g3", "missing", 0)];

  it("gives every theme a cell for every group, in the cohort's group order", () => {
    const themes = deriveCohortThemes([theme("T", "a", "b")], owners({ a: "g1", b: "g1" }));
    const grid = buildGrid(themes, groups);
    expect(grid).toHaveLength(1);
    expect(grid[0].cells.map((c) => c.groupId)).toEqual(["g1", "g2", "g3"]);
    expect(grid[0].cells.map((c) => c.count)).toEqual([2, 0, 0]);
  });

  it("distinguishes a group that said nothing here from one that was not in the run", () => {
    // The whole point: "g2 never raised this" must not look like "g3 had no board".
    const themes = deriveCohortThemes([theme("T", "a")], owners({ a: "g1" }));
    const [row] = buildGrid(themes, groups);
    expect(row.cells[1]).toEqual({ groupId: "g2", count: 0, state: "ok" });
    expect(row.cells[2]).toEqual({ groupId: "g3", count: 0, state: "missing" });
  });

  it("returns no rows for a run that found no themes", () => {
    expect(buildGrid([], groups)).toEqual([]);
  });
});
