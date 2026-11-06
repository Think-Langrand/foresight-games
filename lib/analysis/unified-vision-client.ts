// Browser-side call to the unified-vision route. The request shape and the error wording
// live here so the panel carries neither. The route re-checks the session server-side.

import { readKeepaliveJson } from "@/lib/keepalive-stream";
import type { UnifiedVision } from "./unified-vision-shape";

export interface UnifiedVisionRequest {
  criteria?: string;
  // Replaces the whole system prompt. Omitted means the default.
  promptOverride?: string;
  weekSort?: number;
  groupIds?: string[];
}

// Read through the keepalive reader: the route streams, pinging so the connection is never
// idle long enough for Render to close it.
export async function draftVision(
  projectId: string,
  body: UnifiedVisionRequest
): Promise<UnifiedVision> {
  return readKeepaliveJson(
    await fetch(`/api/admin/projects/${projectId}/unified-vision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    "Drafting a vision failed"
  );
}
