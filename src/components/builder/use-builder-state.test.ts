import { describe, expect, it } from "vitest";

import { getGarment } from "@/lib/garments";
import { mockupPayloadSchema } from "@/lib/mockup-schema";

import {
  builderReducer,
  designFromRestore,
  fitTransform,
  initialDesign,
  loadPersistedBuilderState,
  PERSIST_KEY,
  persistBuilderState,
  toPayloadDesign,
  type BuilderState,
} from "./use-builder-state";
import { centerInRect, nudgeTransform, rotateAroundCenter, scaleAroundCenter } from "./geometry";
import { isLowResolution } from "./print";

const start = (): BuilderState => ({
  step: 3,
  design: initialDesign("tshirt"),
  past: [],
  future: [],
});

describe("builderReducer — artwork", () => {
  it("places artwork fitted and centered in the active print area", () => {
    const state = builderReducer(start(), {
      type: "placeArtwork",
      views: ["front"],
      meta: { name: "art.png", kind: "png", naturalWidth: 600, naturalHeight: 300 },
    });
    const front = state.design.views.front?.artwork;
    // The initial print area is the front view's first: Front Chest (260×130).
    const chest = getGarment("tshirt").views[0]!.printAreas[0]!.rect;
    expect(chest).toEqual({ x: 370, y: 292, w: 260, h: 130 });
    // 600×300 fits at scale 0.433 → 260×130, centered.
    expect(front?.transform.width).toBeCloseTo(260);
    expect(front?.transform.height).toBeCloseTo(130);
    expect(front?.transform.x).toBeCloseTo(chest.x);
    expect(front?.transform.y).toBeCloseTo(chest.y);
    expect(front?.transform.rotation).toBe(0);
  });

  it("commits a transform as one undo step", () => {
    let state = builderReducer(start(), {
      type: "placeArtwork",
      views: ["front"],
      meta: { name: "art.png", kind: "png", naturalWidth: 600, naturalHeight: 300 },
    });
    const before = state.design.views.front!.artwork!.transform;
    state = builderReducer(state, {
      type: "setTransform",
      view: "front",
      transform: { ...before, x: before.x + 25, rotation: 15 },
    });
    expect(state.design.views.front!.artwork!.transform.x).toBeCloseTo(before.x + 25);
    expect(state.design.views.front!.artwork!.transform.rotation).toBe(15);
    expect(state.past).toHaveLength(2); // garment init isn't history; place + transform are
    state = builderReducer(state, { type: "undo" });
    expect(state.design.views.front!.artwork!.transform.x).toBeCloseTo(before.x);
    expect(state.design.views.front!.artwork!.transform.rotation).toBe(0);
    state = builderReducer(state, { type: "redo" });
    expect(state.design.views.front!.artwork!.transform.rotation).toBe(15);
  });

  it("removes artwork from one view only, keeping the print-area choice", () => {
    let state = builderReducer(start(), {
      type: "placeArtwork",
      views: ["front", "back"],
      meta: { name: "art.png", kind: "png", naturalWidth: 600, naturalHeight: 300 },
    });
    state = builderReducer(state, { type: "setPrintArea", view: "front", printAreaId: "left-chest" });
    state = builderReducer(state, { type: "removeArtwork", view: "front" });
    expect(state.design.views.front?.artwork).toBeNull();
    expect(state.design.views.back?.artwork).not.toBeNull();
    expect(state.design.views.front?.printArea).toBe("left-chest");
  });

  it("refits the artwork when the print location changes", () => {
    let state = builderReducer(start(), {
      type: "placeArtwork",
      views: ["front"],
      meta: { name: "art.png", kind: "png", naturalWidth: 1000, naturalHeight: 1000 },
    });
    state = builderReducer(state, { type: "setPrintArea", view: "front", printAreaId: "left-chest" });
    const transform = state.design.views.front!.artwork!.transform;
    const chest = getGarment("tshirt").views[0]!.printAreas.find((a) => a.id === "left-chest")!.rect;
    expect(transform.width).toBeCloseTo(chest.w);
    expect(transform.height).toBeCloseTo(chest.h);
    expect(transform.x).toBeCloseTo(chest.x);
  });
});

describe("builderReducer — colors and garment switch", () => {
  it("sets a zone color when it is a valid hex and ignores garbage", () => {
    let state = builderReducer(start(), { type: "setZoneColor", zone: "body", hex: "#ff2e97" });
    expect(state.design.colors.body).toBe("#ff2e97");
    state = builderReducer(state, { type: "setZoneColor", zone: "body", hex: "neon" });
    expect(state.design.colors.body).toBe("#ff2e97");
  });

  it("carries shared zone colors on a garment switch, defaults new zones, clears views and invalid sizes", () => {
    let state = builderReducer(start(), { type: "setZoneColor", zone: "body", hex: "#ff2e97" });
    state = builderReducer(state, { type: "setSize", size: "2XL", qty: 4 });
    state = builderReducer(state, {
      type: "placeArtwork",
      views: ["front"],
      meta: { name: "art.png", kind: "png", naturalWidth: 600, naturalHeight: 600 },
    });
    state = builderReducer(state, { type: "selectGarment", garmentId: "raglan" });

    expect(state.design.garment).toBe("raglan");
    expect(state.design.colors.body).toBe("#ff2e97"); // carried over
    expect(state.design.colors.sleeves).toBe(getGarment("raglan").defaultColors.sleeves);
    expect(Object.keys(state.design.views).sort()).toEqual(["back", "front"]);
    expect(state.design.views.front?.artwork).toBeNull(); // geometry differs per garment
    expect(state.design.views.front?.printArea).toBe("front-chest"); // raglan front's first area
    expect(state.design.sizes["2XL"]).toBe(4); // still a valid size for a raglan
    expect(state.past).toHaveLength(3); // color + place + garment switch

    state = builderReducer(state, { type: "selectGarment", garmentId: "hat" });
    expect(Object.keys(state.design.views)).toEqual(["front"]);
    expect(state.design.colors.body).toBeUndefined();
    expect(state.design.colors.front).toBe(getGarment("hat").defaultColors.front);
    expect(state.design.sizes).toEqual({}); // OSFA only — apparel sizes are invalid
  });

  it("ignores a no-op garment switch", () => {
    const state = builderReducer(start(), { type: "selectGarment", garmentId: "tshirt" });
    expect(state.past).toHaveLength(0);
  });
});

describe("builderReducer — undo/redo cap", () => {
  it("caps history at 50 and drops the oldest design", () => {
    let state = start();
    for (let i = 0; i < 60; i++) {
      state = builderReducer(state, {
        type: "setZoneColor",
        zone: "body",
        hex: `#${(0x100000 + i).toString(16).slice(0, 6)}`,
      });
    }
    expect(state.past).toHaveLength(50);
    // 60 pushes with a 50-cap: the kept history starts at the design after push 9.
    expect(state.past[0]!.colors.body).toBe(`#${(0x100000 + 9).toString(16).slice(0, 6)}`);
    for (let i = 0; i < 50; i++) state = builderReducer(state, { type: "undo" });
    expect(state.design.colors.body).toBe(`#${(0x100000 + 9).toString(16).slice(0, 6)}`);
    expect(state.future).toHaveLength(50);
  });
});

describe("builderReducer — details don't flood history", () => {
  it("updates sizes, notes and referral without pushing history", () => {
    let state = builderReducer(start(), { type: "setSize", size: "XL", qty: 3 });
    state = builderReducer(state, { type: "setSize", size: "XL", qty: 90000 }); // clamped to 10000
    state = builderReducer(state, { type: "setNotes", notes: `x`.repeat(3000) });
    state = builderReducer(state, { type: "setReferral", referral: { referralSource: "friend" } });
    expect(state.design.sizes.XL).toBe(10000);
    expect(state.design.notes).toHaveLength(2000);
    expect(state.design.referral.referralSource).toBe("friend");
    expect(state.past).toHaveLength(0);
  });
});

describe("sessionStorage round-trip (jsdom)", () => {
  it("restores design + step and drops stale views/sizes", () => {
    let state = builderReducer(start(), { type: "setZoneColor", zone: "body", hex: "#ff2e97" });
    state = builderReducer(state, { type: "setSize", size: "2XL", qty: 2 });
    state = builderReducer(state, {
      type: "placeArtwork",
      views: ["front"],
      meta: { name: "art.png", kind: "png", naturalWidth: 600, naturalHeight: 300 },
    });
    persistBuilderState(state);

    const restored = loadPersistedBuilderState();
    expect(restored).not.toBeNull();
    expect(restored!.step).toBe(3);
    expect(restored!.design.colors.body).toBe("#ff2e97");
    expect(restored!.design.views.front?.artwork?.name).toBe("art.png");
    expect(restored!.design.views.front?.artwork?.transform.width).toBeGreaterThan(0);

    // A garment that changed underneath (e.g. a stale tab) gets sanitized.
    sessionStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        version: 1,
        step: 5,
        design: {
          ...restored!.design,
          garment: "hat",
          views: { ...restored!.design.views, back: restored!.design.views.front },
          sizes: { "2XL": 9, OSFA: 1 },
        },
      }),
    );
    const stale = loadPersistedBuilderState()!;
    expect(Object.keys(stale.design.views)).toEqual(["front"]);
    expect(stale.design.sizes).toEqual({ OSFA: 1 });
  });

  it("returns null for corrupt or missing data", () => {
    sessionStorage.removeItem(PERSIST_KEY);
    expect(loadPersistedBuilderState()).toBeNull();
    sessionStorage.setItem(PERSIST_KEY, "{not json");
    expect(loadPersistedBuilderState()).toBeNull();
    sessionStorage.setItem(PERSIST_KEY, JSON.stringify({ version: 999, step: 1, design: {} }));
    expect(loadPersistedBuilderState()).toBeNull();
  });
});

describe("toPayloadDesign", () => {
  it("maps the design 1:1 onto mockupPayloadSchema's design portion", () => {
    let state = builderReducer(start(), { type: "setZoneColor", zone: "body", hex: "#ff2e97" });
    state = builderReducer(state, {
      type: "placeArtwork",
      views: ["front"],
      meta: { name: "art.png", kind: "png", naturalWidth: 600, naturalHeight: 300 },
    });
    state = builderReducer(state, { type: "setPrintArea", view: "front", printAreaId: "left-chest" });
    state = builderReducer(state, { type: "setSize", size: "XL", qty: 2 });
    state = builderReducer(state, { type: "setNotes", notes: "  Gildan please  " });

    const design = toPayloadDesign(state.design);
    const result = mockupPayloadSchema.safeParse({
      ...design,
      email: "fan@example.com",
      referralSource: state.design.referral.referralSource,
    });
    // The design portion alone must validate once the gate fields (P4-2) are added.
    expect(result.success).toBe(true);
    expect(result.success && result.data.views).toEqual([
      { view: "front", printArea: "left-chest", transform: state.design.views.front!.artwork!.transform },
    ]);
    expect(result.success && result.data.notes).toBe("Gildan please");
  });

  it("only includes views that carry artwork", () => {
    const state = start();
    const design = toPayloadDesign(state.design);
    expect(design.views).toEqual([]);
  });
});

describe("designFromRestore (deep link)", () => {
  const meta = { name: "art.png", kind: "png", naturalWidth: 600, naturalHeight: 300 } as const;

  it("rebuilds the design from the API response and keeps the saved transforms", () => {
    const design = designFromRestore(
      {
        garment: "tshirt",
        colors: { body: "#2233aa" },
        views: [
          {
            view: "front",
            printArea: "full-front",
            transform: { x: 344, y: 292, width: 312, height: 364, rotation: 15, flipX: false },
          },
        ],
        sizes: { M: 2 },
      },
      meta,
    );
    expect(design.garment).toBe("tshirt");
    expect(design.colors.body).toBe("#2233aa");
    expect(design.views.front?.printArea).toBe("full-front");
    expect(design.views.front?.artwork).toMatchObject({
      name: "art.png",
      kind: "png",
      transform: { rotation: 15, flipX: false },
    });
    expect(design.views.back?.artwork).toBeNull();
    expect(design.sizes).toEqual({ M: 2 });
    // Notes are not part of the restore response; the design starts clean.
    expect(design.notes).toBe("");
  });

  it("falls back to garment defaults for unknown zones, print areas and sizes", () => {
    const design = designFromRestore(
      {
        garment: "hat",
        colors: { body: "#ff2e97", notAZone: "#000000" },
        views: [
          {
            view: "front",
            printArea: "made-up-area",
            transform: { ...fitTransform({ x: 0, y: 0, w: 100, h: 100 }, 600, 300), rotation: 999 },
          },
        ],
        sizes: { OSFA: 3, "2XL": 5 },
      },
      meta,
    );
    expect(design.colors.front).toBe(getGarment("hat").defaultColors.front);
    expect(design.colors.notAZone).toBeUndefined();
    const front = design.views.front!;
    expect(front.printArea).toBe("hat-front"); // unknown area → the view's first
    // A corrupt transform (rotation outside ±360) re-fits into the area instead.
    expect(front.artwork!.transform.rotation).toBe(0);
    expect(design.sizes).toEqual({ OSFA: 3 }); // 2XL isn't a hat size
  });
});

describe("fitTransform", () => {
  it("contains and centers inside the rect", () => {
    const t = fitTransform({ x: 344, y: 292, w: 312, h: 364 }, 600, 300);
    expect(t.width).toBeCloseTo(312);
    expect(t.height).toBeCloseTo(156);
    expect(t.y).toBeCloseTo(292 + (364 - 156) / 2);
    expect(t.rotation).toBe(0);
    expect(t.flipX).toBe(false);
  });

  it("falls back to the rect size for a zero-sized image", () => {
    const t = fitTransform({ x: 0, y: 0, w: 100, h: 100 }, 0, 0);
    expect(t.width).toBeCloseTo(100);
    expect(t.height).toBeCloseTo(100);
  });
});

describe("geometry helpers", () => {
  it("keeps the center pinned through rotation, scaling and re-centering", () => {
    const t = fitTransform({ x: 344, y: 292, w: 312, h: 364 }, 600, 300);

    const rotated = rotateAroundCenter(t, 90);
    expect(rotated.rotation).toBe(90);
    const rotatedBack = rotateAroundCenter(rotated, -90);
    expect(rotatedBack.x).toBeCloseTo(t.x);
    expect(rotatedBack.y).toBeCloseTo(t.y);

    const scaled = scaleAroundCenter(t, 2);
    expect(scaled.width).toBeCloseTo(t.width * 2);
    expect(scaled.x + scaled.width / 2).toBeCloseTo(t.x + t.width / 2);
    expect(scaled.y + scaled.height / 2).toBeCloseTo(t.y + t.height / 2);

    const centered = centerInRect(t, { x: 0, y: 0, w: 312, h: 364 });
    expect(centered.x).toBeCloseTo(0);
    expect(centered.y).toBeCloseTo((364 - 156) / 2);

    const nudged = nudgeTransform(t, 10, -5);
    expect(nudged.x).toBeCloseTo(t.x + 10);
    expect(nudged.y).toBeCloseTo(t.y - 5);
  });
});

describe("isLowResolution", () => {
  it("warns under 150 DPI and stays quiet at or above it", () => {
    expect(isLowResolution("png", 1000, 12)).toBe(true); // 83 DPI
    expect(isLowResolution("png", 1800, 12)).toBe(false); // exactly 150
    expect(isLowResolution("png", 2000, 10)).toBe(false); // 200 DPI
  });

  it("never warns for SVGs, whatever the math says", () => {
    expect(isLowResolution("svg", 10, 12)).toBe(false);
  });
});
