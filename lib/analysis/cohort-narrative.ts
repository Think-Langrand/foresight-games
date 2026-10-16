import "server-only";

import OpenAI from "openai";
import { mapPool } from "./suggest";
import { GROUPING_GUIDANCE } from "./theme-guidance";
import type {
  CohortGroupInfo,
  CohortItem,
  CohortNarrative,
  CohortTheme,
} from "./cohort-cluster-shape";

// The prose half of a cohort run: a paragraph on each group's own implications, plus one
// across the whole cohort. Same shape as synthesis-summary.ts — one chat call per piece
// with a strict JSON schema, clamped in code, failures swallowed into null so a run still
// returns its grid when the writing fails.
//
// Why the per-group paragraphs read a group's RAW implications rather than the cohort
// themes: the question "what did this room actually say" has an answer that does not
// depend on how the pool happened to cluster, and a facilitator comparing six paragraphs
// wants six independent readings, not six restatements of the same theme list.
//
// The overall paragraph is the opposite: it reads the themes, the group tallies and
// nothing else, because what it is for is the plenary line — what the cohort found
// together and where one room stood alone.

const MODEL = "gpt-5";
const GROUP_WORDS = 120;
const OVERALL_WORDS = 200;
// A long group could otherwise push one prompt past anything useful. The implications are
// short sentences, so this is generous in practice.
const MAX_ITEMS_PER_GROUP = 80;

const GROUP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: {
      type: "string",
      description: `What this group's implications say about how the future is changing. At most ${GROUP_WORDS} words, plain prose, no bullet points, no preamble.`,
    },
  },
  required: ["text"],
} as const;

const OVERALL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: {
      type: "string",
      description: `What the cohort found together, and where a single group stood alone. At most ${OVERALL_WORDS} words, plain prose, no bullet points, no preamble.`,
    },
  },
  required: ["text"],
} as const;

async function oneParagraph(
  system: string,
  user: string,
  schema: typeof GROUP_SCHEMA | typeof OVERALL_SCHEMA,
  name: string,
  cap: number
): Promise<string | null> {
  try {
    const client = new OpenAI();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name, schema, strict: true },
      },
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      text?: string;
    };
    const text = (parsed.text ?? "").trim().slice(0, cap);
    return text || null;
  } catch (err) {
    console.error(`[cohortNarrative:${name}]`, err);
    return null;
  }
}

export async function writeCohortNarrative(args: {
  projectName: string;
  groups: CohortGroupInfo[];
  items: CohortItem[];
  themes: CohortTheme[];
}): Promise<CohortNarrative | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const contributing = args.groups.filter((g) => g.state === "ok");
  const nameOf = new Map(args.groups.map((g) => [g.id, g.name]));

  // --- a paragraph per group, from its own implications -----------------------
  const perGroupTexts = await mapPool(contributing, 3, async (g) => {
    const mine = args.items.filter((i) => i.groupId === g.id).slice(0, MAX_ITEMS_PER_GROUP);
    if (mine.length === 0) return null;
    const text = await oneParagraph(
      "You are a foresight facilitator summarising what ONE group found when it mapped the " +
        "implications of a future scenario. Write for the facilitator's report: say what this " +
        "group's material is about and what is changing in it. Do not list the implications " +
        "back, and do not recommend actions.\n\n" +
        GROUPING_GUIDANCE,
      `Project: ${args.projectName}\nGroup: ${g.name}` +
        (g.scenarioTitle ? `\nScenario: ${g.scenarioTitle}` : "") +
        `\n\nImplications:\n${mine.map((i) => `• ${i.text}`).join("\n")}`,
      GROUP_SCHEMA,
      "group_paragraph",
      GROUP_WORDS * 12
    );
    return text ? { groupId: g.id, text } : null;
  });

  // --- one paragraph across the cohort, from the themes -----------------------
  const themeDigest = args.themes
    .map((t, i) => {
      const rooms = t.byGroup
        .map((b) => `${nameOf.get(b.groupId) ?? b.groupId} (${b.count})`)
        .join(", ");
      return (
        `${i + 1}. ${t.label}\n   ${t.summary ?? ""}\n` +
        `   raised by ${t.groupCount} of ${contributing.length} groups: ${rooms}`
      );
    })
    .join("\n");

  const scenarios = [
    ...new Set(contributing.map((g) => g.scenarioTitle).filter((s): s is string => Boolean(s))),
  ];

  const overall = await oneParagraph(
    "You are a foresight facilitator writing the opening of a plenary session. Several " +
      "groups each mapped the implications of a future scenario, and their pooled " +
      "implications have been clustered into the themes below. Say what the cohort found " +
      "together, and name where a single group stood alone — an outlier is as useful as a " +
      "consensus. Use the group counts; do not invent agreement the counts do not show.\n\n" +
      GROUPING_GUIDANCE,
    `Project: ${args.projectName}\nGroups: ${contributing.map((g) => g.name).join(", ")}` +
      (scenarios.length > 1
        ? `\nThese groups worked from DIFFERENT scenarios: ${scenarios.join("; ")}. A theme ` +
          `several groups raised despite exploring different futures is a stronger finding; ` +
          `say so where it applies.`
        : scenarios.length === 1
          ? `\nScenario: ${scenarios[0]}`
          : "") +
      `\n\nThemes:\n${themeDigest}`,
    OVERALL_SCHEMA,
    "overall_paragraph",
    OVERALL_WORDS * 12
  );

  const perGroup = perGroupTexts.filter((p): p is { groupId: string; text: string } => Boolean(p));
  if (perGroup.length === 0 && !overall) return null;
  return { perGroup, overall: overall ?? "" };
}
