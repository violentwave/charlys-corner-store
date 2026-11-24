import { describe, expect, it } from "vitest";

import { catalog, formatPrice } from "./catalog";

describe("formatPrice", () => {
  it("formats single prices, ranges, cents, and unknown", () => {
    expect(formatPrice({ priceFromCents: 4800 })).toBe("$48");
    expect(formatPrice({ priceFromCents: 5500, priceToCents: 6350 })).toBe("$55–$63.50");
    expect(formatPrice({ priceFromCents: 125 })).toBe("$1.25");
    expect(formatPrice({ priceFromCents: null })).toBe("Get a quote");
  });
});

describe("catalog", () => {
  it("keeps all 9 legacy products (parity) with unique slugs", () => {
    expect(catalog.filter((p) => p.source === "legacy-site")).toHaveLength(9);
    expect(new Set(catalog.map((p) => p.slug)).size).toBe(catalog.length);
  });
});
