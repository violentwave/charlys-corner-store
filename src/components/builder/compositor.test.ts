import { describe, expect, it, vi } from "vitest";

import { getGarment } from "@/lib/garments";

import {
  activeZoneColor,
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
