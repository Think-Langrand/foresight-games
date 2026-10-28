"use client";

import { Eyebrow } from "@/components/workshop/commitments/StarterQuestions";
import { makeSetPrefStore, useSetPref, type SetPrefStore } from "@/components/workshop/synthesis/prefStore";

// "Check before moving on": the activity's own test of whether it is done, as boxes the
// group ticks while it talks.
//
// LOCAL TO THIS BROWSER, like the Directions folds. A tick is a self-check, not a finding,
// so it is not stored on the board, not shared with the rest of the group and gates
// nothing: the handoff's readiness reads the work, not the ticks.
const stores = new Map<string, SetPrefStore>();
function storeFor(key: string): SetPrefStore {
  let s = stores.get(key);
  if (!s) {
    s = makeSetPrefStore(`commitments.check.${key}`, 50);
    stores.set(key, s);
  }
  return s;
}

export function Checklist({
  storeKey,
  title = "Check before moving on",
  items,
}: {
  // One store per activity, so ticking 1.2's boxes does not tick 2.1's.
  storeKey: string;
  title?: string;
  items: readonly string[];
}) {
  const store = storeFor(storeKey);
  const ticked = useSetPref(store);
  if (items.length === 0) return null;
  return (
    <section
      className="rounded-[3px] border border-[var(--hairline)] px-5 py-4"
      style={{ background: "var(--board)" }}
    >
      <Eyebrow>{title}</Eyebrow>
      <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
        {items.map((item, i) => {
          const id = String(i);
          const on = ticked.has(id);
          return (
            <li key={item}>
              <label className="flex cursor-pointer items-start gap-2.5 text-[14px] leading-[1.45]">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => (on ? store.remove(id) : store.add(id))}
                  className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--blue)]"
                />
                <span>{item}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
