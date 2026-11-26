"use client";
/**
 * The builder canvas (Konva). Client-only: loaded through next/dynamic with ssr:false.
 *
 * The garment is pre-composed offscreen (see compositor.ts) and drawn as one image;
 * the artwork — with the fold shading baked in — is drawn on top, clipped to the
 * active print area, with a dashed guide and a Konva Transformer while editing.
 * The stage keeps template coordinates (view.width × view.height) as its logical
 * space and scales to fit its container. Everything on the canvas stays neutral —
 * the neon theme lives in the surrounding UI only.
 */
import Konva from "konva";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Transformer } from "react-konva";

import type { GarmentView, ViewId } from "@/lib/garments";
import type { MockupColors } from "@/lib/mockup-schema";
import { Button } from "@/components/ui/button";

import { composeArtworkLayer, composeGarment, type TemplateImages } from "./compositor";
import { centerToTopLeft, nudgeTransform, rotateAroundCenter, scaleAroundCenter } from "./geometry";
import { SideArtworkChooser } from "./side-artwork-chooser";
import type { BuilderTransform, BuilderViewState } from "./use-builder-state";

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

export interface GarmentStageHandle {
  /** The id of the view the stage is currently showing (exportViewPng waits for it). */
  getView(): ViewId;
  /** Renders the current view at native template size and returns a PNG blob. */
  exportPng(): Promise<Blob | null>;
}

export interface GarmentStageProps {
  garmentName: string;
  view: GarmentView;
  colors: MockupColors;
  placement?: BuilderViewState;
  /** Decoded artwork image (the object URL of the in-memory File). */
  artworkImg: HTMLImageElement | null;
  /** Empty-side state (v3): "Your design goes here" plus the same/different chooser. */
  emptyState?: {
    /** Uploaded files to offer for reuse; empty → just the upload CTA. */
    files: { index: number; url: string; name: string }[];
    onUse: (fileIndex: number) => void;
    onUploadDifferent: () => void;
  };
  onTransformCommit: (transform: BuilderTransform) => void;
  onRemove?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

const raf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export const GarmentStage = forwardRef<GarmentStageHandle, GarmentStageProps>(function GarmentStage(
  { garmentName, view, colors, placement, artworkImg, emptyState, onTransformCommit, onRemove, onUndo, onRedo },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const nodeRef = useRef<Konva.Image>(null);
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
  const selected = selectedView === view.id;
  const { images, error } = useTemplateImages(view);

  const artwork = placement?.artwork ?? null;
  const activeArea = view.printAreas.find((a) => a.id === placement?.printArea) ?? view.printAreas[0]!;

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

  // Deselect when the view changes (the artwork node is replaced).
  const selectThisView = () => setSelectedView(view.id);

  // Garment layer: mask fills + shading + highlight, clipped to the silhouette.
  const garmentCanvas = useMemo(() => (images ? composeGarment(view, colors, images) : null), [view, colors, images]);

  // Artwork layer: artwork with fold shading baked in, recomposed per committed transform.
  const artworkCanvas = useMemo(() => {
    if (!artworkImg || !artwork || !images) return null;
    return composeArtworkLayer(artworkImg, images.shading, artwork.transform, view);
  }, [artworkImg, artwork, images, view]);

  // Attach/detach the Transformer.
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    transformer.nodes(selected && nodeRef.current ? [nodeRef.current] : []);
    transformer.getLayer()?.batchDraw();
  }, [selected, artworkCanvas]);

  const commitFromNode = () => {
    const node = nodeRef.current;
    if (!node || !artwork) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const width = artwork.transform.width * Math.abs(scaleX);
    const height = artwork.transform.height * Math.abs(scaleY);
    const rotation = node.rotation();
    const topLeft = centerToTopLeft(node.x(), node.y(), width, height, rotation);
    onTransformCommit({
      x: topLeft.x,
      y: topLeft.y,
      width,
      height,
      rotation,
      flipX: scaleX < 0,
    });
  };

  const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length !== 2 || !artwork) return;
    e.evt.preventDefault();
    const [a, b] = [touches[0]!, touches[1]!];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const angle = (Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180) / Math.PI;
    const last = pinchRef.current;
    if (!last) {
      pinchRef.current = { dist, angle };
      return;
    }
    const node = nodeRef.current;
    if (!node) return;
    const factor = dist / last.dist;
    node.scaleX(node.scaleX() * factor);
    node.scaleY(node.scaleY() * factor);
    node.rotation(node.rotation() + (angle - last.angle));
    pinchRef.current = { dist, angle };
    node.getLayer()?.batchDraw();
  };

  const handleTouchEnd = () => {
    pinchRef.current = null;
    commitFromNode();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!artwork) return;
    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) onRedo?.();
      else onUndo?.();
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        onTransformCommit(nudgeTransform(artwork.transform, -step, 0));
        break;
      case "ArrowRight":
        e.preventDefault();
        onTransformCommit(nudgeTransform(artwork.transform, step, 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        onTransformCommit(nudgeTransform(artwork.transform, 0, -step));
        break;
      case "ArrowDown":
        e.preventDefault();
        onTransformCommit(nudgeTransform(artwork.transform, 0, step));
        break;
      case "+":
      case "=":
        e.preventDefault();
        onTransformCommit(scaleAroundCenter(artwork.transform, 1.02));
        break;
      case "-":
      case "_":
        e.preventDefault();
        onTransformCommit(scaleAroundCenter(artwork.transform, 1 / 1.02));
        break;
      case "r":
      case "R":
        e.preventDefault();
        onTransformCommit(rotateAroundCenter(artwork.transform, 15));
        break;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        onRemove?.();
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

  const transformText = artwork
    ? `x=${Math.round(artwork.transform.x)}, y=${Math.round(artwork.transform.y)}, w=${Math.round(artwork.transform.width)}, h=${Math.round(artwork.transform.height)}, rotation=${Math.round(artwork.transform.rotation)}${artwork.transform.flipX ? ", flipped" : ""}`
    : "no artwork";

  return (
    <div
      ref={containerRef}
      data-testid="builder-canvas"
      role="group"
      tabIndex={0}
      aria-label={`Mockup canvas: ${garmentName} ${view.label.toLowerCase()}. ${artwork ? "Drag to move your design. " : ""}Keyboard: arrow keys nudge, plus and minus scale, R rotates, Delete removes, Control-Z undoes.`}
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
            if (e.target === e.target.getStage()) setSelectedView(null);
          }}
          onTouchStart={(e) => {
            if (e.target === e.target.getStage()) setSelectedView(null);
          }}
        >
          <Layer listening={false}>
            <KonvaImage image={garmentCanvas} x={0} y={0} width={view.width} height={view.height} />
          </Layer>
          <Layer ref={layerRef}>
            {artwork && artworkCanvas && artworkImg ? (
              <Group
                clip={{
                  x: activeArea.rect.x,
                  y: activeArea.rect.y,
                  width: activeArea.rect.w,
                  height: activeArea.rect.h,
                }}
              >
                <KonvaImage
                  ref={nodeRef}
                  image={artworkCanvas}
                  draggable
                  x={artwork.transform.x + artwork.transform.width / 2}
                  y={artwork.transform.y + artwork.transform.height / 2}
                  offsetX={artwork.transform.width / 2}
                  offsetY={artwork.transform.height / 2}
                  width={artwork.transform.width}
                  height={artwork.transform.height}
                  rotation={artwork.transform.rotation}
                  scaleX={artwork.transform.flipX ? -1 : 1}
                  onClick={selectThisView}
                  onTap={selectThisView}
                  onDragEnd={commitFromNode}
                  onTransformEnd={commitFromNode}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onMouseEnter={(e) => {
                    const stage = e.target.getStage();
                    if (stage) stage.container().style.cursor = "move";
                  }}
                  onMouseLeave={(e) => {
                    const stage = e.target.getStage();
                    if (stage) stage.container().style.cursor = "";
                  }}
                />
              </Group>
            ) : null}
            <Transformer
              ref={transformerRef}
              keepRatio
              rotateEnabled
              enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
              anchorSize={anchorSize}
              anchorCornerRadius={anchorCornerRadius}
              boundBoxFunc={(oldBox, newBox) => (newBox.width < 8 || newBox.height < 8 ? oldBox : newBox)}
            />
            {placement ? (
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
            ) : null}
          </Layer>
        </Stage>
      ) : (
        <div className="bg-builder-backdrop min-h-64 w-full animate-pulse" aria-hidden="true" />
      )}
      {/* Empty side (v3): dashed guide, one-line instruction, same/different chooser. */}
      {scale > 0 && garmentCanvas && !artwork && emptyState ? (
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
        {transformText}
      </p>
    </div>
  );
});

export { loadTemplate };
