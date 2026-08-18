import type { CardOrder } from "@/lib/ripples-types";

// Card colour by order — echoes the paper game (white/yellow/red) in the deck's
// own palette: first = lime, second = blue, terminal = amber. Used to tint the
// implication-tree node borders.
export function rippleRoleColor(order: CardOrder): string {
  return order === "FIRST"
    ? "var(--lime-deep)"
    : order === "SECOND"
      ? "var(--blue)"
      : "var(--amber)";
}
