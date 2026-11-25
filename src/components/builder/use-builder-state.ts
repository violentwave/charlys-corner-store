"use client";
/**
 * Builder state for the /design mockup builder: one reducer for the whole design,
 * undo/redo (capped) and sessionStorage persistence so a refresh doesn't lose work.
 *
 * The design maps 1:1 onto `mockupPayloadSchema` (src/lib/mockup-schema.ts — the
 * POST /api/mockups wire format). What is *not* in the reducer: the artwork File
 * itself (kept in memory by the builder; it is uploaded untouched in P4-2) and
 * transient UI state (selection, current zoom). Transform coordinates are template
 * pixels as defined by `artworkTransformSchema` (x/y = top-left before rotation).
 */
import { useEffect, useMemo, useReducer } from "react";
import { z } from "zod";

import {
  artworkTransformSchema,
  MOCKUP_ARTWORK_KINDS,
  type MockupColors,
  type MockupSizes,
  type MockupView,
} from "@/lib/mockup-schema";
import {
  GARMENTS,
  GARMENT_IDS,
  getGarment,
  isHexColor,
  type GarmentId,
  type PrintArea,
  type ViewId,
} from "@/lib/garments";
import { REFERRAL_SOURCES } from "@/lib/schemas";

export const PERSIST_KEY = "charly.builder.v1";
const PERSIST_VERSION = 1;
/** Undo/redo history cap (docs/04). */
export const HISTORY_LIMIT = 50;

export type BuilderTransform = z.infer<typeof artworkTransformSchema>;
export type BuilderArtworkKind = (typeof MOCKUP_ARTWORK_KINDS)[number];

/** Everything the builder remembers about an uploaded design on one view. */
export type ArtworkMeta = {
  name: string;
  kind: BuilderArtworkKind;
  naturalWidth: number;
  naturalHeight: number;
  transform: BuilderTransform;
};

export type BuilderViewState = {
  /** Active print-location id for this view (kept even without artwork). */
  printArea: string;
  /** Artwork placed on this view. The File lives outside the reducer. */
  artwork: ArtworkMeta | null;
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

export type BuilderStep = 1 | 2 | 3 | 4 | 5;

export type BuilderState = {
  step: BuilderStep;
  design: BuilderDesign;
  past: BuilderDesign[];
  future: BuilderDesign[];
};

export type BuilderAction =
  | { type: "selectGarment"; garmentId: GarmentId }
  | { type: "setStep"; step: BuilderStep }
  | { type: "setZoneColor"; zone: string; hex: string }
  | { type: "setPrintArea"; view: ViewId; printAreaId: string }
  /** Places (or re-links) artwork on the given views, fitted into each view's active print area. */
  | { type: "placeArtwork"; views: ViewId[]; meta: Omit<ArtworkMeta, "transform"> }
  | { type: "setTransform"; view: ViewId; transform: BuilderTransform }
  | { type: "removeArtwork"; view: ViewId }
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
  };
}

/** A fresh design for a garment: default colors, no artwork, empty details. */
export function initialDesign(garmentId: GarmentId): BuilderDesign {
  const garment = getGarment(garmentId);
  return {
    garment: garment.id,
    colors: { ...garment.defaultColors },
    views: Object.fromEntries(garment.views.map((v) => [v.id, { printArea: v.printAreas[0]!.id, artwork: null }])),
    sizes: {},
    notes: "",
    referral: {},
  };
}

function withHistory(state: BuilderState, design: BuilderDesign): BuilderState {
  return {
    ...state,
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

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "setStep":
      return { ...state, step: action.step };

    case "selectGarment": {
      const garment = getGarment(action.garmentId);
      if (garment.id === state.design.garment) return state;
      // Carry over colors for zones the new garment also has; default the rest.
      const colors: MockupColors = {};
      for (const zone of garment.colorZones) {
        colors[zone.id] = state.design.colors[zone.id] ?? garment.defaultColors[zone.id] ?? "#f4f4f4";
      }
      // Print areas and geometry differ per garment: rebuild views and drop artwork.
      const views = Object.fromEntries(
        garment.views.map((v) => [v.id, { printArea: v.printAreas[0]!.id, artwork: null }]),
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
      const artwork =
        current.artwork && rect
          ? {
              ...current.artwork,
              transform: fitTransform(rect, current.artwork.naturalWidth, current.artwork.naturalHeight),
            }
          : null;
      return withHistory(state, {
        ...state.design,
        views: { ...state.design.views, [action.view]: { printArea: action.printAreaId, artwork } },
      });
    }

    case "placeArtwork": {
      const garment = getGarment(state.design.garment);
      const views = { ...state.design.views };
      for (const viewId of action.views) {
        const view = garment.views.find((v) => v.id === viewId);
        if (!view) continue;
        const current = views[viewId];
        const area = view.printAreas.find((a) => a.id === current?.printArea) ?? view.printAreas[0]!;
        views[viewId] = {
          printArea: area.id,
          artwork: {
            ...action.meta,
            transform: fitTransform(area.rect, action.meta.naturalWidth, action.meta.naturalHeight),
          },
        };
      }
      return withHistory(state, { ...state.design, views });
    }

    case "setTransform": {
      const current = state.design.views[action.view];
      if (!current?.artwork) return state;
      return withHistory(state, {
        ...state.design,
        views: {
          ...state.design.views,
          [action.view]: { ...current, artwork: { ...current.artwork, transform: action.transform } },
        },
      });
    }

    case "removeArtwork": {
      const current = state.design.views[action.view];
      if (!current?.artwork) return state;
      return withHistory(state, {
        ...state.design,
        views: { ...state.design.views, [action.view]: { ...current, artwork: null } },
      });
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
/* sessionStorage persistence (design + step only; never the File)     */
/* ------------------------------------------------------------------ */

const persistedDesignSchema = z.object({
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

const persistedStateSchema = z.object({
  version: z.literal(PERSIST_VERSION),
  step: z.number().int().min(1).max(5),
  design: persistedDesignSchema,
});

/** Drop view/size keys that no longer match the garment the design was saved with. */
function sanitizeDesign(parsed: z.infer<typeof persistedDesignSchema>): BuilderDesign {
  const garment = getGarment(parsed.garment);
  const views: BuilderDesign["views"] = {};
  for (const view of garment.views) {
    const saved = parsed.views[view.id];
    const area =
      saved && view.printAreas.some((a) => a.id === saved.printArea) ? saved.printArea : view.printAreas[0]!.id;
    views[view.id] = { printArea: area, artwork: saved?.artwork ?? null };
  }
  const sizes = Object.fromEntries(Object.entries(parsed.sizes).filter(([size]) => garment.sizes.includes(size)));
  const colors: MockupColors = {};
  for (const zone of garment.colorZones) {
    colors[zone.id] = parsed.colors[zone.id] ?? garment.defaultColors[zone.id] ?? "#f4f4f4";
  }
  return {
    garment: parsed.garment,
    colors,
    views,
    sizes,
    notes: parsed.notes,
    referral: parsed.referral ?? {},
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

/** Returns a valid persisted state, or null when absent/corrupt/mismatched. */
export function loadPersistedBuilderState(): { step: BuilderStep; design: BuilderDesign } | null {
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
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
  views: { view: ViewId; printArea: string; transform: BuilderTransform }[];
  sizes: MockupSizes;
};

/**
 * Rebuilds a BuilderDesign from the restore endpoint's response. Only keys that
 * match the garment survive (views, print areas, sizes, zones); anything unknown
 * falls back to the garment defaults, and corrupt transforms re-fit to the area.
 */
export function designFromRestore(restored: RestoredDesign, meta: Omit<ArtworkMeta, "transform">): BuilderDesign {
  const garment = getGarment(restored.garment);
  const byView = new Map(restored.views.map((v) => [v.view, v]));
  const views: BuilderDesign["views"] = {};
  for (const view of garment.views) {
    const saved = byView.get(view.id);
    const area =
      saved && view.printAreas.some((a) => a.id === saved.printArea) ? saved.printArea : view.printAreas[0]!.id;
    const artwork: ArtworkMeta | null = saved
      ? {
          ...meta,
          transform: artworkTransformSchema.safeParse(saved.transform).success
            ? saved.transform
            : fitTransform(view.printAreas.find((a) => a.id === area)!.rect, meta.naturalWidth, meta.naturalHeight),
        }
      : null;
    views[view.id] = { printArea: area, artwork };
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
/* Mapping onto the /api/mockups payload (P4-2 adds email + Turnstile) */
/* ------------------------------------------------------------------ */

export type MockupPayloadDesign = Pick<
  import("@/lib/mockup-schema").MockupPayload,
  "garment" | "colors" | "views" | "sizes" | "notes"
>;

/** The design portion of the payload: only views that actually carry artwork. */
export function toPayloadDesign(design: BuilderDesign): MockupPayloadDesign {
  const garment = getGarment(design.garment);
  const views: MockupView[] = [];
  for (const view of garment.views) {
    const saved = design.views[view.id];
    if (!saved?.artwork) continue;
    views.push({
      view: view.id,
      printArea: saved.printArea,
      transform: saved.artwork.transform,
    });
  }
  return {
    garment: design.garment,
    colors: design.colors,
    views,
    sizes: design.sizes,
    notes: design.notes.trim() ? design.notes.trim() : undefined,
  };
}
