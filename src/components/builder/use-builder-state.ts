"use client";
/**
 * Builder state for the /design mockup builder (v4): one reducer for the whole design,
 * undo/redo (capped) and sessionStorage persistence so a refresh doesn't lose work.
 *
 * v4: every side holds a stack of LAYERS (bottom → top), each an uploaded image or a text
 * item, reorderable/duplicable/deletable from the layers panel. The design maps 1:1 onto
 * `mockupPayloadSchema` (src/lib/mockup-schema.ts — the POST /api/mockups wire format).
 * What is *not* in the reducer: the artwork Files themselves (kept in memory by the
 * builder; uploaded untouched at send time) and selection state (per view, not on the wire).
 */
import { useEffect, useMemo, useReducer } from "react";
import { z } from "zod";

import {
  artworkTransformSchema,
  MAX_LAYERS_PER_VIEW,
  MOCKUP_ARTWORK_KINDS,
  type MockupColors,
  type MockupLayer,
  type MockupSizes,
  type MockupView,
} from "@/lib/mockup-schema";
import {
  GARMENTS,
  GARMENT_IDS,
  findCombo,
  getGarment,
  isPaletteColor,
  type GarmentConfig,
  isHexColor,
  type GarmentId,
  type PrintArea,
  type ViewId,
} from "@/lib/garments";
import { TEXT_FONT_IDS, type TextFontId } from "@/lib/text-fonts";
import { REFERRAL_SOURCES } from "@/lib/schemas";

export const PERSIST_KEY = "charly.builder.v2";
const PERSIST_VERSION = 2;
/** Undo/redo history cap (docs/04). */
export const HISTORY_LIMIT = 50;

export type BuilderTransform = z.infer<typeof artworkTransformSchema>;
export type BuilderArtworkKind = (typeof MOCKUP_ARTWORK_KINDS)[number];
export type BuilderLayerId = string;

/** Stable client ids for layers (unique within a session; ids are not on the wire). */
let layerIdCounter = 0;
function nextLayerId(): BuilderLayerId {
  layerIdCounter += 1;
  return `layer-${layerIdCounter}`;
}

/** An image layer: one of the builder's uploaded files, placed and transformed. */
export type BuilderImageLayer = {
  id: BuilderLayerId;
  type: "image";
  /** Index into the builder's files array (the wire's `artwork` after densifying). */
  fileIndex: number;
  name: string;
  kind: BuilderArtworkKind;
  naturalWidth: number;
  naturalHeight: number;
  transform: BuilderTransform;
};

/** A text layer: visitor-typed lettering in one of the print-safe fonts. */
export type BuilderTextLayer = {
  id: BuilderLayerId;
  type: "text";
  text: string;
  font: TextFontId;
  color: string;
  outline: { color: string; width: number };
  align: "left" | "center" | "right";
  letterSpacing: number;
  transform: BuilderTransform;
};

export type BuilderLayer = BuilderImageLayer | BuilderTextLayer;

export type BuilderViewState = {
  /** Active print-location id for this view (kept even without layers). */
  printArea: string;
  /** The layer stack, bottom → top. */
  layers: BuilderLayer[];
  /** The selected layer (UI state, not on the wire). */
  selectedLayerId: BuilderLayerId | null;
};

export type BuilderReferral = {
  referralSource?: (typeof REFERRAL_SOURCES)[number];
  referralOther?: string;
};

export type BuilderDesign = {
  garment: GarmentId;
  /** Zone id → hex; covers every zone of the current garment. */
  colors: MockupColors;
  /** Keyed by view id; only views the garment actually has. */
  views: Partial<Record<ViewId, BuilderViewState>>;
  sizes: MockupSizes;
  notes: string;
  referral: BuilderReferral;
};

export type BuilderStep = 1 | 2 | 3 | 4;

export type BuilderState = {
  step: BuilderStep;
  design: BuilderDesign;
  past: BuilderDesign[];
  future: BuilderDesign[];
  /**
   * The `mergeKey` of the last updateLayer, when it had one: consecutive updates with the
   * same key (one slider drag, typing in one field) share a single undo step.
   */
  mergeKey?: string;
};

export type MoveDirection = "up" | "down" | "top" | "bottom";

/** Data needed to add an image layer (the builder supplies the decoded file separately). */
export type ImageLayerInput = {
  fileIndex: number;
  name: string;
  kind: BuilderArtworkKind;
  naturalWidth: number;
  naturalHeight: number;
};

/** Data needed to add a text layer. */
export type TextLayerInput = {
  text: string;
  font: TextFontId;
  color: string;
};

export type BuilderAction =
  | { type: "selectGarment"; garmentId: GarmentId }
  | { type: "setStep"; step: BuilderStep }
  | { type: "setZoneColor"; zone: string; hex: string }
  | { type: "setPrintArea"; view: ViewId; printAreaId: string }
  /** Adds an image layer on top of the given side (capped at MAX_LAYERS_PER_VIEW). */
  | { type: "addImageLayer"; view: ViewId; input: ImageLayerInput }
  /** Adds a text layer on top of the given side (capped at MAX_LAYERS_PER_VIEW). */
  | { type: "addTextLayer"; view: ViewId; input: TextLayerInput }
  /** Partial update of one layer: text fields and/or the transform. */
  | {
      type: "updateLayer";
      view: ViewId;
      layerId: BuilderLayerId;
      patch: Partial<BuilderLayer>;
      /** Consecutive updates with the same key collapse into one undo step (slider drags, typing). */
      mergeKey?: string;
    }
  | { type: "removeLayer"; view: ViewId; layerId: BuilderLayerId }
  /** Duplicates a layer, offset +12px, selecting the copy. */
  | { type: "duplicateLayer"; view: ViewId; layerId: BuilderLayerId }
  /** Reorders within the side's stack. */
  | { type: "moveLayer"; view: ViewId; layerId: BuilderLayerId; to: MoveDirection }
  /** Selection only: not undoable, not on the wire. */
  | { type: "selectLayer"; view: ViewId; layerId: BuilderLayerId | null }
  | { type: "setSize"; size: string; qty: number }
  | { type: "setNotes"; notes: string }
  | { type: "setReferral"; referral: BuilderReferral }
  | { type: "undo" }
  | { type: "redo" }
  /** Restores a design from sessionStorage; clears history. */
  | { type: "hydrate"; step: BuilderStep; design: BuilderDesign };

/** Contain-fit a natural-size image inside a print-area rect, centered. */
export function fitTransform(rect: PrintArea["rect"], naturalWidth: number, naturalHeight: number): BuilderTransform {
  const nw = naturalWidth > 0 ? naturalWidth : rect.w;
  const nh = naturalHeight > 0 ? naturalHeight : rect.w;
  const scale = Math.min(rect.w / nw, rect.h / nh);
  const w = nw * scale;
  const h = nh * scale;
  return {
    x: rect.x + (rect.w - w) / 2,
    y: rect.y + (rect.h - h) / 2,
    width: w,
    height: h,
    rotation: 0,
    flipX: false,
    skewX: 0,
    skewY: 0,
  };
}

/** A fresh design for a garment: default colors, no layers, empty details. */
export function initialDesign(garmentId: GarmentId): BuilderDesign {
  const garment = getGarment(garmentId);
  return {
    garment: garment.id,
    colors: { ...garment.defaultColors },
    views: Object.fromEntries(
      garment.views.map((v) => [v.id, { printArea: v.printAreas[0]!.id, layers: [], selectedLayerId: null }]),
    ),
    sizes: {},
    notes: "",
    referral: {},
  };
}

function withHistory(state: BuilderState, design: BuilderDesign): BuilderState {
  return {
    ...state,
    mergeKey: undefined,
    design,
    past: [...state.past, state.design].slice(-HISTORY_LIMIT),
    future: [],
  };
}

function printAreaRect(design: BuilderDesign, viewId: ViewId): PrintArea["rect"] | undefined {
  const view = getGarment(design.garment).views.find((v) => v.id === viewId);
  const areaId = design.views[viewId]?.printArea ?? view?.printAreas[0]?.id;
  const area = view?.printAreas.find((a) => a.id === areaId) ?? view?.printAreas[0];
  return area?.rect;
}

/** True when the side can take another layer (docs/04 v4: 8 per side). */
export { MAX_LAYERS_PER_VIEW };
export function canAddLayer(viewState: BuilderViewState): boolean {
  return viewState.layers.length < MAX_LAYERS_PER_VIEW;
}

/** Reorders `layers` so `id` moves by `to`; returns null when the move is a no-op. */
function reorder(layers: BuilderLayer[], id: BuilderLayerId, to: MoveDirection): BuilderLayer[] | null {
  const from = layers.findIndex((l) => l.id === id);
  if (from === -1) return null;
  let toIndex = from;
  if (to === "up") toIndex = from + 1;
  if (to === "down") toIndex = from - 1;
  if (to === "top") toIndex = layers.length - 1;
  if (to === "bottom") toIndex = 0;
  if (toIndex < 0 || toIndex > layers.length - 1 || toIndex === from) return null;
  const next = [...layers];
  const [moved] = next.splice(from, 1);
  next.splice(toIndex, 0, moved!);
  return next;
}

/** The default look of a brand-new text layer (fills the print area's width). */
export function defaultTextLayer(
  rect: PrintArea["rect"],
  input: TextLayerInput,
  transform?: BuilderTransform,
): Omit<BuilderTextLayer, "id"> {
  return {
    type: "text",
    text: input.text,
    font: input.font,
    color: input.color,
    outline: { color: "#000000", width: 0 },
    align: "center",
    letterSpacing: 0,
    transform: transform ?? {
      x: rect.x,
      y: rect.y + (rect.h - 100) / 2,
      width: rect.w,
      height: 100,
      rotation: 0,
      flipX: false,
      skewX: 0,
      skewY: 0,
    },
  };
}

/**
 * Colors for `garment` built from `wanted`, keeping only what the blank actually comes in:
 * single-color garments keep a zone color that's in the palette; combo garments keep the colors
 * only if they form one of the real combos. Everything else falls back to the garment default.
 */
export function realBlankColors(garment: GarmentConfig, wanted: MockupColors): MockupColors {
  if (garment.combos.length > 0) {
    return { ...(findCombo(garment, wanted)?.colors ?? garment.defaultColors) };
  }
  const colors: MockupColors = {};
  for (const zone of garment.colorZones) {
    const hex = wanted[zone.id];
    colors[zone.id] = hex && isPaletteColor(garment, hex) ? hex : garment.defaultColors[zone.id]!;
  }
  return colors;
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "setStep":
      return { ...state, step: action.step };

    case "selectGarment": {
      const garment = getGarment(action.garmentId);
      if (garment.id === state.design.garment) return state;
      // Carry over colors only where the new blank really comes in them; default the rest.
      const colors = realBlankColors(garment, state.design.colors);
      // Print areas and geometry differ per garment: rebuild views and drop layers.
      const views = Object.fromEntries(
        garment.views.map((v) => [v.id, { printArea: v.printAreas[0]!.id, layers: [], selectedLayerId: null }]),
      ) as BuilderDesign["views"];
      const sizes = Object.fromEntries(
        Object.entries(state.design.sizes).filter(([size]) => garment.sizes.includes(size)),
      );
      return withHistory(state, { ...state.design, garment: garment.id, colors, views, sizes });
    }

    case "setZoneColor": {
      if (!isHexColor(action.hex)) return state;
      const colors = { ...state.design.colors, [action.zone]: action.hex };
      return withHistory(state, { ...state.design, colors });
    }

    case "setPrintArea": {
      const current = state.design.views[action.view];
      if (!current || current.printArea === action.printAreaId) return state;
      const rect = printAreaRect(
        {
          ...state.design,
          views: { ...state.design.views, [action.view]: { ...current, printArea: action.printAreaId } },
        },
        action.view,
      );
      // Image layers refit into the new area; text keeps its position (it's anchored).
      const layers = current.layers.map((layer) =>
        layer.type === "image" && rect
          ? { ...layer, transform: fitTransform(rect, layer.naturalWidth, layer.naturalHeight) }
          : layer,
      );
      return withHistory(state, {
        ...state.design,
        views: { ...state.design.views, [action.view]: { ...current, printArea: action.printAreaId, layers } },
      });
    }

    case "addImageLayer": {
      const viewState = state.design.views[action.view];
      if (!viewState || !canAddLayer(viewState)) return state;
      const garment = getGarment(state.design.garment);
      const view = garment.views.find((v) => v.id === action.view)!;
      const area = view.printAreas.find((a) => a.id === viewState.printArea) ?? view.printAreas[0]!;
      const layer: BuilderImageLayer = {
        id: nextLayerId(),
        type: "image",
        fileIndex: action.input.fileIndex,
        name: action.input.name,
        kind: action.input.kind,
        naturalWidth: action.input.naturalWidth,
        naturalHeight: action.input.naturalHeight,
        transform: fitTransform(area.rect, action.input.naturalWidth, action.input.naturalHeight),
      };
      return withHistory(state, {
        ...state.design,
        views: {
          ...state.design.views,
          [action.view]: { ...viewState, layers: [...viewState.layers, layer], selectedLayerId: layer.id },
        },
      });
    }

    case "addTextLayer": {
      const viewState = state.design.views[action.view];
      if (!viewState || !canAddLayer(viewState)) return state;
      const garment = getGarment(state.design.garment);
      const view = garment.views.find((v) => v.id === action.view)!;
      const area = view.printAreas.find((a) => a.id === viewState.printArea) ?? view.printAreas[0]!;
      const layer: BuilderTextLayer = {
        id: nextLayerId(),
        ...defaultTextLayer(area.rect, action.input),
      };
      return withHistory(state, {
        ...state.design,
        views: {
          ...state.design.views,
          [action.view]: { ...viewState, layers: [...viewState.layers, layer], selectedLayerId: layer.id },
        },
      });
    }

    case "updateLayer": {
      const viewState = state.design.views[action.view];
      const layer = viewState?.layers.find((l) => l.id === action.layerId);
      if (!viewState || !layer) return state;
      const layers = viewState.layers.map((l) =>
        l.id === action.layerId ? ({ ...layer, ...action.patch } as BuilderLayer) : l,
      );
      const design = { ...state.design, views: { ...state.design.views, [action.view]: { ...viewState, layers } } };
      if (action.mergeKey && action.mergeKey === state.mergeKey) {
        // Same control still moving: replace the design, keep the undo step from its first move.
        return { ...state, design, future: [] };
      }
      return { ...withHistory(state, design), mergeKey: action.mergeKey };
    }

    case "removeLayer": {
      const viewState = state.design.views[action.view];
      if (!viewState || !viewState.layers.some((l) => l.id === action.layerId)) return state;
      const layers = viewState.layers.filter((l) => l.id !== action.layerId);
      const selectedLayerId = viewState.selectedLayerId === action.layerId ? null : viewState.selectedLayerId;
      return withHistory(state, {
        ...state.design,
        views: { ...state.design.views, [action.view]: { ...viewState, layers, selectedLayerId } },
      });
    }

    case "duplicateLayer": {
      const viewState = state.design.views[action.view];
      const original = viewState?.layers.find((l) => l.id === action.layerId);
      if (!viewState || !original || !canAddLayer(viewState)) return state;
      const copy = {
        ...original,
        id: nextLayerId(),
        transform: {
          ...original.transform,
          x: original.transform.x + 12,
          y: original.transform.y + 12,
        },
      } as BuilderLayer;
      // The copy lands right above the original, and is selected.
      const index = viewState.layers.findIndex((l) => l.id === action.layerId);
      const layers = [...viewState.layers];
      layers.splice(index + 1, 0, copy);
      return withHistory(state, {
        ...state.design,
        views: { ...state.design.views, [action.view]: { ...viewState, layers, selectedLayerId: copy.id } },
      });
    }

    case "moveLayer": {
      const viewState = state.design.views[action.view];
      if (!viewState) return state;
      const layers = reorder(viewState.layers, action.layerId, action.to);
      if (!layers) return state;
      return withHistory(state, {
        ...state.design,
        views: { ...state.design.views, [action.view]: { ...viewState, layers } },
      });
    }

    case "selectLayer": {
      const viewState = state.design.views[action.view];
      if (!viewState) return state;
      if (viewState.selectedLayerId === action.layerId) return state;
      // Selection is UI state: no undo history.
      return {
        ...state,
        design: {
          ...state.design,
          views: { ...state.design.views, [action.view]: { ...viewState, selectedLayerId: action.layerId } },
        },
      };
    }

    // Details are auxiliary: they persist with the design but don't flood undo history.
    case "setSize": {
      const qty = Math.max(0, Math.min(10000, Math.round(action.qty) || 0));
      if ((state.design.sizes[action.size] ?? 0) === qty) return state;
      return { ...state, design: { ...state.design, sizes: { ...state.design.sizes, [action.size]: qty } } };
    }

    case "setNotes":
      return { ...state, design: { ...state.design, notes: action.notes.slice(0, 2000) } };

    case "setReferral":
      return { ...state, design: { ...state.design, referral: action.referral } };

    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...state,
        mergeKey: undefined,
        design: prev,
        past: state.past.slice(0, -1),
        future: [state.design, ...state.future].slice(0, HISTORY_LIMIT),
      };
    }

    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        mergeKey: undefined,
        design: next,
        past: [...state.past, state.design].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      };
    }

    case "hydrate":
      return { step: action.step, design: action.design, past: [], future: [] };

    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/* sessionStorage persistence (design + step only; never the Files)    */
/* ------------------------------------------------------------------ */

const persistedLayerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("image"),
    fileIndex: z.number().int().min(0).max(3),
    name: z.string().max(255),
    kind: z.enum(MOCKUP_ARTWORK_KINDS),
    naturalWidth: z.number().finite().nonnegative(),
    naturalHeight: z.number().finite().nonnegative(),
    transform: artworkTransformSchema,
  }),
  z.object({
    type: z.literal("text"),
    text: z.string().min(1).max(60),
    font: z.enum(TEXT_FONT_IDS),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    outline: z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/), width: z.number().min(0).max(12) }),
    align: z.enum(["left", "center", "right"]),
    letterSpacing: z.number().min(-5).max(40),
    transform: artworkTransformSchema,
  }),
]);

const persistedDesignSchema = z.object({
  garment: z.enum(GARMENT_IDS as [GarmentId, ...GarmentId[]]),
  colors: z.record(z.string().max(20), z.string().refine(isHexColor, "bad hex")),
  views: z.record(
    z.string(),
    z.object({
      printArea: z.string().max(40),
      layers: z.array(persistedLayerSchema).max(MAX_LAYERS_PER_VIEW).default([]),
      selectedLayerId: z.string().max(40).nullable().default(null),
    }),
  ),
  sizes: z.record(z.string().max(8), z.number().int().min(0).max(10000)),
  notes: z.string().max(2000),
  referral: z
    .object({
      referralSource: z.enum(REFERRAL_SOURCES).optional(),
      referralOther: z.string().max(200).optional(),
    })
    .optional(),
});

const persistedStateSchema = z.object({
  version: z.literal(PERSIST_VERSION),
  step: z.number().int().min(1).max(4),
  design: persistedDesignSchema,
});

/**
 * The v1 format (one artwork per view) — migrated into one image layer per side on load,
 * so a design saved before v4 isn't lost.
 */
const persistedV1DesignSchema = z.object({
  garment: z.enum(GARMENT_IDS as [GarmentId, ...GarmentId[]]),
  colors: z.record(z.string().max(20), z.string().refine(isHexColor, "bad hex")),
  views: z.record(
    z.string(),
    z.object({
      printArea: z.string().max(40),
      artwork: z
        .object({
          name: z.string().max(255),
          kind: z.enum(MOCKUP_ARTWORK_KINDS),
          naturalWidth: z.number().finite().nonnegative(),
          naturalHeight: z.number().finite().nonnegative(),
          transform: artworkTransformSchema,
          fileIndex: z.number().int().min(0).max(3),
        })
        .nullable(),
    }),
  ),
  sizes: z.record(z.string().max(8), z.number().int().min(0).max(10000)),
  notes: z.string().max(2000),
  referral: z
    .object({
      referralSource: z.enum(REFERRAL_SOURCES).optional(),
      referralOther: z.string().max(200).optional(),
    })
    .optional(),
});

/** Drop view/size keys that no longer match the garment the design was saved with. */
function sanitizeDesign(parsed: z.infer<typeof persistedDesignSchema>): BuilderDesign {
  const garment = getGarment(parsed.garment);
  const views: BuilderDesign["views"] = {};
  for (const view of garment.views) {
    const saved = parsed.views[view.id];
    const area =
      saved && view.printAreas.some((a) => a.id === saved.printArea) ? saved.printArea : view.printAreas[0]!.id;
    const layers: BuilderLayer[] = (saved?.layers ?? []).map((layer) =>
      layer.type === "image" ? { ...layer, id: nextLayerId() } : { ...layer, id: nextLayerId() },
    );
    const selectedLayerId =
      saved?.selectedLayerId && layers.some((l) => l.id === saved.selectedLayerId) ? saved.selectedLayerId : null;
    views[view.id] = { printArea: area, layers, selectedLayerId };
  }
  const sizes = Object.fromEntries(Object.entries(parsed.sizes).filter(([size]) => garment.sizes.includes(size)));
  const colors = realBlankColors(garment, parsed.colors);
  return {
    garment: parsed.garment,
    colors,
    views,
    sizes,
    notes: parsed.notes,
    referral: parsed.referral ?? {},
  };
}

/** Migrates a v1 saved design (one artwork per view) into the v2 layer format. */
function migrateV1State(raw: unknown): BuilderState | null {
  const parsed = z
    .object({ version: z.literal(1), step: z.number().int().min(1).max(4), design: persistedV1DesignSchema })
    .safeParse(raw);
  if (!parsed.success) return null;
  const garment = getGarment(parsed.data.design.garment);
  const views: BuilderDesign["views"] = {};
  for (const view of garment.views) {
    const saved = parsed.data.design.views[view.id];
    const area =
      saved && view.printAreas.some((a) => a.id === saved.printArea) ? saved.printArea : view.printAreas[0]!.id;
    const layers: BuilderLayer[] =
      saved?.artwork != null
        ? [
            {
              id: nextLayerId(),
              type: "image",
              fileIndex: saved.artwork.fileIndex,
              name: saved.artwork.name,
              kind: saved.artwork.kind,
              naturalWidth: saved.artwork.naturalWidth,
              naturalHeight: saved.artwork.naturalHeight,
              transform: saved.artwork.transform,
            },
          ]
        : [];
    views[view.id] = { printArea: area, layers, selectedLayerId: null };
  }
  const sizes = Object.fromEntries(
    Object.entries(parsed.data.design.sizes).filter(([size]) => garment.sizes.includes(size)),
  );
  return {
    step: Math.min(4, parsed.data.step) as BuilderStep,
    design: {
      garment: parsed.data.design.garment,
      colors: realBlankColors(garment, parsed.data.design.colors),
      views,
      sizes,
      notes: parsed.data.design.notes,
      referral: parsed.data.design.referral ?? {},
    },
    past: [],
    future: [],
  };
}

export function persistBuilderState(state: BuilderState): void {
  try {
    const payload = { version: PERSIST_VERSION, step: state.step, design: state.design };
    sessionStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
  } catch {
    // Private mode / quota: persistence is best-effort only.
  }
}

/** Returns a valid persisted state (migrating v1), or null when absent/corrupt. */
export function loadPersistedBuilderState(): { step: BuilderStep; design: BuilderDesign } | null {
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY);
    if (!raw) {
      // One version back: migrate a pre-v4 design (one artwork per view) into layers.
      const legacy = sessionStorage.getItem("charly.builder.v1");
      if (legacy) {
        const migrated = migrateV1State(JSON.parse(legacy));
        if (migrated) {
          sessionStorage.removeItem("charly.builder.v1");
          persistBuilderState(migrated);
          return { step: migrated.step, design: migrated.design };
        }
      }
      return null;
    }
    const parsed = persistedStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return { step: parsed.data.step as BuilderStep, design: sanitizeDesign(parsed.data.design) };
  } catch {
    return null;
  }
}

function initBuilderState(): BuilderState {
  const restored = loadPersistedBuilderState();
  if (restored) return { step: restored.step, design: restored.design, past: [], future: [] };
  return { step: 1, design: initialDesign(GARMENTS[0]!.id), past: [], future: [] };
}

export function useBuilderState() {
  const [state, dispatch] = useReducer(builderReducer, undefined, initBuilderState);
  useEffect(() => persistBuilderState(state), [state]);
  const api = useMemo(
    () => ({
      state,
      dispatch,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
    }),
    [state],
  );
  return api;
}

/* ------------------------------------------------------------------ */
/* Restoring a design from GET /api/mockups/[id] (deep link)           */
/* ------------------------------------------------------------------ */

/** The design portion of the GET /api/mockups/[id] response (no PII by design). */
export type RestoredDesign = {
  garment: GarmentId;
  colors: Record<string, string>;
  /** `layers` already normalized by mockupViewSchema; image layers' `artwork` indexes `artworks[]`. */
  views: { view: ViewId; printArea: string; layers: MockupLayer[] }[];
  sizes: MockupSizes;
};

/**
 * Wire layers → builder layers: image layers map `artwork` back to the builder's file
 * index. A corrupt transform falls back to `fallback` (the area's fit transform).
 */
function layersFromRestore(
  viewLayers: MockupLayer[],
  fallback: BuilderTransform,
  files: Pick<BuilderImageLayer, "name" | "kind" | "naturalWidth" | "naturalHeight">[],
): BuilderLayer[] {
  return viewLayers.map((layer) => {
    const transform = artworkTransformSchema.safeParse(layer.transform).success
      ? (artworkTransformSchema.parse(layer.transform) as BuilderTransform)
      : fallback;
    return layer.type === "image"
      ? ({
          id: nextLayerId(),
          type: "image",
          fileIndex: layer.artwork,
          name: files[layer.artwork]?.name ?? "your-design.png",
          kind: files[layer.artwork]?.kind ?? "png",
          naturalWidth: files[layer.artwork]?.naturalWidth ?? 0,
          naturalHeight: files[layer.artwork]?.naturalHeight ?? 0,
          transform,
        } satisfies BuilderImageLayer)
      : ({
          id: nextLayerId(),
          type: "text",
          text: layer.text,
          font: layer.font,
          color: layer.color,
          outline: layer.outline,
          align: layer.align,
          letterSpacing: layer.letterSpacing,
          transform,
        } as BuilderTextLayer);
  });
}

/**
 * Rebuilds a BuilderDesign from the restore endpoint's response. Only keys that match the
 * garment survive (views, print areas, layers, sizes); anything unknown falls back to the
 * garment defaults, and corrupt transforms re-fit to the area. Image layers keep their
 * `artwork` index as `fileIndex` into the builder's restored files array.
 */
export function designFromRestore(
  restored: RestoredDesign,
  /** The restored files (same order as the response's `artworks[]`): names + sizes for image layers. */
  files: Pick<BuilderImageLayer, "name" | "kind" | "naturalWidth" | "naturalHeight">[] = [],
): BuilderDesign {
  const garment = getGarment(restored.garment);
  const byView = new Map(restored.views.map((v) => [v.view, v]));
  const views: BuilderDesign["views"] = {};
  for (const view of garment.views) {
    const saved = byView.get(view.id);
    const areaId =
      saved && view.printAreas.some((a) => a.id === saved.printArea) ? saved.printArea : view.printAreas[0]!.id;
    const area = view.printAreas.find((a) => a.id === areaId)!;
    views[view.id] = {
      printArea: areaId,
      layers: saved
        ? layersFromRestore(saved.layers, fitTransform(area.rect, 600, 300), files).filter(
            // An image layer whose file didn't come back can't be drawn or re-sent: drop it.
            (l) => l.type === "text" || files[l.fileIndex],
          )
        : [],
      selectedLayerId: null,
    };
  }
  const sizes = Object.fromEntries(
    Object.entries(restored.sizes).filter(
      ([size, qty]) => garment.sizes.includes(size) && Number.isInteger(qty) && qty > 0 && qty <= 10000,
    ),
  );
  const colors: MockupColors = {};
  for (const zone of garment.colorZones) {
    colors[zone.id] = isHexColor(restored.colors[zone.id] ?? "")
      ? restored.colors[zone.id]!
      : (garment.defaultColors[zone.id] ?? "#f4f4f4");
  }
  return { garment: garment.id, colors, views, sizes, notes: "", referral: {} };
}

/* ------------------------------------------------------------------ */
/* Mapping onto the /api/mockups payload                               */
/* ------------------------------------------------------------------ */

export type MockupPayloadDesign = Pick<
  import("@/lib/mockup-schema").MockupPayload,
  "garment" | "colors" | "views" | "sizes" | "notes"
>;

/**
 * The builder's file indexes the design's image layers reference (optionally excluding one
 * side, e.g. the side being cleared) — used to drop uploaded files no layer uses anymore.
 */
export function usedFileIndexes(design: BuilderDesign, exceptView?: ViewId): Set<number> {
  const out = new Set<number>();
  for (const [view, state] of Object.entries(design.views)) {
    if (view === exceptView) continue;
    for (const layer of state?.layers ?? []) {
      if (layer.type === "image") out.add(layer.fileIndex);
    }
  }
  return out;
}

/**
 * The design portion of the payload plus the artwork plan (v4): only sides with at least
 * one layer, each side's `layers` in stack order, and image layers' `artwork` indexes made
 * dense (0..n-1) in first-use order across the sides. `filesInUse` lists the builder's file
 * indexes in that same order, so the builder appends file `filesInUse[i]` as `artwork-<i>`.
 * A text-only design yields `filesInUse: []` — no upload needed.
 */
export function payloadPlan(design: BuilderDesign): {
  payload: MockupPayloadDesign;
  filesInUse: number[];
} {
  const garment = getGarment(design.garment);
  const views: MockupView[] = [];
  const filesInUse: number[] = [];
  for (const view of garment.views) {
    const saved = design.views[view.id];
    if (!saved || saved.layers.length === 0) continue;
    const layers: MockupLayer[] = saved.layers.map((layer) => {
      if (layer.type === "text") {
        return {
          type: "text",
          text: layer.text,
          font: layer.font,
          color: layer.color,
          outline: layer.outline,
          align: layer.align,
          letterSpacing: layer.letterSpacing,
          transform: layer.transform,
        };
      }
      let dense = filesInUse.indexOf(layer.fileIndex);
      if (dense === -1) {
        filesInUse.push(layer.fileIndex);
        dense = filesInUse.length - 1;
      }
      return { type: "image", artwork: dense, transform: layer.transform };
    });
    views.push({
      view: view.id,
      printArea: saved.printArea,
      layers,
    });
  }
  return {
    payload: {
      garment: design.garment,
      colors: design.colors,
      views,
      sizes: design.sizes,
      notes: design.notes.trim() ? design.notes.trim() : undefined,
    },
    filesInUse,
  };
}
