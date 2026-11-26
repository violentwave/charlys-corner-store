import { describe, expect, it } from "vitest";

import { GARMENTS, getGarment, type GarmentConfig, type PrintArea } from "./garments";
import { effectiveMethod, isMethodAllowed, methodBlocker, PRINT_METHODS, PRINT_METHOD_IDS } from "./print-methods";

const area = (g: GarmentConfig, view: string, id: string): PrintArea =>
  g.views.find((v) => v.id === view)!.printAreas.find((a) => a.id === id)!;

const tee = getGarment("tshirt");
const perf = getGarment("perftee");
const perfLs = getGarment("perflongsleeve");
const hat = getGarment("hat");
const white = { body: "#ffffff" };
const navy = { body: "#1f2a44" };

describe("print methods", () => {
  it("lists every method once", () => {
    expect(PRINT_METHODS.map((m) => m.id)).toEqual([...PRINT_METHOD_IDS]);
  });

  it("screen, DTF and vinyl fit every garment and area", () => {
    for (const g of GARMENTS) {
      for (const v of g.views) {
        for (const a of v.printAreas) {
          for (const m of ["screen", "dtf", "vinyl"] as const) {
            expect(methodBlocker(m, g, g.defaultColors, a)).toBeNull();
          }
        }
      }
    }
  });

  it("DTG: cotton and blends only", () => {
    expect(methodBlocker("dtg", tee, white, area(tee, "front", "full-front"))).toBeNull();
    expect(methodBlocker("dtg", perf, white, area(perf, "front", "full-front"))).toMatch(/cotton/);
    expect(methodBlocker("dtg", hat, hat.defaultColors, area(hat, "front", "hat-front"))).toMatch(/hats/);
  });

  it("embroidery: not on performance polyester, not on big areas", () => {
    expect(methodBlocker("embroidery", tee, white, area(tee, "front", "left-chest"))).toBeNull();
    expect(methodBlocker("embroidery", tee, white, area(tee, "front", "full-front"))).toMatch(/too big/);
    expect(methodBlocker("embroidery", hat, hat.defaultColors, area(hat, "front", "hat-front"))).toBeNull();
    expect(methodBlocker("embroidery", perf, white, area(perf, "front", "left-chest"))).toMatch(/thin/);
  });

  it("sublimation: light polyester only", () => {
    expect(methodBlocker("sublimation", perf, white, area(perf, "front", "full-front"))).toBeNull();
    expect(methodBlocker("sublimation", perfLs, white, area(perfLs, "left", "full-sleeve"))).toBeNull();
    expect(methodBlocker("sublimation", perf, navy, area(perf, "front", "full-front"))).toMatch(/light/);
    expect(methodBlocker("sublimation", tee, white, area(tee, "front", "full-front"))).toMatch(/polyester/);
  });

  it("recommend is always allowed; a stale pick falls back to recommend", () => {
    const a = area(perf, "front", "full-front");
    expect(isMethodAllowed("recommend", perf, navy, a)).toBe(true);
    expect(effectiveMethod("sublimation", perf, white, a)).toBe("sublimation");
    expect(effectiveMethod("sublimation", perf, navy, a)).toBe("recommend");
    expect(effectiveMethod(undefined, perf, white, a)).toBe("recommend");
  });
});
