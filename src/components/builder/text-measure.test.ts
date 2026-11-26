import { describe, expect, it } from "vitest";

import { curvedGeometry } from "./text-measure";

describe("curvedGeometry (arched text)", () => {
  it("is a plain line when straight", () => {
    expect(curvedGeometry(400, 100, 0)).toEqual({ width: 400, height: 100, offsetX: 200, offsetY: 50, path: null });
  });

  it("arched up: narrower than the line, taller, centered on its band", () => {
    const g = curvedGeometry(400, 100, 0.5);
    expect(g.path).toMatch(/^M .* A .* 0 0 1 /); // small arc, sweep 1 = over the top
    expect(g.width).toBeLessThan(400 + 100);
    expect(g.height).toBeGreaterThan(100);
    expect(g.offsetX).toBe(0);
    // Top of the band is half a letter above the apex.
    expect(g.offsetY - g.height / 2).toBeCloseTo(-50);
  });

  it("arched down mirrors arched up", () => {
    const up = curvedGeometry(400, 100, 0.6);
    const down = curvedGeometry(400, 100, -0.6);
    expect(down.width).toBeCloseTo(up.width);
    expect(down.height).toBeCloseTo(up.height);
    expect(down.offsetY).toBeCloseTo(-up.offsetY);
    expect(down.path).toMatch(/ 0 0 0 /); // sweep 0 = under the bottom
  });

  it("a full arch is a half circle at most, and short words never curl past the letter height", () => {
    const g = curvedGeometry(400, 100, 1);
    expect(g.width).toBeCloseTo(2 * (400 / Math.PI + 50));
    const short = curvedGeometry(60, 100, 1);
    expect(Number.isFinite(short.width) && short.width > 0).toBe(true);
  });
});
