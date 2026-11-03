import { describe, expect, it } from "vitest";
import { MAX_BACKGROUNDS, MAX_DECORATIONS, normalizeDesignLayers, safeImageUrl } from "./design-layers";
import { normalizeLayersPref } from "./profile-display";

describe("design layers normalization", () => {
  it("keeps every section exactly once", () => {
    const l = normalizeDesignLayers({ sections: [{ id: "footer", visible: false }, { id: "footer" }, { id: "bogus" }] });
    expect(l.sections.map((s) => s.id)).toEqual(["footer", "avatar", "blocks", "fx", "decorations"]);
    expect(l.sections[0]!.visible).toBe(false);
  });
  it("caps layer counts and clamps numbers", () => {
    const many = Array.from({ length: 50 }, () => ({ kind: "color", opacity: 900 }));
    const l = normalizeDesignLayers({ backgrounds: many, decorations: many });
    expect(l.backgrounds).toHaveLength(MAX_BACKGROUNDS);
    expect(l.decorations).toHaveLength(MAX_DECORATIONS);
    expect(l.backgrounds[0]!.opacity).toBe(100);
  });
  it("rejects non-https photos and bad colors", () => {
    expect(safeImageUrl("javascript:alert(1)")).toBe("");
    expect(safeImageUrl("http://x.be/a.jpg")).toBe("");
    const l = normalizeDesignLayers({ backgrounds: [{ kind: "photo", imageUrl: "data:x", color: "red" }] });
    expect(l.backgrounds[0]!.imageUrl).toBe("");
    expect(l.backgrounds[0]!.color).toBe("#f5efe6");
  });
  it("stores nothing for an empty design and survives broken JSON", () => {
    expect(normalizeLayersPref(JSON.stringify({ sections: [] }))).toBe("");
    expect(normalizeLayersPref("{not json")).toBe("");
  });
});
