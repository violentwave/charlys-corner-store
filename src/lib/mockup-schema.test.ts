import { describe, expect, it } from "vitest";

import { artworkCount, effectiveDpi, MAX_LAYERS_PER_VIEW, mockupPayloadSchema } from "./mockup-schema";

const base = {
  garment: "raglan",
  colors: { body: "#ffffff", sleeves: "#1e2a44" }, // Bella+Canvas 3200 "White / Navy"
  views: [
    {
      view: "front",
      printArea: "full-front",
      transform: { x: 350, y: 300, width: 300, height: 300, rotation: 0, flipX: false },
    },
  ],
  sizes: { M: 2, XL: 1 },
};

const issues = (v: unknown) => {
  const r = mockupPayloadSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
};

describe("mockupPayloadSchema", () => {
  it("accepts a valid design and fills defaults", () => {
    const r = mockupPayloadSchema.parse(base);
    expect(r.marketingOptIn).toBe(false);
    expect(r.intent).toBe("email");
  });

  it("carries no identity: contact fields are the account's, not the client's", () => {
    const r = mockupPayloadSchema.parse({ ...base, email: "sneaky@example.com", name: "Sneaky", phone: "555" });
    expect(r).not.toHaveProperty("email");
    expect(r).not.toHaveProperty("name");
    expect(r).not.toHaveProperty("phone");
    expect(r).not.toHaveProperty("wantsQuote");
  });

  it("requires a color for every zone, and only real hex colors", () => {
    expect(issues({ ...base, colors: { body: "#ffffff" } })).toContain("colors");
    expect(issues({ ...base, colors: { body: "#ffffff", sleeves: "red" } })).toContain("colors.sleeves");
    expect(issues({ ...base, colors: { ...base.colors, lining: "#000000" } })).toContain("colors");
  });

  it("rejects views and print areas the garment doesn't have", () => {
    const hat = { ...base, garment: "hat", colors: { front: "#1c1c1e", mesh: "#f4f4f4", brim: "#1c1c1e" } }; // "Black / White"
    expect(issues({ ...hat, views: [{ ...base.views[0], view: "back" }] })).toContain("views.0.view");
    expect(issues({ ...hat, views: [{ ...base.views[0], printArea: "full-front" }] })).toContain("views.0.printArea");
    expect(issues({ ...hat, views: [{ ...base.views[0], printArea: "hat-front" }], sizes: { OSFA: 3 } })).toEqual([]);
  });

  it("rejects duplicate views, empty views and unknown sizes", () => {
    expect(issues({ ...base, views: [base.views[0], base.views[0]] })).toContain("views.1.view");
    expect(issues({ ...base, views: [] })).toContain("views");
    expect(issues({ ...base, sizes: { OSFA: 1 } })).toContain("sizes.OSFA");
  });

  it("rejects unknown garments and non-finite transforms", () => {
    expect(issues({ ...base, garment: "sock" })).toContain("garment");
    const t = { ...base.views[0].transform, width: Number.POSITIVE_INFINITY };
    expect(issues({ ...base, views: [{ ...base.views[0], transform: t }] }).length).toBeGreaterThan(0);
  });

  it("needs the 'other' referral text", () => {
    expect(issues({ ...base, referralSource: "other" })).toContain("referralOther");
  });
});

describe("effectiveDpi", () => {
  it("divides pixels by inches", () => {
    expect(effectiveDpi(1800, 12)).toBe(150);
    expect(effectiveDpi(100, 0)).toBe(Infinity);
  });
});

describe("layers (image + text, stretch, skew)", () => {
  const t = { x: 350, y: 300, width: 300, height: 120, rotation: 0, flipX: false };
  const text = { type: "text", text: "CHARLY'S", font: "anton", color: "#ff2e97", transform: t };
  const layered = (layers: unknown[]) => ({ ...base, views: [{ view: "front", printArea: "full-front", layers }] });

  it("normalizes the old single-artwork view to one image layer with zero skew", () => {
    const r = mockupPayloadSchema.parse(base);
    expect(r.views[0]).toEqual({
      view: "front",
      printArea: "full-front",
      method: "recommend",
      layers: [{ type: "image", artwork: 0, transform: { ...base.views[0]!.transform, skewX: 0, skewY: 0 } }],
    });
  });

  it("print method: accepts a method that fits, rejects one that doesn't", () => {
    const withMethod = (garment: string, colors: Record<string, string>, method: string) =>
      mockupPayloadSchema.safeParse({
        ...base,
        garment,
        colors,
        views: [{ ...layered([{ type: "image", artwork: 0, transform: t }]).views[0]!, method }],
      });
    expect(withMethod("perftee", { body: "#ffffff" }, "sublimation").success).toBe(true);
    const dark = withMethod("perftee", { body: "#1f2a44" }, "sublimation");
    expect(dark.success).toBe(false);
    expect(JSON.stringify(dark.error?.issues)).toMatch(/light shirt/);
    expect(withMethod("tshirt", { body: "#ffffff" }, "sublimation").success).toBe(false);
    expect(withMethod("tshirt", { body: "#ffffff" }, "dtg").success).toBe(true);
    expect(withMethod("tshirt", { body: "#ffffff" }, "laser").success).toBe(false);
  });

  it("accepts image + text layers and fills text defaults", () => {
    const r = mockupPayloadSchema.parse(layered([{ type: "image", artwork: 0, transform: t }, text]));
    expect(r.views[0]!.layers[1]).toMatchObject({
      type: "text",
      outline: { width: 0 },
      align: "center",
      letterSpacing: 0,
      transform: { skewX: 0, skewY: 0 },
    });
    expect(artworkCount(r.views)).toBe(1);
  });

  it("text arches between -1 and 1, straight by default", () => {
    expect(mockupPayloadSchema.parse(layered([text])).views[0]!.layers[0]).toMatchObject({ curve: 0 });
    expect(issues(layered([{ ...text, curve: 0.6 }]))).toEqual([]);
    expect(issues(layered([{ ...text, curve: 1.5 }])).length).toBeGreaterThan(0);
  });

  it("allows a text-only design (no artwork files)", () => {
    const r = mockupPayloadSchema.parse(layered([text]));
    expect(artworkCount(r.views)).toBe(0);
  });

  it("allows stretched + skewed placement within bounds", () => {
    const stretched = { ...t, width: 60, height: 600, rotation: -35, skewX: 0.3, skewY: -0.2 };
    expect(issues(layered([{ ...text, transform: stretched }]))).toEqual([]);
    expect(issues(layered([{ ...text, transform: { ...t, skewX: 0.9 } }])).length).toBeGreaterThan(0);
  });

  it("rejects unknown fonts, bad colors, empty or long text", () => {
    expect(issues(layered([{ ...text, font: "comic-sans" }])).length).toBeGreaterThan(0);
    expect(issues(layered([{ ...text, color: "pink" }])).length).toBeGreaterThan(0);
    expect(issues(layered([{ ...text, text: "   " }])).length).toBeGreaterThan(0);
    expect(issues(layered([{ ...text, text: "x".repeat(61) }])).length).toBeGreaterThan(0);
    expect(issues(layered([{ ...text, outline: { color: "#000000", width: 30 } }])).length).toBeGreaterThan(0);
  });

  it("caps layers per side and needs at least one", () => {
    expect(issues(layered(Array.from({ length: MAX_LAYERS_PER_VIEW + 1 }, () => text))).length).toBeGreaterThan(0);
    expect(issues(layered([])).length).toBeGreaterThan(0);
  });

  it("still requires dense artwork indexes across layers", () => {
    expect(issues(layered([{ type: "image", artwork: 1, transform: t }])).length).toBeGreaterThan(0);
  });
});
