import { notFound } from "next/navigation";

// Implication mapping is gated to per-project sites for now — the global site must
// not expose Foresight scenarios to old clients "in any way". This route is kept as
// a stub (easy to re-enable) while the live version runs at
// /project/[title]/play/ripples.
export default function PlayRipplesPage() {
  notFound();
}
