// Per-project home configuration — the small, framework-free contract shared by
// the admin editor (components/admin/AdminProjectsManager.tsx), the read layer
// (lib/projects.ts), and the renderer (components/project/ProjectHome.tsx).
//
// A project's `home_config` decides which entry items appear on its home page
// and in what order. Order is the array order; visibility is the `visible` flag.
// The visual definition of each item (copy, image, href) lives in ProjectHome;
// this file only knows the item KEYS + labels so it stays safe to import from a
// client component (no `next/image` / server-only deps).

export type HomeItemKey =
  | "scenario-sets"
  | "play"
  | "ripples"
  | "design-groups"
  | "gallery"
  | "drivers"
  | "uncertainties"
  | "join";

export interface HomeItem {
  key: HomeItemKey;
  visible: boolean;
}

// The scenario reader's "page 2" (what-it-means) sections a project can turn off.
// Keys match the deep-section keys in lib/foresight/deep-sections.ts.
export type ScenarioSectionKey = "makes-possible" | "blind-spot" | "why-arrives";

export const SCENARIO_PAGE2_SECTIONS: { key: ScenarioSectionKey; label: string }[] = [
  { key: "makes-possible", label: "What this world makes possible" },
  { key: "blind-spot", label: "Structural blind spot" },
  { key: "why-arrives", label: "Why this future arrives" },
];

export interface HomeConfig {
  items: HomeItem[];
  // Page-2 scenario sections this project hides (default: none hidden).
  hiddenScenarioSections: ScenarioSectionKey[];
  // The scenario set the home "Scenarios" card opens directly. null = auto (use the
  // first set the platform returns).
  defaultScenarioSetId: string | null;
}

// The canonical set of items, in their default display order. Adding a new home
// item is just a new entry here (plus a card definition in ProjectHome).
export const PROJECT_HOME_ITEMS: { key: HomeItemKey; label: string }[] = [
  { key: "scenario-sets", label: "Scenarios" },
  { key: "play", label: "Play the card game" },
  { key: "ripples", label: "Implication mapping" },
  { key: "design-groups", label: "Design Groups" },
  { key: "gallery", label: "Gallery" },
  { key: "drivers", label: "Drivers" },
  { key: "uncertainties", label: "Uncertainties" },
  { key: "join", label: "Join a table" },
];

const KNOWN_KEYS = new Set<HomeItemKey>(PROJECT_HOME_ITEMS.map((i) => i.key));
const KNOWN_SECTION_KEYS = new Set<ScenarioSectionKey>(
  SCENARIO_PAGE2_SECTIONS.map((s) => s.key)
);

// A brand-new project shows everything, in the default order.
export function defaultHomeConfig(): HomeConfig {
  return {
    items: PROJECT_HOME_ITEMS.map((i) => ({ key: i.key, visible: true })),
    hiddenScenarioSections: [],
    defaultScenarioSetId: null,
  };
}

// Coerce whatever is stored in the `home_config` jsonb into a well-formed config:
// keep recognized items in their stored order, drop unknowns/dupes, then append
// any known items that weren't stored (default visible) so the admin always sees
// the full set and the home renders deterministically even after we add items.
export function normalizeHomeConfig(raw: unknown): HomeConfig {
  const rawItems =
    raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)
      ? ((raw as { items: unknown[] }).items)
      : [];

  const seen = new Set<HomeItemKey>();
  const items: HomeItem[] = [];
  for (const entry of rawItems) {
    if (!entry || typeof entry !== "object") continue;
    const key = (entry as { key?: unknown }).key;
    if (typeof key !== "string" || !KNOWN_KEYS.has(key as HomeItemKey)) continue;
    const k = key as HomeItemKey;
    if (seen.has(k)) continue;
    seen.add(k);
    items.push({ key: k, visible: (entry as { visible?: unknown }).visible !== false });
  }
  for (const { key } of PROJECT_HOME_ITEMS) {
    if (!seen.has(key)) items.push({ key, visible: true });
  }

  const rawHidden = (raw as { hiddenScenarioSections?: unknown } | null)?.hiddenScenarioSections;
  const hiddenScenarioSections = Array.isArray(rawHidden)
    ? [
        ...new Set(
          rawHidden.filter(
            (k): k is ScenarioSectionKey =>
              typeof k === "string" && KNOWN_SECTION_KEYS.has(k as ScenarioSectionKey)
          )
        ),
      ]
    : [];

  const rawDefaultSet = (raw as { defaultScenarioSetId?: unknown } | null)?.defaultScenarioSetId;
  const defaultScenarioSetId =
    typeof rawDefaultSet === "string" && rawDefaultSet.trim() ? rawDefaultSet.trim() : null;

  return { items, hiddenScenarioSections, defaultScenarioSetId };
}
