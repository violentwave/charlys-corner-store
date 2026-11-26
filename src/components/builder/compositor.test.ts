import { describe, expect, it, vi } from "vitest";

import { getGarment } from "@/lib/garments";

import {
  activeZoneColor,
  blendShadingIntoPixels,
  composeGarment,
  garmentLayers,
  maskCacheKey,
  SHADING_OVER_ARTWORK_OPACITY,
  type TemplateImages,
} from "./compositor";

describe("garmentLayers", () => {
  it("builds the documented order for a single-zone shirt: masks → shading → highlight → silhouette → artwork → shading over artwork", () => {
    const view = getGarment("tshirt").views[0]!;
    const layers = garmentLayers(view, { body: "#1b1b1f" });
    expect(layers.map((l) => l.type)).toEqual([
      "mask",
      "shading",
      "highlight",
      "silhouette",
      "artwork",
      "shading-over-artwork",
    ]);
    const [mask, shading, highlight, silhouette, , over] = layers;
    expect(mask).toMatchObject({
      zone: "body",
      src: "/garments/tshirt/front/mask-body.png",
      color: "#1b1b1f",
      op: "source-in",
    });
    expect(shading).toMatchObject({ src: "/garments/tshirt/front/shading.webp", op: "multiply", opacity: 1 });
    // #1b1b1f is near-black: opacity = 0.15 + 0.85 × (1 − luma) ≈ 0.909 — near-full sheen.
    expect(highlight).toMatchObject({ src: "/garments/tshirt/front/highlight.webp", op: "screen" });
    expect(highlight.opacity).toBeCloseTo(0.15 + 0.85 * (1 - 0.10588), 2);
    expect(silhouette).toMatchObject({ src: "/garments/tshirt/front/shading.webp", op: "destination-in" });
    expect(over).toMatchObject({
      src: "/garments/tshirt/front/shading.webp",
      op: "multiply",
      opacity: SHADING_OVER_ARTWORK_OPACITY,
    });
  });

  it("fills one mask per zone in view order, each with its own color", () => {
    const view = getGarment("raglan").views[0]!;
    const layers = garmentLayers(view, { body: "#ffffff", sleeves: "#263147" });
    const masks = layers.filter((l) => l.type === "mask");
    expect(masks).toHaveLength(2);
    expect(masks[0]).toMatchObject({ zone: "body", color: "#ffffff" });
    expect(masks[1]).toMatchObject({ zone: "sleeves", color: "#263147" });
  });

  it("dims the highlight on light fabric (sheen is for dark fabric)", () => {
    const view = getGarment("tshirt").views[0]!;
    const highlight = garmentLayers(view, { body: "#ffffff" }).find((l) => l.type === "highlight")!;
    expect(highlight.opacity).toBeLessThan(0.25);
  });

  it("falls back to the view's first zone color for the highlight (hat has no body)", () => {
    const view = getGarment("hat").views[0]!;
    expect(view.zones[0]).toBe("front");
    expect(activeZoneColor(view, { front: "#1b1b1f", mesh: "#ffffff", brim: "#ffffff" })).toBe("#1b1b1f");
    const highlight = garmentLayers(view, { front: "#1b1b1f", mesh: "#ffffff", brim: "#ffffff" }).find(
      (l) => l.type === "highlight",
    )!;
    expect(highlight.opacity).toBeCloseTo(0.909, 2);
  });

  it("uses every zone's mask src from the view config", () => {
    const view = getGarment("hat").views[0]!;
    const masks = garmentLayers(view, { front: "#1c1c1e", mesh: "#f4f4f4", brim: "#1c1c1e" }).filter(
      (l) => l.type === "mask",
    );
    expect(masks.map((m) => (m.type === "mask" ? m.src : ""))).toEqual([
      "/garments/hat/front/mask-front.png",
      "/garments/hat/front/mask-mesh.png",
      "/garments/hat/front/mask-brim.png",
    ]);
  });
});

describe("maskCacheKey", () => {
  it("keys the recolor cache per (src, hex)", () => {
    expect(maskCacheKey("/garments/hat/front/mask-front.png", "#ff2e97")).toBe(
      "/garments/hat/front/mask-front.png|#ff2e97",
    );
    expect(maskCacheKey("/a.png", "#111111")).not.toBe(maskCacheKey("/b.png", "#111111"));
    expect(maskCacheKey("/a.png", "#111111")).not.toBe(maskCacheKey("/a.png", "#222222"));
  });
});

describe("blendShadingIntoPixels (text layers get the fabric's folds, P51-2)", () => {
  const textPixel = (r: number, g: number, b: number, a = 255) => [r, g, b, a];
  const shading = (rgbs: number[][]) => ({
    width: rgbs.length,
    height: 1,
    data: new Uint8ClampedArray(rgbs.flatMap(([r, g, b]) => [r, g, b, 255])),
  });

  it("a text pixel over a dark fold lands darker than over flat fabric", () => {
    // two identical red text pixels; the shading is a black fold under the first, flat white under the second
    const text = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([...textPixel(230, 57, 70), ...textPixel(230, 57, 70)]),
    };
    const s = shading([
      [10, 10, 12], // dark fold
      [250, 250, 252], // flat fabric
    ]);
    blendShadingIntoPixels(text, s, 0, 0, SHADING_OVER_ARTWORK_OPACITY);
    const fold = [text.data[0], text.data[1], text.data[2]];
    const flat = [text.data[4], text.data[5], text.data[6]];
    expect(flat[0]).toBeGreaterThanOrEqual(224); // (near-)white fabric barely darkens the ink
    expect(fold[0]).toBeLessThan(flat[0] - 40); // the fold pulls the ink down toward the fabric
    expect(text.data[3]).toBe(255); // fully opaque text stays fully opaque
  });

  it("keeps transparent pixels transparent (the shading never spills outside the letters)", () => {
    const text = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([...textPixel(0, 0, 0), ...textPixel(9, 9, 9, 0)]),
    };
    const s = shading([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    blendShadingIntoPixels(text, s, 0, 0, SHADING_OVER_ARTWORK_OPACITY);
    expect(text.data[7]).toBe(0); // the transparent pixel's alpha is untouched
  });

  it("samples the shading at the layer's template offset", () => {
    const text = { width: 1, height: 1, data: new Uint8ClampedArray([...textPixel(200, 200, 200)]) };
    const s = shading([
      [250, 250, 250],
      [30, 30, 30],
    ]);
    s.height = 2;
    s.data = new Uint8ClampedArray([250, 250, 250, 255, 30, 30, 30, 255, 250, 250, 250, 255, 30, 30, 30, 255]);
    blendShadingIntoPixels(text, s, 1, 1, SHADING_OVER_ARTWORK_OPACITY); // the layer sits at (1,1) → samples (1,1)
    expect(text.data[0]).toBeLessThan(100); // it found the dark fold at (1,1), not the white at (0,1)
  });
});

describe("composeGarment", () => {
  it("runs the non-artwork layers onto a template-sized canvas in order", () => {
    const calls: string[] = [];
    const ctx = { drawImage: () => calls.push("draw"), fillRect: () => calls.push("fill") };
    for (const [prop, prefix] of [
      ["globalCompositeOperation", "op"],
      ["globalAlpha", "alpha"],
      ["fillStyle", "fillStyle"],
    ] as const) {
      Object.defineProperty(ctx, prop, {
        get: () => undefined,
        set: (value: unknown) => calls.push(`${prefix}:${String(value)}`),
      });
    }
    const canvasSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation(((tag: string) =>
        tag === "canvas"
          ? { width: 0, height: 0, getContext: () => ctx }
          : document.createElement(tag)) as unknown as typeof document.createElement);

    try {
      const view = getGarment("tshirt").views[0]!;
      const img = () =>
        ({ naturalWidth: 1000, naturalHeight: 1200, width: 1000, height: 1200 }) as unknown as HTMLImageElement;
      const images: TemplateImages = { masks: { body: img() }, shading: img(), highlight: img() };
      const canvas = composeGarment(view, { body: "#1b1b1f" }, images);
      expect(canvas.width).toBe(1000);
      expect(canvas.height).toBe(1200);
      // Assignments precede drawImage's argument evaluation: op/alpha for the mask
      // draw come first, then recolorMask's internals, then the composed draw.
      expect(calls).toEqual([
        "op:source-over",
        "alpha:1",
        "draw",
        "op:source-in",
        "fillStyle:#1b1b1f",
        "fill",
        "draw",
        "op:multiply",
        "alpha:1",
        "draw",
        "op:screen",
        "alpha:0.909",
        "draw",
        "op:destination-in",
        "alpha:1",
        "draw",
        "op:source-over",
        "alpha:1",
      ]);
    } finally {
      canvasSpy.mockRestore();
    }
  });
});
