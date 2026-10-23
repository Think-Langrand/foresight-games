import { describe, expect, it } from "vitest";
import { defaultHomeConfig, normalizeHomeConfig } from "@/lib/project-home";

describe("handoffVisible", () => {
  it("is off for a brand-new project, so the handoff stays hidden until it is turned on", () => {
    expect(defaultHomeConfig().handoffVisible).toBe(false);
  });

  it("is off for a config stored before the flag existed", () => {
    expect(normalizeHomeConfig({ items: [{ key: "design-groups", visible: true }] }).handoffVisible).toBe(
      false
    );
  });

  it("round-trips true once an admin turns it on", () => {
    expect(normalizeHomeConfig({ handoffVisible: true }).handoffVisible).toBe(true);
  });

  it("treats a non-boolean as off rather than truthy", () => {
    expect(normalizeHomeConfig({ handoffVisible: "yes" }).handoffVisible).toBe(false);
  });
});
