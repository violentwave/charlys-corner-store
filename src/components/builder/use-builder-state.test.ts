import { describe, expect, it } from "vitest";

import { getGarment } from "@/lib/garments";
import { mockupPayloadSchema } from "@/lib/mockup-schema";

import {
  builderReducer,
  canAddLayer,
  designFromRestore,
  fitTransform,
  initialDesign,
  loadPersistedBuilderState,
  MAX_LAYERS_PER_VIEW,
  PERSIST_KEY,
  payloadPlan,
  persistBuilderState,
  usedFileIndexes,
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

const imageInput = (fileIndex = 0, name = "art.png") => ({
  fileIndex,
  name,
  kind: "png" as const,
  naturalWidth: 600,
  naturalHeight: 300,
});

const textInput = (text = "Your text") => ({ text, font: "anton" as const, color: "#000000" });

describe("builderReducer — layers (v4)", () => {
  it("adds an image layer fitted and centered in the active print area, selected", () => {
    const state = builderReducer(start(), { type: "addImageLayer", view: "front", input: imageInput(0) });
    const front = state.design.views.front!;
    expect(front.layers).toHaveLength(1);
    const layer = front.layers[0]!;
    expect(layer.type).toBe("image");
    // The initial print area is the front view's first: Front Chest (260×130).
    const chest = getGarment("tshirt").views[0]!.printAreas[0]!.rect;
    expect(chest).toEqual({ x: 370, y: 292, w: 260, h: 130 });
    // 600×300 fits at scale 0.433 → 260×130, centered.
    expect(layer.type === "image" && layer.transform.width).toBeCloseTo(260);
    expect(layer.type === "image" && layer.transform.height).toBeCloseTo(130);
    expect(front.selectedLayerId).toBe(layer.id);
  });

  it("adds a text layer with the requested copy, selected", () => {
    const state = builderReducer(start(), {
      type: "addTextLayer",
      view: "front",
      input: textInput("Ruff summer"),
    });
    const layer = state.design.views.front!.layers[0]!;
    expect(layer.type).toBe("text");
    expect(layer.type === "text" && layer.text).toBe("Ruff summer");
    expect(layer.type === "text" && layer.font).toBe("anton");
    expect(state.design.views.front!.selectedLayerId).toBe(layer.id);
  });

  it("an upload on the back doesn't touch the front (per-side layers)", () => {
    let state = builderReducer(start(), { type: "addImageLayer", view: "front", input: imageInput(0, "front.png") });
    const frontBefore = state.design.views.front!.layers[0]!;
    state = builderReducer(state, {
      type: "addImageLayer",
      view: "back",
      input: imageInput(1, "back.png"),
    });
    expect(state.design.views.front!.layers[0]).toEqual(frontBefore);
    const back = state.design.views.back!.layers[0]!;
    expect(back.type === "image" && back.fileIndex).toBe(1);
  });

  it("updates a layer partially (transform and text fields)", () => {
    let state = builderReducer(start(), { type: "addTextLayer", view: "front", input: textInput("Ruff") });
    const layerId = state.design.views.front!.layers[0]!.id;
    state = builderReducer(state, {
      type: "updateLayer",
      view: "front",
      layerId,
      patch: {
        text: "Ruff summer",
        color: "#ffffff",
        transform: { x: 10, y: 20, width: 300, height: 120, rotation: 15, flipX: false, skewX: 0.3, skewY: 0 },
      },
    });
    const layer = state.design.views.front!.layers[0]!;
    expect(layer.type === "text" && layer.text).toBe("Ruff summer");
    expect(layer.type === "text" && layer.color).toBe("#ffffff");
    expect(layer.transform.rotation).toBe(15);
    expect(layer.transform.skewX).toBe(0.3);
  });

  it("removes a layer and clears its selection", () => {
    let state = builderReducer(start(), { type: "addImageLayer", view: "front", input: imageInput(0) });
    const layerId = state.design.views.front!.layers[0]!.id;
    state = builderReducer(state, { type: "removeLayer", view: "front", layerId });
    expect(state.design.views.front!.layers).toHaveLength(0);
    expect(state.design.views.front!.selectedLayerId).toBeNull();
  });

  it("duplicates a layer offset +12px, selecting the copy above the original", () => {
    let state = builderReducer(start(), { type: "addTextLayer", view: "front", input: textInput("Ruff") });
    const originalId = state.design.views.front!.layers[0]!.id;
    state = builderReducer(state, { type: "duplicateLayer", view: "front", layerId: originalId });

    const layers = state.design.views.front!.layers;
    expect(layers).toHaveLength(2);
    expect(layers[0]!.id).toBe(originalId); // stays at the bottom
    const copy = layers[1]!;
    expect(copy.id).not.toBe(originalId);
    expect(state.design.views.front!.selectedLayerId).toBe(copy.id);
    const original = layers[0]!;
    expect(copy.transform.x).toBe(original.transform.x + 12);
    expect(copy.transform.y).toBe(original.transform.y + 12);
  });

  it("moveLayer reorders the stack up/down/top/bottom (bottom → top)", () => {
    let state = builderReducer(start(), { type: "addImageLayer", view: "front", input: imageInput(0, "a.png") });
    state = builderReducer(state, { type: "addTextLayer", view: "front", input: textInput("B") });
    state = builderReducer(state, { type: "addImageLayer", view: "front", input: imageInput(1, "c.png") });
    const [a, b, c] = state.design.views.front!.layers;

    // Top layer can't move up; bottom can't move down.
    expect(
      builderReducer(state, { type: "moveLayer", view: "front", layerId: c!.id, to: "up" }).design.views.front!.layers,
    ).toEqual(state.design.views.front!.layers);
    expect(
      builderReducer(state, { type: "moveLayer", view: "front", layerId: a!.id, to: "down" }).design.views.front!
        .layers,
    ).toEqual(state.design.views.front!.layers);

    // Up: B goes above C. Down: back again.
    let moved = builderReducer(state, { type: "moveLayer", view: "front", layerId: b!.id, to: "up" });
    expect(moved.design.views.front!.layers.map((l) => l.id)).toEqual([a!.id, c!.id, b!.id]);
    moved = builderReducer(moved, { type: "moveLayer", view: "front", layerId: b!.id, to: "down" });
    expect(moved.design.views.front!.layers.map((l) => l.id)).toEqual([a!.id, b!.id, c!.id]);

    // Top and bottom.
    moved = builderReducer(moved, { type: "moveLayer", view: "front", layerId: a!.id, to: "top" });
    expect(moved.design.views.front!.layers.map((l) => l.id)).toEqual([b!.id, c!.id, a!.id]);
    moved = builderReducer(moved, { type: "moveLayer", view: "front", layerId: a!.id, to: "bottom" });
    expect(moved.design.views.front!.layers.map((l) => l.id)).toEqual([a!.id, b!.id, c!.id]);
  });

  it("selectLayer changes only the selection, without history", () => {
    let state = builderReducer(start(), { type: "addImageLayer", view: "front", input: imageInput(0) });
    const layerId = state.design.views.front!.layers[0]!.id;
    state = builderReducer(state, { type: "selectLayer", view: "front", layerId: null });
    expect(state.design.views.front!.selectedLayerId).toBeNull();
    expect(state.past).toHaveLength(1); // just the add
    void layerId;
  });

  it("enforces the 8-layer cap per side (canAddLayer + reducer)", () => {
    let state = start();
    for (let i = 0; i < MAX_LAYERS_PER_VIEW; i++) {
      state = builderReducer(state, { type: "addTextLayer", view: "front", input: textInput(`Text ${i}`) });
    }
    expect(canAddLayer(state.design.views.front!)).toBe(false);
    const before = state.design.views.front!.layers;
    state = builderReducer(state, { type: "addTextLayer", view: "front", input: textInput("One too many") });
    expect(state.design.views.front!.layers).toEqual(before); // rejected
  });

  it("all layer actions are undoable", () => {
    let state = builderReducer(start(), { type: "addTextLayer", view: "front", input: textInput("Ruff") });
    const layerId = state.design.views.front!.layers[0]!.id;
    state = builderReducer(state, { type: "duplicateLayer", view: "front", layerId });
    state = builderReducer(state, { type: "removeLayer", view: "front", layerId });
    expect(state.design.views.front!.layers).toHaveLength(1);
    state = builderReducer(state, { type: "undo" });
    expect(state.design.views.front!.layers).toHaveLength(2); // back to before the remove
    state = builderReducer(state, { type: "undo" });
    expect(state.design.views.front!.layers).toHaveLength(1); // before the duplicate
  });
});

describe("builderReducer — garment step and colors", () => {
  it("selecting a garment never moves the step (Continue-only, v3)", () => {
    const state = builderReducer(start(), { type: "selectGarment", garmentId: "hoodie" });
    expect(state.step).toBe(3);
  });

  it("sets a zone color when it is a valid hex and ignores garbage", () => {
    let state = builderReducer(start(), { type: "setZoneColor", zone: "body", hex: "#d50032" });
    expect(state.design.colors.body).toBe("#d50032");
    state = builderReducer(state, { type: "setZoneColor", zone: "body", hex: "neon" });
    expect(state.design.colors.body).toBe("#d50032");
  });

  it("carries shared zone colors on a garment switch, defaults new zones, clears layers", () => {
    let state = builderReducer(start(), { type: "setZoneColor", zone: "body", hex: "#d50032" });
    state = builderReducer(state, { type: "addImageLayer", view: "front", input: imageInput(0) });
    state = builderReducer(state, { type: "selectGarment", garmentId: "raglan" });
    expect(state.design.garment).toBe("raglan");
    expect(state.design.colors).toEqual(getGarment("raglan").defaultColors);
    expect(state.design.views.front?.layers).toEqual([]); // geometry differs per garment
    expect(state.past).toHaveLength(3); // color + layer + garment switch
  });
});

describe("payloadPlan (the /api/mockups artwork plan, v4)", () => {
  it("maps the design 1:1 onto mockupPayloadSchema's design portion", () => {
    let state = builderReducer(start(), { type: "setZoneColor", zone: "body", hex: "#d50032" });
    state = builderReducer(state, { type: "addImageLayer", view: "front", input: imageInput(0) });
    state = builderReducer(state, { type: "setPrintArea", view: "front", printAreaId: "left-chest" });
    state = builderReducer(state, { type: "setSize", size: "XL", qty: 2 });
    state = builderReducer(state, { type: "setNotes", notes: "  Gildan please  " });

    const { payload } = payloadPlan(state.design);
    const result = mockupPayloadSchema.safeParse({
      ...payload,
      referralSource: state.design.referral.referralSource,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.views[0]?.layers).toEqual([
      {
        type: "image",
        artwork: 0,
        transform:
          state.design.views.front!.layers[0]!.type === "image" ? state.design.views.front!.layers[0]!.transform : {},
      },
    ]);
    expect(result.success && result.data.notes).toBe("Gildan please");
  });

  it("only includes sides that carry layers", () => {
    const { payload, filesInUse } = payloadPlan(start().design);
    expect(payload.views).toEqual([]);
    expect(filesInUse).toEqual([]);
  });

  it("assigns dense artwork indexes across several image layers, in first-use order", () => {
    // Long sleeve: front uses file 1, the left sleeve uses file 0 — first use wins.
    let state = builderReducer(start(), { type: "selectGarment", garmentId: "longsleeve" });
    state = builderReducer(state, { type: "addImageLayer", view: "front", input: imageInput(1, "front.png") });
    state = builderReducer(state, { type: "addImageLayer", view: "left", input: imageInput(0, "sleeve.png") });

    const { payload, filesInUse } = payloadPlan(state.design);
    const [front, left] = payload.views;
    expect(front.view).toBe("front");
    expect(front.layers[0]).toEqual({ type: "image", artwork: 0, transform: expect.anything() });
    expect(left.view).toBe("left");
    expect(left.layers[0]).toEqual({ type: "image", artwork: 1, transform: expect.anything() });
    // File 1 goes on the wire first (artwork-0), then file 0 (artwork-1).
    expect(filesInUse).toEqual([1, 0]);
  });

  it("a text-only design passes the payload schema with zero files", () => {
    let state = builderReducer(start(), { type: "addTextLayer", view: "front", input: textInput("Ruff summer") });
    state = builderReducer(state, {
      type: "updateLayer",
      view: "front",
      layerId: state.design.views.front!.layers[0]!.id,
      patch: {
        color: "#ffffff",
        outline: { color: "#000000", width: 3 },
        transform: {
          x: 350,
          y: 300,
          width: 300,
          height: 120,
          rotation: -20,
          flipX: false,
          skewX: -0.45,
          skewY: 0,
        },
      },
    });

    const { payload, filesInUse } = payloadPlan(state.design);
    expect(filesInUse).toEqual([]);
    const result = mockupPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    expect(result.success && result.data.views[0]?.layers[0]).toMatchObject({
      type: "text",
      text: "Ruff summer",
      font: "anton",
      color: "#ffffff",
      outline: { color: "#000000", width: 3 },
      transform: { skewX: -0.45, height: 120, width: 300 },
    });
  });

  it("several layers per side keep their stack order", () => {
    let state = builderReducer(start(), { type: "addImageLayer", view: "front", input: imageInput(0) });
    state = builderReducer(state, { type: "addTextLayer", view: "front", input: textInput("On top") });

    const { payload } = payloadPlan(state.design);
    expect(payload.views[0]!.layers.map((l) => l.type)).toEqual(["image", "text"]);
  });
});

describe("usedFileIndexes (file cleanup)", () => {
  it("collects every image layer's file across sides, and can exclude one side", () => {
    let state = builderReducer(start(), { type: "addImageLayer", view: "front", input: imageInput(0) });
    state = builderReducer(state, { type: "addImageLayer", view: "back", input: imageInput(2) });
    expect(usedFileIndexes(state.design)).toEqual(new Set([0, 2]));
    expect(usedFileIndexes(state.design, "back")).toEqual(new Set([0]));
  });
});

describe("sessionStorage round-trip (jsdom)", () => {
  it("restores design + step with per-side layers and file indexes", () => {
    let state = builderReducer(start(), { type: "setZoneColor", zone: "body", hex: "#d50032" });
    state = builderReducer(state, { type: "addImageLayer", view: "front", input: imageInput(0) });
    state = builderReducer(state, { type: "addTextLayer", view: "back", input: textInput("Back print") });
    persistBuilderState(state);

    const restored = loadPersistedBuilderState();
    expect(restored).not.toBeNull();
    expect(restored!.step).toBe(3);
    expect(restored!.design.colors.body).toBe("#d50032");
    expect(restored!.design.views.front?.layers[0]?.type).toBe("image");
    expect(
      restored!.design.views.front?.layers[0]?.type === "image" && restored!.design.views.front?.layers[0]?.fileIndex,
    ).toBe(0);
    expect(restored!.design.views.back?.layers[0]?.type).toBe("text");
    expect(
      restored!.design.views.back?.layers[0]?.type === "text" && restored!.design.views.back?.layers[0]?.text,
    ).toBe("Back print");
  });

  it("migrates a v1 saved design (one artwork per view) into one image layer", () => {
    // Build a v1 payload by hand: one artwork per view, no layers.
    sessionStorage.setItem(
      "charly.builder.v1",
      JSON.stringify({
        version: 1,
        step: 3,
        design: {
          garment: "tshirt",
          colors: { body: "#d50032" },
          views: {
            front: {
              printArea: "full-front",
              artwork: {
                name: "art.png",
                kind: "png",
                naturalWidth: 600,
                naturalHeight: 300,
                transform: {
                  x: 344,
                  y: 292,
                  width: 312,
                  height: 364,
                  rotation: 0,
                  flipX: false,
                  skewX: 0,
                  skewY: 0,
                },
                fileIndex: 0,
              },
            },
          },
          sizes: { M: 2 },
          notes: "saved before v4",
          referral: {},
        },
      }),
    );
    const migrated = loadPersistedBuilderState();
    expect(migrated).not.toBeNull();
    expect(migrated!.design.views.front?.layers).toHaveLength(1);
    const layer = migrated!.design.views.front!.layers[0]!;
    expect(layer.type).toBe("image");
    expect(layer.type === "image" && layer.fileIndex).toBe(0);
    expect(layer.type === "image" && layer.name).toBe("art.png");
    expect(migrated!.design.colors.body).toBe("#d50032");
    // The migrated design is persisted in the v2 format for the next visit.
    expect(sessionStorage.getItem(PERSIST_KEY)).toContain('"version":2');
  });

  it("returns null for corrupt or missing data", () => {
    sessionStorage.removeItem(PERSIST_KEY);
    sessionStorage.removeItem("charly.builder.v1");
    expect(loadPersistedBuilderState()).toBeNull();
    sessionStorage.setItem(PERSIST_KEY, "{not json");
    expect(loadPersistedBuilderState()).toBeNull();
  });
});

describe("designFromRestore (deep link, v4: layers)", () => {
  const restoredFiles = [{ name: "art.png", kind: "png" as const, naturalWidth: 1800, naturalHeight: 2100 }];

  it("drops image layers whose file didn't come back (text layers stay)", () => {
    const design = designFromRestore({
      garment: "tshirt",
      colors: { body: "#ffffff" },
      views: [
        {
          view: "front",
          printArea: "full-front",
          layers: [
            { type: "image", artwork: 0, transform: fitTransform({ x: 344, y: 292, w: 312, h: 364 }, 600, 300) },
            {
              type: "text",
              text: "RUFF",
              font: "anton",
              color: "#000000",
              outline: { color: "#000000", width: 0 },
              align: "center",
              letterSpacing: 0,
              transform: fitTransform({ x: 344, y: 292, w: 312, h: 364 }, 300, 100),
            },
          ],
        },
      ],
      sizes: {},
    });
    expect(design.views.front!.layers.map((l) => l.type)).toEqual(["text"]);
  });

  it("rebuilds layered sides from the API response", () => {
    const design = designFromRestore(
      {
        garment: "longsleeve",
        colors: { body: "#263147" },
        views: [
          {
            view: "left",
            printArea: "full-sleeve",
            layers: [
              {
                type: "text",
                text: "RUFF",
                font: "anton",
                color: "#ffffff",
                outline: { color: "#000000", width: 2 },
                align: "center",
                letterSpacing: 4,
                transform: {
                  x: 425,
                  y: 300,
                  width: 140,
                  height: 420,
                  rotation: 0,
                  flipX: false,
                  skewX: -0.45,
                  skewY: 0,
                },
              },
            ],
          },
          {
            view: "front",
            printArea: "full-front",
            layers: [
              {
                type: "image",
                artwork: 0,
                transform: { x: 350, y: 290, width: 300, height: 350, rotation: 0, flipX: false, skewX: 0, skewY: 0 },
              },
            ],
          },
        ],
        sizes: { M: 2 },
      },
      restoredFiles,
    );

    const left = design.views.left!;
    expect(left.layers[0]!.type).toBe("text");
    const textLayer = left.layers[0]!;
    expect(textLayer.type === "text" && textLayer.text).toBe("RUFF");
    expect(textLayer.type === "text" && textLayer.transform.skewX).toBe(-0.45);

    const front = design.views.front!;
    expect(front.layers[0]!.type).toBe("image");
    // The image layer's fileIndex points into the builder's restored files array.
    expect(front.layers[0]!.type === "image" && front.layers[0]!.fileIndex).toBe(0);
    // ...and carries the restored file's name and size (DPI warning, layer names, persistence).
    expect(front.layers[0]).toMatchObject({ name: "art.png", naturalWidth: 1800, naturalHeight: 2100 });

    const { payload } = payloadPlan(design);
    const result = mockupPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("falls back to garment defaults for unknown zones, print areas and sizes", () => {
    const design = designFromRestore(
      {
        garment: "hat",
        colors: { body: "#d50032", notAZone: "#000000" },
        views: [
          {
            view: "front",
            printArea: "made-up-area",
            layers: [
              {
                type: "image",
                artwork: 0,
                transform: { ...fitTransform({ x: 0, y: 0, w: 100, h: 100 }, 600, 300), rotation: 999 },
              },
            ],
          },
        ],
        sizes: { OSFA: 3, "2XL": 5 },
      },
      restoredFiles,
    );
    expect(design.colors.front).toBe(getGarment("hat").defaultColors.front);
    expect(design.colors.notAZone).toBeUndefined();
    const front = design.views.front!;
    expect(front.printArea).toBe("hat-front"); // unknown area → the view's first
    // A corrupt transform (rotation outside ±360) re-fits into the area instead.
    expect(front.layers[0]!.type === "image" && front.layers[0]!.transform.rotation).toBe(0);
    expect(design.sizes).toEqual({ OSFA: 3 }); // 2XL isn't a hat size
  });
});

describe("undo grouping (mergeKey)", () => {
  it("one slider drag is one undo step; another control starts a new one", () => {
    let state = builderReducer(start(), { type: "addTextLayer", view: "front", input: textInput() });
    const id = state.design.views.front!.layers[0]!.id;
    const t = state.design.views.front!.layers[0]!.transform;
    const pastAfterAdd = state.past.length;
    for (const skewX of [0.1, 0.2, 0.3]) {
      state = builderReducer(state, {
        type: "updateLayer",
        view: "front",
        layerId: id,
        patch: { transform: { ...t, skewX } },
        mergeKey: `${id}:skewX`,
      });
    }
    expect(state.past.length).toBe(pastAfterAdd + 1);
    state = builderReducer(state, {
      type: "updateLayer",
      view: "front",
      layerId: id,
      patch: { transform: { ...t, skewX: 0.3, rotation: 10 } },
      mergeKey: `${id}:rotate`,
    });
    expect(state.past.length).toBe(pastAfterAdd + 2);

    state = builderReducer(state, { type: "undo" });
    expect(state.design.views.front!.layers[0]!.transform.skewX).toBe(0.3);
    state = builderReducer(state, { type: "undo" });
    expect(state.design.views.front!.layers[0]!.transform.skewX).toBe(0);
  });

  it("after an undo, the same control starts a fresh step", () => {
    let state = builderReducer(start(), { type: "addTextLayer", view: "front", input: textInput() });
    const id = state.design.views.front!.layers[0]!.id;
    const t = state.design.views.front!.layers[0]!.transform;
    const move = (s: BuilderState, rotation: number) =>
      builderReducer(s, {
        type: "updateLayer",
        view: "front",
        layerId: id,
        patch: { transform: { ...t, rotation } },
        mergeKey: `${id}:rotate`,
      });
    state = move(state, 10);
    state = builderReducer(state, { type: "undo" });
    const pastLen = state.past.length;
    state = move(state, 20);
    expect(state.past.length).toBe(pastLen + 1);
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
    expect(t.skewX).toBe(0);
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
