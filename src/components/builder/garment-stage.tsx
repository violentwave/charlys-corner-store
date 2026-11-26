"use client";
/**
 * The builder canvas (Konva). Client-only: loaded through next/dynamic with ssr:false.
 *
 * The garment is pre-composed offscreen (see compositor.ts) and drawn as one image; the
 * side's LAYERS (v4: images and text, bottom → top) are drawn on top, clipped to the
 * active print area, with a dashed guide and a Konva Transformer on the selected layer.
 * The stage keeps template coordinates (view.width × view.height) as its logical space and
 * scales to fit its container. Everything on the canvas stays neutral — the neon theme
 * lives in the surrounding UI only.
 *
 * Text layers render at a base font size of 100px and are scaled into their transform box
 * (scaleX = width / measured width, scaleY = height / 100), so stretching the box visibly
 * stretches the letters. Fonts are loaded (loadTextFont) before first draw, on font change
 * and before export, so the canvas never shows a fallback font.
 */
import Konva from "konva";
import { forwardRef, Fragment, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Transformer } from "react-konva";

import { getTextFont } from "@/lib/text-fonts";
import type { GarmentView, ViewId } from "@/lib/garments";
import type { MockupColors } from "@/lib/mockup-schema";
import { Button } from "@/components/ui/button";

import { composeArtworkLayer, composeGarment, composeTextLayer, type TemplateImages } from "./compositor";
import { centerToTopLeft, nudgeTransform, rotateAroundCenter, scaleAroundCenter, topLeftToCenter } from "./geometry";
import { SideArtworkChooser } from "./side-artwork-chooser";
import { TEXT_BASE_FONT_SIZE, textGeometry } from "./text-measure";
import type { BuilderLayer, BuilderTextLayer, BuilderTransform } from "./use-builder-state";

/** The builder-side images the canvas draws with, keyed by file index. */
export type StageImages = Partial<Record<number, HTMLImageElement>>;

/** Loads the template layer images for a view (same-origin /garments/…, keeps export untainted). */
function useTemplateImages(view: GarmentView): { images: TemplateImages | null; error: boolean } {
  const [loaded, setLoaded] = useState<{ viewId: string; images: TemplateImages } | null>(null);
  const [failedView, setFailedView] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load ${src}`));
        img.src = src;
      });
    const maskEntries = view.zones.map((zone) => [zone, load(view.layers.mask[zone]!)] as const);
    Promise.all([...maskEntries.map(([, p]) => p), load(view.layers.shading), load(view.layers.highlight)])
      .then((loadedImages) => {
        if (!alive) return;
        const masks = Object.fromEntries(view.zones.map((zone, i) => [zone, loadedImages[i]!]));
        setLoaded({
          viewId: view.id,
          images: { masks, shading: loadedImages[view.zones.length]!, highlight: loadedImages[view.zones.length + 1]! },
        });
        setFailedView(null);
      })
      .catch(() => {
        if (alive) setFailedView(view.id);
      });
    return () => {
      alive = false;
    };
  }, [view]);
  return {
    images: loaded && loaded.viewId === view.id ? loaded.images : null,
    error: failedView === view.id,
  };
}

function loadTemplate(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

/** loadTextFont never rejects; wrapped so Promise.all stays simple. */
const loadTextFontSafe = (id: string) => import("./load-text-font").then((m) => m.loadTextFont(id));

export interface GarmentStageHandle {
  /** The id of the view the stage is currently showing (exportViewPng waits for it). */
  getView(): ViewId;
  /** Renders the current view at native template size and returns a PNG blob. */
  exportPng(): Promise<Blob | null>;
}

export interface GarmentStageProps {
  garmentName: string;
  view: GarmentView;
  /** The active print-location id for this side. */
  printAreaId: string;
  colors: MockupColors;
  /** The side's layer stack, bottom → top. */
  layers: BuilderLayer[];
  selectedLayerId: string | null;
  /** Decoded images keyed by the side's image layers' fileIndex. */
  images: StageImages;
  /** Empty-side state (v3): "Your design goes here" plus the same/different chooser. */
  emptyState?: {
    files: { index: number; url: string; name: string }[];
    onUse: (fileIndex: number) => void;
    onUploadDifferent: () => void;
  };
  /** "Lock ratio" for the Transformer (default on for images, off for text). */
  lockRatio: boolean;
  /**
   * Mobile sticky canvas (P51-1): also fit the stage inside the container's height — the
   * container's height comes from the `--canvas-h` custom property the builder sets
   * (42svh, 30svh with the keyboard open). Desktop leaves it unset: the stage keeps
   * filling the container's width exactly as before.
   */
  fitContainerHeight?: boolean;
  onSelectLayer: (layerId: string | null) => void;
  onTransformCommit: (layerId: string, transform: BuilderTransform) => void;
  onRemoveLayer: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  onMoveLayer: (layerId: string, to: "up" | "down") => void;
  onCycleLayer: (backwards: boolean) => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

/** How close (CSS px on screen) a dragged layer's center gets to the print area's middle before it snaps. */
const SNAP_SCREEN_PX = 6;
/** Neutral magenta-free guide color: the canvas stays off-theme (docs/04), like the dashed box. */
const SNAP_GUIDE_COLOR = "#2f6fd6";

/** Konva name of the faded, unclipped (interactive) copy of each layer; hidden in exports. */
const GHOST_NAME = "layer-ghost";

const raf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Image layers with fold shading baked in, composed once per (shading, file, size, position)
 * rather than on every render — typing in a text field or selecting a layer mustn't recompose
 * every image. Keyed by the image elements (WeakMaps), a few entries per file.
 */
const artworkLayerCache = new WeakMap<HTMLImageElement, WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>>();
function cachedArtworkLayer(
  img: HTMLImageElement,
  shading: HTMLImageElement,
  t: BuilderTransform,
  view: GarmentView,
): HTMLCanvasElement {
  let byImage = artworkLayerCache.get(shading);
  if (!byImage) artworkLayerCache.set(shading, (byImage = new WeakMap()));
  let entries = byImage.get(img);
  if (!entries) byImage.set(img, (entries = new Map()));
  const key = `${Math.round(t.x)}|${Math.round(t.y)}|${Math.round(t.width)}|${Math.round(t.height)}`;
  let canvas = entries.get(key);
  if (!canvas) {
    canvas = composeArtworkLayer(img, shading, t, view);
    entries.set(key, canvas);
    if (entries.size > 8) entries.delete(entries.keys().next().value!);
  }
  return canvas;
}

/**
 * Text layers get the same fold-shading treatment as images (P51-2): the lettering is
 * rendered once per (content, box, position) into an offscreen canvas with Konva — the
 * same node config the stage draws, so on-screen and exported pixels match — then the
 * shading is multiplied in (composeTextLayer). Cached like the image path so typing
 * stays smooth; `fontTick` is part of the key so late font loads re-render.
 */
const textLayerCache = new Map<string, HTMLCanvasElement>();
function cachedTextLayer(
  layer: BuilderTextLayer,
  shading: HTMLImageElement,
  fontTick: number,
  view: GarmentView,
): HTMLCanvasElement {
  const t = layer.transform;
  const w = Math.max(1, Math.round(t.width));
  const h = Math.max(1, Math.round(t.height));
  const key = [
    layer.text,
    layer.font,
    layer.letterSpacing,
    layer.curve,
    layer.color,
    layer.outline.color,
    layer.outline.width,
    layer.align,
    t.flipX,
    w,
    h,
    Math.round(t.x),
    Math.round(t.y),
    fontTick,
    view.id,
  ].join("|");
  const cached = textLayerCache.get(key);
  if (cached) return cached;
  const geo = textGeometry(layer.text, layer.font, layer.letterSpacing, layer.curve);
  const font = getTextFont(layer.font);
  const container = document.createElement("div");
  const stage = new Konva.Stage({ container, width: w, height: h });
  const offLayer = new Konva.Layer();
  stage.add(offLayer);
  const node = geo.path
    ? new Konva.TextPath({
        data: geo.path,
        text: layer.text,
        fontSize: TEXT_BASE_FONT_SIZE,
        fontFamily: font?.family ?? "sans-serif",
        fontStyle: font ? `${font.weight}` : "normal",
        letterSpacing: layer.letterSpacing,
        fill: layer.color,
        stroke: layer.outline.width > 0 ? layer.outline.color : undefined,
        strokeWidth: textStrokeWidth(layer.outline.width, t.width / geo.width, t.height / geo.height),
        fillAfterStrokeEnabled: true,
        align: "center",
        x: w / 2,
        y: h / 2,
        offsetX: geo.offsetX,
        offsetY: geo.offsetY,
        scaleX: t.width / geo.width,
        scaleY: t.height / geo.height,
      })
    : new Konva.Text({
        text: layer.text,
        fontSize: TEXT_BASE_FONT_SIZE,
        fontFamily: font?.family ?? "sans-serif",
        fontStyle: font ? `${font.weight}` : "normal",
        letterSpacing: layer.letterSpacing,
        fill: layer.color,
        stroke: layer.outline.width > 0 ? layer.outline.color : undefined,
        strokeWidth: textStrokeWidth(layer.outline.width, t.width / geo.width, t.height / geo.height),
        fillAfterStrokeEnabled: true,
        align: layer.align,
        x: w / 2,
        y: h / 2,
        offsetX: geo.offsetX,
        offsetY: geo.offsetY,
        scaleX: t.width / geo.width,
        scaleY: t.height / geo.height,
      });
  offLayer.add(node);
  const flat = stage.toCanvas({ pixelRatio: 1 });
  stage.destroy();
  container.remove();
  const composed = composeTextLayer(flat, shading, t);
  textLayerCache.set(key, composed);
  if (textLayerCache.size > 48) textLayerCache.delete(textLayerCache.keys().next().value!);
  return composed;
}

/**
 * Konva strokes are centered on the glyph edge and scaled with the node. With the fill drawn
 * over the stroke, the visible outline is half the stroke, so this keeps the visible outline at
 * `outline.width` template px whatever the text's size (what the owner email says it is).
 */
function textStrokeWidth(outlineWidth: number, scaleX: number, scaleY: number): number {
  const s = Math.sqrt(Math.abs(scaleX * scaleY)) || 1;
  return (2 * outlineWidth) / s;
}

export const GarmentStage = forwardRef<GarmentStageHandle, GarmentStageProps>(function GarmentStage(
  {
    garmentName,
    view,
    printAreaId,
    colors,
    layers,
    selectedLayerId,
    images: stageImages,
    emptyState,
    lockRatio,
    fitContainerHeight = false,
    onSelectLayer,
    onTransformCommit,
    onRemoveLayer,
    onDuplicateLayer,
    onMoveLayer,
    onCycleLayer,
    onUndo,
    onRedo,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const nodeRefs = useRef(new Map<string, Konva.Node>());
  /** The clipped, non-interactive copy of each layer (what prints). */
  const copyRefs = useRef(new Map<string, Konva.Node>());
  /** Keeps the clipped copy on the interactive node while it's dragged / transformed / pinched. */
  const syncCopy = (layerId: string) => {
    const node = nodeRefs.current.get(layerId);
    const copy = copyRefs.current.get(layerId);
    if (!node || !copy) return;
    copy.setAttrs({
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
      skewX: node.skewX(),
      skewY: node.skewY(),
    });
  };
  const transformerRef = useRef<Konva.Transformer>(null);
  const guideRef = useRef<Konva.Rect>(null);
  const vGuideRef = useRef<Konva.Line>(null);
  const hGuideRef = useRef<Konva.Line>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const pinchRef = useRef<{ dist: number; angle: number } | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  // Selection is per view: it survives re-renders but never leaks across views.
  const [selectedView, setSelectedView] = useState<string | null>(null);
  /** Touch: 10px Transformer handles are unusable with a finger — enlarge on coarse pointers. */
  const [coarsePointer] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
  );
  /** Bumped when the side's text fonts finish loading, so the canvas re-measures + redraws. */
  const [fontTick, setFontTick] = useState(0);
  const selected = selectedView === view.id;
  const { images, error } = useTemplateImages(view);

  const activeArea = view.printAreas.find((a) => a.id === printAreaId) ?? view.printAreas[0]!;

  // Stage scales to fit its container; template coordinates stay the logical space.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = Math.floor(entries[0]?.contentRect.width ?? 0);
      const height = Math.floor(entries[0]?.contentRect.height ?? 0);
      setContainerSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // View-only zoom (P51-1): the export and the print math ignore it — it only magnifies
  // what's on screen. Levels are stepped; a pinch can land between them (clamped 1–3).
  const ZOOM_LEVELS = [1, 1.5, 2, 3] as const;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const fitScale =
    containerSize.width > 0
      ? Math.min(
          containerSize.width / view.width,
          // With fitContainerHeight the container's height is fixed by CSS (--canvas-h),
          // so the stage fits inside it instead of sizing it.
          fitContainerHeight && containerSize.height > 0
            ? containerSize.height / view.height
            : Number.POSITIVE_INFINITY,
        )
      : 0;
  const viewScale = fitScale * zoom;
  const stageWidth = fitScale > 0 ? Math.round(view.width * fitScale) : 0;
  const stageHeight = fitScale > 0 ? Math.round(view.height * fitScale) : 0;
  /** Clamps a pan offset (stage px) so the zoomed content keeps covering the viewport. */
  const clampPan = (x: number, y: number, nextZoom = zoomRef.current) => ({
    x: Math.min(0, Math.max(-stageWidth * (nextZoom - 1), x)),
    y: Math.min(0, Math.max(-stageHeight * (nextZoom - 1), y)),
  });
  const applyZoom = (next: number) => {
    const z = Math.min(3, Math.max(1, next));
    setPan((p) => clampPan(p.x, p.y, z));
    setZoom(z);
  };
  const zoomStep = (direction: 1 | -1) => {
    const current = zoomRef.current;
    const level = ZOOM_LEVELS.find((l) => (direction === 1 ? l > current + 0.01 : l < current - 0.01));
    applyZoom(level ?? (direction === 1 ? ZOOM_LEVELS[ZOOM_LEVELS.length - 1]! : 1));
  };
  const zoomFit = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  // Pinch on the empty canvas zooms the view; a pinch that starts on a layer is handled
  // per layer below (scale/rotate), so the two never fight.
  const stagePinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  /** `anchorSize` is in template px and scales with the stage; this keeps ≈22 CSS px on touch. */
  const anchorSize = coarsePointer && viewScale > 0 ? Math.ceil(22 / viewScale) : 10;
  const anchorCornerRadius = coarsePointer && viewScale > 0 ? Math.ceil(11 / viewScale) : 2;

  // Deselect when the view changes (the layer nodes are replaced).
  const selectThisView = () => setSelectedView(view.id);

  const artworkCanvas = (layer: Extract<BuilderLayer, { type: "image" }>): HTMLCanvasElement | undefined => {
    const img = stageImages[layer.fileIndex];
    return img && images ? cachedArtworkLayer(img, images.shading, layer.transform, view) : undefined;
  };

  // Garment layer: mask fills + shading + highlight, clipped to the silhouette.
  const garmentCanvas = useMemo(() => (images ? composeGarment(view, colors, images) : null), [view, colors, images]);

  // Load the side's text fonts, then redraw: the canvas never shows a fallback font.
  const textFonts = useMemo(() => [...new Set(layers.flatMap((l) => (l.type === "text" ? [l.font] : [])))], [layers]);
  useEffect(() => {
    if (textFonts.length === 0) return;
    let alive = true;
    Promise.all(textFonts.map(loadTextFontSafe)).then(() => {
      if (alive) setFontTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
  }, [textFonts]);

  // The Transformer attaches to the selected layer's node only.
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const selectedNode = selectedLayerId ? nodeRefs.current.get(selectedLayerId) : null;
    transformer.nodes(selected && selectedNode ? [selectedNode] : []);
    transformer.getLayer()?.batchDraw();
  }, [selected, selectedLayerId, layers, fontTick]);

  const commitTransform = (layer: BuilderLayer, node: Konva.Node) => {
    if (layer.type === "image") {
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const width = layer.transform.width * Math.abs(scaleX);
      const height = layer.transform.height * Math.abs(scaleY);
      const rotation = node.rotation();
      const topLeft = centerToTopLeft(node.x(), node.y(), width, height, rotation);
      onTransformCommit(layer.id, {
        ...layer.transform,
        x: topLeft.x,
        y: topLeft.y,
        width,
        height,
        rotation,
        flipX: scaleX < 0,
      });
      return;
    }
    // Text: the node renders at the base font size; the box is what got stretched.
    const natural = textGeometry(layer.text, layer.font, layer.letterSpacing, layer.curve);
    const width = natural.width * Math.abs(node.scaleX());
    const height = natural.height * Math.abs(node.scaleY());
    const rotation = node.rotation();
    const topLeft = centerToTopLeft(node.x(), node.y(), width, height, rotation);
    onTransformCommit(layer.id, {
      ...layer.transform,
      x: topLeft.x,
      y: topLeft.y,
      width,
      height,
      rotation,
    });
  };

  /**
   * Snap to center while dragging: within a few screen pixels of the print area's middle, the
   * layer's center locks onto it and a guide line shows (vertical, horizontal or both).
   */
  const snapToCenter = (layerId: string) => {
    const node = nodeRefs.current.get(layerId);
    if (!node || viewScale <= 0) return;
    const threshold = SNAP_SCREEN_PX / viewScale;
    const cx = activeArea.rect.x + activeArea.rect.w / 2;
    const cy = activeArea.rect.y + activeArea.rect.h / 2;
    const snapX = Math.abs(node.x() - cx) <= threshold;
    const snapY = Math.abs(node.y() - cy) <= threshold;
    if (snapX) node.x(cx);
    if (snapY) node.y(cy);
    vGuideRef.current?.visible(snapX);
    hGuideRef.current?.visible(snapY);
  };
  const hideSnapGuides = () => {
    vGuideRef.current?.visible(false);
    hGuideRef.current?.visible(false);
  };

  const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>, layer: BuilderLayer) => {
    const touches = e.evt.touches;
    if (touches.length !== 2) return;
    e.evt.preventDefault();
    const [a, b] = [touches[0]!, touches[1]!];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const angle = (Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180) / Math.PI;
    const node = nodeRefs.current.get(layer.id);
    if (!node) return;
    const last = pinchRef.current;
    if (!last) {
      pinchRef.current = { dist, angle };
      return;
    }
    const factor = dist / last.dist;
    node.scaleX(node.scaleX() * factor);
    node.scaleY(node.scaleY() * factor);
    node.rotation(node.rotation() + (angle - last.angle));
    syncCopy(layer.id);
    pinchRef.current = { dist, angle };
    node.getLayer()?.batchDraw();
  };

  const handleTouchEnd = (layer: BuilderLayer) => {
    pinchRef.current = null;
    const node = nodeRefs.current.get(layer.id);
    if (node) commitTransform(layer, node);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const selectedLayer = layers.find((l) => l.id === selectedLayerId);
    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) onRedo?.();
      else onUndo?.();
      return;
    }
    if (meta && e.key.toLowerCase() === "d" && selectedLayer) {
      e.preventDefault();
      onDuplicateLayer(selectedLayer.id);
      return;
    }
    if (meta && (e.key === "]" || e.key === "[") && selectedLayer) {
      e.preventDefault();
      onMoveLayer(selectedLayer.id, e.key === "]" ? "up" : "down");
      return;
    }
    // Tab walks through the layers, then lets focus leave the canvas (no keyboard trap,
    // WCAG 2.1.2): forward past the top layer or backward past the bottom one moves on.
    if (e.key === "Tab" && layers.length > 0) {
      const index = layers.findIndex((l) => l.id === selectedLayerId);
      const leaving = e.shiftKey ? index === 0 || index === -1 : index === layers.length - 1;
      if (leaving) {
        onSelectLayer(null);
        return;
      }
      e.preventDefault();
      selectThisView();
      onCycleLayer(e.shiftKey);
      return;
    }
    if (!selectedLayer) return;
    const step = e.shiftKey ? 10 : 1;
    const transform = selectedLayer.transform;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        onTransformCommit(selectedLayer.id, nudgeTransform(transform, -step, 0));
        break;
      case "ArrowRight":
        e.preventDefault();
        onTransformCommit(selectedLayer.id, nudgeTransform(transform, step, 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        onTransformCommit(selectedLayer.id, nudgeTransform(transform, 0, -step));
        break;
      case "ArrowDown":
        e.preventDefault();
        onTransformCommit(selectedLayer.id, nudgeTransform(transform, 0, step));
        break;
      case "+":
      case "=":
        e.preventDefault();
        onTransformCommit(selectedLayer.id, scaleAroundCenter(transform, 1.02));
        break;
      case "-":
      case "_":
        e.preventDefault();
        onTransformCommit(selectedLayer.id, scaleAroundCenter(transform, 1 / 1.02));
        break;
      case "r":
      case "R":
        e.preventDefault();
        onTransformCommit(selectedLayer.id, rotateAroundCenter(transform, 15));
        break;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        onRemoveLayer(selectedLayer.id);
        break;
      default:
        break;
    }
  };

  useImperativeHandle(ref, () => ({
    getView: () => view.id,
    async exportPng() {
      const stage = stageRef.current;
      if (!stage) return null;
      // Fonts first: the export must show the real lettering, not a fallback.
      await Promise.all(layers.filter((l) => l.type === "text").map((l) => loadTextFontSafe(l.font)));
      // The view-only zoom/pan (P51-1) never reaches the export: drop back to the 1×
      // fit scale, centered, for the render, then put the visitor's view back.
      const baseScale = stage.width() / view.width;
      const previousScale = stage.scaleX();
      const previousPosition = stage.position();
      if (previousScale !== baseScale || previousPosition.x !== 0 || previousPosition.y !== 0) {
        stage.scale({ x: baseScale, y: baseScale });
        stage.position({ x: 0, y: 0 });
      }
      // Guides and transformer handles never appear in the export.
      const selectedNodes = transformerRef.current?.nodes() ?? [];
      const ghosts = stage.find(`.${GHOST_NAME}`);
      ghosts.forEach((g) => g.visible(false));
      hideSnapGuides();
      guideRef.current?.visible(false);
      transformerRef.current?.visible(false);
      transformerRef.current?.nodes([]);
      layerRef.current?.batchDraw();
      await raf();
      await raf();
      const pixelRatio = view.width / stage.width();
      const blob = await new Promise<Blob | null>((resolve) =>
        stage.toBlob({ callback: resolve, mimeType: "image/png", pixelRatio }),
      );
      ghosts.forEach((g) => g.visible(true));
      guideRef.current?.visible(true);
      transformerRef.current?.visible(true);
      transformerRef.current?.nodes(selectedNodes);
      if (previousScale !== baseScale || previousPosition.x !== 0 || previousPosition.y !== 0) {
        stage.scale({ x: previousScale, y: previousScale });
        stage.position(previousPosition);
      }
      layerRef.current?.batchDraw();
      return blob;
    },
  }));

  const transformText = (layer: BuilderLayer) =>
    `x=${Math.round(layer.transform.x)}, y=${Math.round(layer.transform.y)}, w=${Math.round(
      layer.transform.width,
    )}, h=${Math.round(layer.transform.height)}, rotation=${Math.round(layer.transform.rotation)}${
      layer.transform.flipX ? ", flipped" : ""
    }${
      layer.transform.skewX || layer.transform.skewY
        ? `, skew=${Math.round((Math.atan(layer.transform.skewX) * 180) / Math.PI)}°/${Math.round(
            (Math.atan(layer.transform.skewY) * 180) / Math.PI,
          )}°`
        : ""
    }`;

  const hasLayers = layers.length > 0;

  return (
    <div
      ref={containerRef}
      data-testid="builder-canvas"
      role="group"
      tabIndex={0}
      aria-label={`Mockup canvas: ${garmentName} ${view.label.toLowerCase()}. ${
        hasLayers ? "Click a design to select it. " : ""
      }Keyboard: Tab moves through layers, arrow keys nudge, plus and minus scale, R rotates, Delete removes, Control-Z undoes.`}
      onKeyDown={handleKeyDown}
      className="bg-builder-backdrop focus-visible:ring-neon-cyan relative w-full overflow-hidden rounded-xl focus-visible:ring-2 focus-visible:outline-none"
      // Mobile sticky canvas: the height comes from --canvas-h (the builder sets 42svh,
      // or 30svh while the on-screen keyboard is open) and the stage fits inside it.
      style={fitContainerHeight ? { height: "var(--canvas-h)" } : undefined}
    >
      {error ? (
        <p role="alert" className="text-text-2 flex min-h-64 items-center justify-center gap-2 p-6 text-sm">
          <span aria-hidden="true">⚠</span> We couldn&apos;t load the garment preview. Please refresh the page.
        </p>
      ) : fitScale > 0 && garmentCanvas ? (
        <div className="mx-auto" style={{ width: stageWidth, height: stageHeight }}>
          <Stage
            ref={stageRef}
            width={stageWidth}
            height={stageHeight}
            scaleX={viewScale}
            scaleY={viewScale}
            x={pan.x}
            y={pan.y}
            // Zoomed in: a drag on the empty canvas pans the view (layers still drag
            // themselves — Konva resolves the drag to the node under the pointer).
            draggable={zoom > 1}
            dragBoundFunc={(pos) => clampPan(pos.x, pos.y)}
            onDragEnd={(e) => setPan(clampPan(e.target.x(), e.target.y()))}
            onMouseDown={(e) => {
              if (e.target === e.target.getStage()) {
                setSelectedView(null);
                onSelectLayer(null);
              }
            }}
            onTouchStart={(e) => {
              if (e.target === e.target.getStage()) {
                setSelectedView(null);
                onSelectLayer(null);
              }
            }}
            onTouchMove={(e) => {
              const touches = e.evt.touches;
              if (touches.length !== 2 || e.target !== e.target.getStage()) return;
              e.evt.preventDefault();
              const dist = Math.hypot(
                touches[0]!.clientX - touches[1]!.clientX,
                touches[0]!.clientY - touches[1]!.clientY,
              );
              const last = stagePinchRef.current;
              if (!last) {
                stagePinchRef.current = { dist, zoom: zoomRef.current };
                return;
              }
              applyZoom((last.zoom * dist) / last.dist);
            }}
            onTouchEnd={() => {
              stagePinchRef.current = null;
            }}
          >
            <Layer listening={false}>
              <KonvaImage image={garmentCanvas} x={0} y={0} width={view.width} height={view.height} />
            </Layer>
            <Layer ref={layerRef}>
              {layers.map((layer) => {
                const attachRef = (node: Konva.Node | null) => {
                  if (node) nodeRefs.current.set(layer.id, node);
                  else nodeRefs.current.delete(layer.id);
                };
                const attachCopyRef = (node: Konva.Node | null) => {
                  if (node) copyRefs.current.set(layer.id, node);
                  else copyRefs.current.delete(layer.id);
                };
                // Image and text layers alike: one composed canvas (the fabric shading
                // baked in), drawn twice — a faded interactive ghost plus the clipped copy.
                const composed =
                  layer.type === "image"
                    ? artworkCanvas(layer)
                    : images
                      ? cachedTextLayer(layer, images.shading, fontTick, view)
                      : undefined;
                const layerHandlers = {
                  draggable: true,
                  onClick: () => {
                    selectThisView();
                    onSelectLayer(layer.id);
                  },
                  onTap: () => {
                    selectThisView();
                    onSelectLayer(layer.id);
                  },
                  onDragMove: () => {
                    snapToCenter(layer.id);
                    syncCopy(layer.id);
                  },
                  onTransform: () => syncCopy(layer.id),
                  onDragEnd: () => {
                    hideSnapGuides();
                    selectThisView();
                    const node = nodeRefs.current.get(layer.id);
                    if (node) commitTransform(layer, node);
                  },
                  onTransformEnd: () => {
                    selectThisView();
                    const node = nodeRefs.current.get(layer.id);
                    if (node) commitTransform(layer, node);
                  },
                  onTouchMove: (e: Konva.KonvaEventObject<TouchEvent>) => handleTouchMove(e, layer),
                  onTouchEnd: () => handleTouchEnd(layer),
                  onMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>) => {
                    const stage = e.target.getStage();
                    if (stage) stage.container().style.cursor = "move";
                  },
                  onMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>) => {
                    const stage = e.target.getStage();
                    if (stage) stage.container().style.cursor = "";
                  },
                };
                // x/y is the box's top-left corner as rotated (geometry.ts): place the node at its center.
                const center = topLeftToCenter(layer.transform);
                const position = {
                  x: center.cx,
                  y: center.cy,
                  rotation: layer.transform.rotation,
                  skewX: layer.transform.skewX,
                  skewY: layer.transform.skewY,
                };
                /** The layer's node; drawn twice (see below), only the interactive one gets handlers. */
                const node = (interactive: boolean) => {
                  const extra = interactive
                    ? { ref: attachRef, ...layerHandlers }
                    : { ref: attachCopyRef, listening: false };
                  // Text draws through the same composed canvas as images (fold shading
                  // baked in); the box, rotation and flip stay node transforms, so the
                  // Transformer and the export behave identically for both layer types.
                  return (
                    <KonvaImage
                      image={composed}
                      {...position}
                      offsetX={layer.transform.width / 2}
                      offsetY={layer.transform.height / 2}
                      width={layer.transform.width}
                      height={layer.transform.height}
                      scaleX={layer.transform.flipX ? -1 : 1}
                      {...extra}
                    />
                  );
                };
                // Two copies: the interactive one is drawn faded and unclipped, so a design that
                // runs past the print area is still visible and easy to grab; a clipped copy on top
                // shows exactly what prints. The export hides the faded one (exportPng).
                return (
                  <Fragment key={layer.id}>
                    <Group name={GHOST_NAME} opacity={0.3}>
                      {node(true)}
                    </Group>
                    <Group
                      listening={false}
                      clip={{
                        x: activeArea.rect.x,
                        y: activeArea.rect.y,
                        width: activeArea.rect.w,
                        height: activeArea.rect.h,
                      }}
                    >
                      {node(false)}
                    </Group>
                  </Fragment>
                );
              })}
              <Transformer
                ref={transformerRef}
                keepRatio={lockRatio}
                rotateEnabled
                enabledAnchors={[
                  "top-left",
                  "top-center",
                  "top-right",
                  "middle-left",
                  "middle-right",
                  "bottom-left",
                  "bottom-center",
                  "bottom-right",
                ]}
                anchorSize={anchorSize}
                anchorCornerRadius={anchorCornerRadius}
                boundBoxFunc={(oldBox, newBox) => (newBox.width < 8 || newBox.height < 8 ? oldBox : newBox)}
              />
              <Rect
                ref={guideRef}
                x={activeArea.rect.x}
                y={activeArea.rect.y}
                width={activeArea.rect.w}
                height={activeArea.rect.h}
                stroke="#4b4b57"
                strokeWidth={1.5}
                dash={[8, 6]}
                listening={false}
              />
              {/* Snap-to-center guides: shown only while a layer is locked onto the middle. */}
              <Line
                ref={vGuideRef}
                points={[
                  activeArea.rect.x + activeArea.rect.w / 2,
                  activeArea.rect.y,
                  activeArea.rect.x + activeArea.rect.w / 2,
                  activeArea.rect.y + activeArea.rect.h,
                ]}
                stroke={SNAP_GUIDE_COLOR}
                strokeWidth={1.5}
                visible={false}
                listening={false}
              />
              <Line
                ref={hGuideRef}
                points={[
                  activeArea.rect.x,
                  activeArea.rect.y + activeArea.rect.h / 2,
                  activeArea.rect.x + activeArea.rect.w,
                  activeArea.rect.y + activeArea.rect.h / 2,
                ]}
                stroke={SNAP_GUIDE_COLOR}
                strokeWidth={1.5}
                visible={false}
                listening={false}
              />
            </Layer>
          </Stage>
        </div>
      ) : (
        <div className="bg-builder-backdrop min-h-64 w-full animate-pulse" aria-hidden="true" />
      )}
      {/* Empty side (v3): dashed guide, one-line instruction, same/different chooser. */}
      {fitScale > 0 && garmentCanvas && !hasLayers && emptyState ? (
        <div className="bg-builder-backdrop/90 absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
          <p className="text-text-2 text-sm font-medium" data-testid="canvas-empty">
            Your design goes here
          </p>
          {emptyState.files.length > 0 ? (
            <SideArtworkChooser
              files={emptyState.files}
              sideLabel={view.label}
              onUse={emptyState.onUse}
              onUploadDifferent={emptyState.onUploadDifferent}
            />
          ) : (
            <Button type="button" size="sm" onClick={emptyState.onUploadDifferent} data-testid="add-design">
              Add your design
            </Button>
          )}
        </div>
      ) : null}
      {/* View-only zoom controls (P51-1): "−", badge, "Fit", "+" on the canvas corner. */}
      <div
        role="group"
        aria-label="Canvas zoom"
        className="bg-bg-0/80 border-border absolute top-2 left-2 z-10 flex items-center gap-1 rounded-full border p-1 backdrop-blur-sm"
      >
        <button
          type="button"
          data-testid="canvas-zoom-out"
          aria-label="Zoom out"
          disabled={zoom <= 1}
          onClick={() => zoomStep(-1)}
          className="text-text-1 hover:bg-bg-2 focus-visible:ring-neon-cyan inline-flex h-11 w-11 items-center justify-center rounded-full text-base transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
        >
          <span aria-hidden="true">−</span>
        </button>
        <span
          data-testid="canvas-zoom-badge"
          aria-live="polite"
          className="text-text-2 w-10 text-center font-mono text-xs"
        >
          {`${Math.round(zoom * 10) / 10}×`}
        </span>
        <button
          type="button"
          data-testid="canvas-zoom-fit"
          aria-label="Fit the whole garment at 1×"
          onClick={zoomFit}
          className="text-text-1 hover:bg-bg-2 focus-visible:ring-neon-cyan inline-flex h-11 items-center justify-center rounded-full px-2.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          Fit
        </button>
        <button
          type="button"
          data-testid="canvas-zoom-in"
          aria-label="Zoom in"
          disabled={zoom >= 3}
          onClick={() => zoomStep(1)}
          className="text-text-1 hover:bg-bg-2 focus-visible:ring-neon-cyan inline-flex h-11 w-11 items-center justify-center rounded-full text-base transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      <p className="sr-only" aria-live="polite" data-testid="builder-transform">
        {selectedLayerId
          ? layers.find((l) => l.id === selectedLayerId)
            ? transformText(layers.find((l) => l.id === selectedLayerId)!)
            : "no selection"
          : hasLayers
            ? transformText(layers[0]!)
            : "no design"}
      </p>
    </div>
  );
});

export { loadTemplate };
