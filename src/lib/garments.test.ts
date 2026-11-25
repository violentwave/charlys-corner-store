// @vitest-environment node
import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { GARMENTS, getGarment, highlightOpacity, isHexColor, luma, printedInches } from "./garments";

const pub = (p: string) => join(process.cwd(), "public", p);

describe("garment config", () => {
  it("covers all six garments from the spec", () => {
    expect(GARMENTS.map((g) => g.id).sort()).toEqual(["hat", "hoodie", "polo", "raglan", "tank", "tshirt"].sort());
  });

  it.each(GARMENTS)("$id: zones, colors and layer files are consistent", (g) => {
    const zoneIds = g.colorZones.map((z) => z.id);
    expect(Object.keys(g.defaultColors).sort()).toEqual([...zoneIds].sort());
    for (const hex of [...Object.values(g.defaultColors), ...g.palette.map((c) => c.hex)]) {
      expect(isHexColor(hex)).toBe(true);
    }
    for (const v of g.views) {
      for (const z of v.zones) expect(zoneIds).toContain(z);
      const files = [v.layers.base, v.layers.shading, v.layers.highlight, ...Object.values(v.layers.mask)];
      for (const f of files) expect(existsSync(pub(f)), f).toBe(true);
    }
  });

  it.each(GARMENTS.flatMap((g) => g.views.map((v) => ({ g: g.id, v }))))(
    "$g/$v.id: print areas sit inside the template and on the garment",
    async ({ v }) => {
      const meta = await sharp(pub(v.layers.shading)).metadata();
      expect([meta.width, meta.height]).toEqual([v.width, v.height]);
      const { data, info } = await sharp(pub(v.layers.shading))
        .ensureAlpha()
        .extractChannel(3)
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (const a of v.printAreas) {
        const { x, y, w, h } = a.rect;
        expect(x >= 0 && y >= 0 && x + w <= v.width && y + h <= v.height).toBe(true);
        // every corner of the print area lands on fabric
        for (const [px, py] of [
          [x, y],
          [x + w - 1, y],
          [x, y + h - 1],
          [x + w - 1, y + h - 1],
        ]) {
          expect(data[py * info.width + px], `${a.id} corner ${px},${py}`).toBeGreaterThan(128);
        }
        // aspect ratio of the rect matches the max print size
        expect(w / h).toBeCloseTo(a.maxInches.w / a.maxInches.h, 1);
      }
    },
  );

  it("getGarment throws for unknown ids", () => {
    expect(getGarment("hat").name).toBe("Trucker Hat");
    // @ts-expect-error testing bad input
    expect(() => getGarment("sock")).toThrow();
  });
});

describe("color helpers", () => {
  it("luma and highlight opacity", () => {
    expect(luma("#ffffff")).toBeCloseTo(1);
    expect(luma("#000000")).toBe(0);
    expect(highlightOpacity("#ffffff")).toBe(0.15);
    expect(highlightOpacity("#000000")).toBe(1);
    expect(() => luma("red")).toThrow();
  });

  it("printedInches converts template px to inches", () => {
    const area = getGarment("tshirt").views[0].printAreas.find((a) => a.id === "full-front")!;
    expect(printedInches(area, { w: area.rect.w, h: area.rect.h })).toEqual({ w: 12, h: 14 });
    expect(printedInches(area, { w: 156, h: 0 }).w).toBe(6);
  });
});
