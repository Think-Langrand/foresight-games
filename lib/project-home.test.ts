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

describe("handoffPublic", () => {
  it("is off for a brand-new project, so nothing is public until someone says so", () => {
    expect(defaultHomeConfig().handoffPublic).toBe(false);
  });

  it("is off for a config stored before the flag existed", () => {
    expect(normalizeHomeConfig({ handoffVisible: true }).handoffPublic).toBe(false);
  });

  it("round-trips true once an admin publishes", () => {
    expect(normalizeHomeConfig({ handoffPublic: true }).handoffPublic).toBe(true);
  });

  it("treats a non-boolean as off rather than truthy", () => {
    // This one gates a page that needs no passphrase, so a hand-edited jsonb holding a
    // truthy string must not publish four groups' work to anyone with the link.
    expect(normalizeHomeConfig({ handoffPublic: "yes" }).handoffPublic).toBe(false);
  });

  it("is independent of handoffVisible", () => {
    const cfg = normalizeHomeConfig({ handoffVisible: true, handoffPublic: false });
    expect([cfg.handoffVisible, cfg.handoffPublic]).toEqual([true, false]);
  });
});
