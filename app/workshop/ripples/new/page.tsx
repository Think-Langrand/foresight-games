import { notFound } from "next/navigation";

// Facilitator entry for implication mapping is gated to per-project sites for now —
// the global site must not expose Foresight scenarios to old clients "in any way".
// Kept as a stub (easy to re-enable); the live version runs at
// /project/[title]/workshop/ripples/new.
export default function NewRipplesPage() {
  notFound();
}
