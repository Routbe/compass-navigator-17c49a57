import { describe, expect, it } from "vitest";
import {
  DEFAULT_GLASS, DEFAULT_GLASS_TARGETS, applyScopedPatch, glassSurfaceStyle, hasUniqueStyle,
  normalizeGlassTokens, resetScope, resolveScopedTokens, scopeOfBlockKind,
} from "@/lib/theme-engine";

describe("scoped theme engine", () => {
  it("'Alle elementen' changes the global tokens, not overrides", () => {
    const r = applyScopedPatch(DEFAULT_GLASS, {}, "all", { glassStyle: "prism" });
    expect(r.global.glassStyle).toBe("prism");
    expect(r.overrides).toEqual({});
  });
  it("a component scope stores its own override and shows as unique until reset", () => {
    const r = applyScopedPatch(DEFAULT_GLASS, {}, "booking", { glassStyle: "obsidian" });
    expect(r.overrides.booking).toEqual({ glassStyle: "obsidian" });
    expect(resolveScopedTokens(r.global, r.overrides, "booking").glassStyle).toBe("obsidian");
    expect(resolveScopedTokens(r.global, r.overrides, "links").glassStyle).toBe("solid");
    expect(hasUniqueStyle(r.global, r.overrides, "booking")).toBe(true);
    expect(hasUniqueStyle(r.global, resetScope(r.overrides, "booking"), "booking")).toBe(false);
  });
  it("clamps opacity to 5–50% and blur to 4–32px", () => {
    const t = normalizeGlassTokens({ glassOpacity: 90, glassBlur: 1 });
    expect(t.glassOpacity).toBe(50);
    expect(t.glassBlur).toBe(4);
  });
  it("renders blur + GPU hint for glass and nothing for solid or unchecked targets", () => {
    const glass = { ...DEFAULT_GLASS, glassStyle: "frosted-light" as const, glassBlur: 16 };
    const css = glassSurfaceStyle(glass, "links", DEFAULT_GLASS_TARGETS)!;
    expect(css["backdropFilter"]).toBe("blur(16px) saturate(180%)");
    expect(css["willChange"]).toBe("transform");
    expect(glassSurfaceStyle(DEFAULT_GLASS, "links", DEFAULT_GLASS_TARGETS)).toBeNull();
    expect(glassSurfaceStyle(glass, "booking", { ...DEFAULT_GLASS_TARGETS, booking: false })).toBeNull();
  });
  it("maps block kinds to scopes", () => {
    expect(scopeOfBlockKind("booking_request")).toBe("booking");
    expect(scopeOfBlockKind("widget:guestbook")).toBe("board");
    expect(scopeOfBlockKind("live")).toBe("presence");
    expect(scopeOfBlockKind("social_feed")).toBe("socials");
    expect(scopeOfBlockKind("link")).toBe("links");
  });
});
