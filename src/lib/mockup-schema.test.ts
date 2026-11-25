import { describe, expect, it } from "vitest";

import { effectiveDpi, mockupPayloadSchema } from "./mockup-schema";

const base = {
  email: "fan@example.com",
  garment: "raglan",
  colors: { body: "#ffffff", sleeves: "#263147" },
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
    expect(r.wantsQuote).toBe(false);
  });

  it("requires a color for every zone, and only real hex colors", () => {
    expect(issues({ ...base, colors: { body: "#ffffff" } })).toContain("colors");
    expect(issues({ ...base, colors: { body: "#ffffff", sleeves: "red" } })).toContain("colors.sleeves");
    expect(issues({ ...base, colors: { ...base.colors, lining: "#000000" } })).toContain("colors");
  });

  it("rejects views and print areas the garment doesn't have", () => {
    const hat = { ...base, garment: "hat", colors: { front: "#f4f4f4", mesh: "#1b1b1f", brim: "#1b1b1f" } };
    expect(issues({ ...hat, views: [{ ...base.views[0], view: "back" }] })).toContain("views.0.view");
    expect(issues({ ...hat, views: [{ ...base.views[0], printArea: "full-front" }] })).toContain("views.0.printArea");
    expect(issues({ ...hat, views: [{ ...base.views[0], printArea: "hat-front" }], sizes: { OSFA: 3 } })).toEqual([]);
  });

  it("rejects duplicate views, empty views and unknown sizes", () => {
    expect(issues({ ...base, views: [base.views[0], base.views[0]] })).toContain("views.1.view");
    expect(issues({ ...base, views: [] })).toContain("views");
    expect(issues({ ...base, sizes: { OSFA: 1 } })).toContain("sizes.OSFA");
  });

  it("rejects bad emails, unknown garments and non-finite transforms", () => {
    expect(issues({ ...base, email: "nope" })).toContain("email");
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
