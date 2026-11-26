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
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";

import { getTextFont, type TextFontId } from "@/lib/text-fonts";
import type { GarmentView, ViewId } from "@/lib/garments";
import type { MockupColors } from "@/lib/mockup-schema";
import { Button } from "@/components/ui/button";

import { composeArtworkLayer, composeGarment, type TemplateImages } from "./compositor";
import { centerToTopLeft, nudgeTransform, rotateAroundCenter, scaleAroundCenter, SKEW_LIMIT } from "./geometry";
import { SideArtworkChooser } from "./side-artwork-chooser";
import type { BuilderLayer, BuilderTransform } from "./use-builder-state";

/** Base font size (template px) text layers render at before being scaled into their box. */
const TEXT_BASE_FONT_SIZE = 100;
const TEXT_LINE_HEIGHT = 1;

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

/**
 * Measures a text layer at the base font size (width/height in template px before the
 * transform's scale). Uses a standalone Konva.Text, so no stage is needed.
 */
function measureText(text: string, font: TextFontId, letterSpacing: number): { width: number; height: number } {
  const f = getTextFont(font);
  const node = new Konva.Text({
    text,
    fontSize: TEXT_BASE_FONT_SIZE,
    fontFamily: f?.family ?? "sans-serif",
    fontStyle: f ? `${f.weight}` : "normal",
    letterSpacing,
  });
  return { width: Math.max(node.width(), 1), height: TEXT_BASE_FONT_SIZE * TEXT_LINE_HEIGHT };
}

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
  onSelectLayer: (layerId: string | null) => void;
  onTransformCommit: (layerId: string, transform: BuilderTransform) => void;
  onRemoveLayer: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  onMoveLayer: (layerId: string, to: "up" | "down") => void;
  onCycleLayer: (backwards: boolean) => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

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

/** The Transformer may re-decompose a rotated + skewed node: keep what it shows, within the schema. */
const nodeSkew = (node: Konva.Node) => ({
  skewX: Math.max(-SKEW_LIMIT, Math.min(SKEW_LIMIT, node.skewX())),
  skewY: Math.max(-SKEW_LIMIT, Math.min(SKEW_LIMIT, node.skewY())),
});

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
  const transformerRef = useRef<Konva.Transformer>(null);
  const guideRef = useRef<Konva.Rect>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const pinchRef = useRef<{ dist: number; angle: number } | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
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
      if (width > 0) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = containerWidth > 0 ? containerWidth / view.width : 0;
  const stageHeight = scale > 0 ? Math.round(view.height * scale) : 0;
  /** `anchorSize` is in template px and scales with the stage; this keeps ≈22 CSS px on touch. */
  const anchorSize = coarsePointer && scale > 0 ? Math.ceil(22 / scale) : 10;
  const anchorCornerRadius = coarsePointer && scale > 0 ? Math.ceil(11 / scale) : 2;

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
        ...nodeSkew(node),
      });
      return;
    }
    // Text: the node renders at the base font size; the box is what got stretched.
    const natural = measureText(layer.text, layer.font, layer.letterSpacing);
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
      ...nodeSkew(node),
    });
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
      // Guides and transformer handles never appear in the export.
      const selectedNodes = transformerRef.current?.nodes() ?? [];
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
      guideRef.current?.visible(true);
      transformerRef.current?.visible(true);
      transformerRef.current?.nodes(selectedNodes);
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
    >
      {error ? (
        <p role="alert" className="text-text-2 flex min-h-64 items-center justify-center gap-2 p-6 text-sm">
          <span aria-hidden="true">⚠</span> We couldn&apos;t load the garment preview. Please refresh the page.
        </p>
      ) : scale > 0 && garmentCanvas ? (
        <Stage
          ref={stageRef}
          width={containerWidth}
          height={stageHeight}
          scaleX={scale}
          scaleY={scale}
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
                onDragEnd: () => {
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
              const position = {
                x: layer.transform.x + layer.transform.width / 2,
                y: layer.transform.y + layer.transform.height / 2,
                rotation: layer.transform.rotation,
                skewX: layer.transform.skewX,
                skewY: layer.transform.skewY,
              };
              return (
                <Group
                  key={layer.id}
                  clip={{
                    x: activeArea.rect.x,
                    y: activeArea.rect.y,
                    width: activeArea.rect.w,
                    height: activeArea.rect.h,
                  }}
                >
                  {layer.type === "image" ? (
                    <KonvaImage
                      ref={attachRef}
                      image={artworkCanvas(layer)}
                      {...position}
                      offsetX={layer.transform.width / 2}
                      offsetY={layer.transform.height / 2}
                      width={layer.transform.width}
                      height={layer.transform.height}
                      scaleX={layer.transform.flipX ? -1 : 1}
                      {...layerHandlers}
                    />
                  ) : (
                    (() => {
                      const natural = measureText(layer.text, layer.font, layer.letterSpacing);
                      const font = getTextFont(layer.font);
                      const sx = layer.transform.width / natural.width;
                      const sy = layer.transform.height / natural.height;
                      return (
                        <Text
                          ref={attachRef}
                          text={layer.text}
                          fontSize={TEXT_BASE_FONT_SIZE}
                          fontFamily={font?.family ?? "sans-serif"}
                          fontStyle={font ? `${font.weight}` : "normal"}
                          letterSpacing={layer.letterSpacing}
                          align={layer.align}
                          fill={layer.color}
                          stroke={layer.outline.width > 0 ? layer.outline.color : undefined}
                          strokeWidth={textStrokeWidth(layer.outline.width, sx, sy)}
                          fillAfterStrokeEnabled
                          {...position}
                          offsetX={natural.width / 2}
                          offsetY={natural.height / 2}
                          scaleX={sx * (layer.transform.flipX ? -1 : 1)}
                          scaleY={sy}
                          {...layerHandlers}
                        />
                      );
                    })()
                  )}
                </Group>
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
          </Layer>
        </Stage>
      ) : (
        <div className="bg-builder-backdrop min-h-64 w-full animate-pulse" aria-hidden="true" />
      )}
      {/* Empty side (v3): dashed guide, one-line instruction, same/different chooser. */}
      {scale > 0 && garmentCanvas && !hasLayers && emptyState ? (
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
