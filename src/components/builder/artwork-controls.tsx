"use client";
import { useState } from "react";

import { printedInches, type GarmentConfig, type GarmentView, type ViewId } from "@/lib/garments";
import { effectiveDpi, MOCKUP_ARTWORK_HELP } from "@/lib/mockup-schema";
import { Button } from "@/components/ui/button";

import { centerInRect, rotateAroundCenter, centerToTopLeft, topLeftToCenter } from "./geometry";
import { isLowResolution } from "./print";
import { fitTransform, type BuilderTransform, type BuilderViewState } from "./use-builder-state";

export interface ArtworkControlsProps {
  garment: GarmentConfig;
  view: GarmentView;
  views: GarmentView[];
  placement?: BuilderViewState;
  /** The decoded File lives in the builder; false after a refresh until re-selected. */
  hasFile: boolean;
  fileError: string | null;
  /** The builder gates this on a verified account before opening the file picker (v2). */
  onUploadClick: () => void;
  /** Called with a dropped file; the builder runs the same account gate first. */
  onDropFile: (file: File) => void;
  /** The verified account's email, shown as "Signed in as …" (v2). */
  accountEmail: string | null;
  onViewChange: (view: ViewId) => void;
  onSetPrintArea: (viewId: ViewId, areaId: string) => void;
  onTransformCommit: (transform: BuilderTransform) => void;
  onRemove: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/** Resize box to `width` template px, keeping the rotated center pinned. */
function setWidth(t: BuilderTransform, width: number): BuilderTransform {
  const { cx, cy } = topLeftToCenter(t);
  const height = (width * t.height) / t.width;
  const { x, y } = centerToTopLeft(cx, cy, width, height, t.rotation);
  return { ...t, x, y, width, height };
}

/** Rotate by a delta around the artwork's center. */
function rotateBy(t: BuilderTransform, delta: number): BuilderTransform {
  return rotateAroundCenter(t, delta);
}

/**
 * Step 3: "Add your design". Front and center: Upload/Replace, a size slider in inches,
 * Center, Rotate 15° and Remove. Flip, Reset, Undo/Redo and the keyboard help live in
 * the "More" disclosure — every shortcut still works (docs/04 §3 v2).
 */
export function ArtworkControls({
  garment,
  view,
  views,
  placement,
  hasFile,
  fileError,
  onUploadClick,
  onDropFile,
  accountEmail,
  onViewChange,
  onSetPrintArea,
  onTransformCommit,
  onRemove,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ArtworkControlsProps) {
  const artwork = placement?.artwork ?? null;
  const [moreOpen, setMoreOpen] = useState(false);
  const activeArea = view.printAreas.find((a) => a.id === placement?.printArea) ?? view.printAreas[0]!;
  const inches = artwork ? printedInches(activeArea, { w: artwork.transform.width, h: 0 }) : null;

  return (
    <div
      className="flex flex-col gap-6"
      data-testid="artwork-controls"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) onDropFile(file);
      }}
    >
      {accountEmail ? (
        <p className="text-text-3 text-xs" data-testid="signed-in-as">
          Signed in as <span className="text-text-2">{accountEmail}</span>
        </p>
      ) : null}

      {views.length > 1 ? (
        <div role="group" aria-label="View">
          <p className="text-text-1 mb-2 text-sm font-medium">Side</p>
          <div className="flex gap-2">
            {views.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={v.id === view.id}
                data-testid={`view-${v.id}`}
                onClick={() => onViewChange(v.id)}
                className="border-border bg-bg-3 text-text-1 focus-visible:ring-neon-cyan hover:border-border-strong aria-pressed:border-neon-cyan aria-pressed:text-neon-cyan flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div role="group" aria-label="Print location">
        <p className="text-text-1 mb-2 text-sm font-medium">Print location</p>
        <div className="flex flex-wrap gap-2" data-testid="print-areas">
          {view.printAreas.map((area) => (
            <button
              key={area.id}
              type="button"
              aria-pressed={area.id === placement?.printArea}
              data-testid={`print-area-${area.id}`}
              onClick={() => onSetPrintArea(view.id, area.id)}
              className="border-border bg-bg-3 text-text-2 focus-visible:ring-neon-cyan hover:border-border-strong aria-pressed:border-neon-pink aria-pressed:text-text-1 flex min-h-11 items-center rounded-full border px-3 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              {area.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        {fileError ? (
          <p role="alert" aria-live="polite" className="text-danger mb-2 flex items-center gap-1.5 text-xs">
            <span aria-hidden="true">⚠</span>
            {fileError}
          </p>
        ) : null}
        {artwork && !hasFile ? (
          <p className="border-border bg-bg-2/60 mb-2 rounded-md border p-2 text-xs" data-testid="relink-note">
            Your saved design is still here — pick your artwork file again to put it back on the mockup.
          </p>
        ) : null}
        <Button type="button" onClick={onUploadClick} data-testid="upload-artwork" className="w-full sm:w-auto">
          {artwork ? "Replace" : "Upload"}
        </Button>{" "}
        <p className="text-text-3 mt-1.5 text-xs">{MOCKUP_ARTWORK_HELP}</p>
        {artwork ? (
          <p className="text-text-2 mt-2 truncate text-xs" data-testid="artwork-name">
            <span className="sr-only">Artwork file: </span>
            {artwork.name}
            {!hasFile ? " (needs re-selecting)" : ""}
          </p>
        ) : null}
      </div>

      {artwork ? (
        <div className="flex flex-col gap-4" data-testid="transform-controls">
          <div>
            <label
              htmlFor="builder-size"
              className="text-text-1 mb-1 flex items-center justify-between text-sm font-medium"
            >
              Size
              <span className="text-text-3 font-mono text-xs">{inches ? `${inches.w.toFixed(1)}″ wide` : ""}</span>
            </label>
            <input
              id="builder-size"
              type="range"
              // In inches, matching the print area's max width (docs/04 §3 v2).
              min={1}
              max={activeArea.maxInches.w}
              step={0.25}
              value={Math.min(inches?.w ?? 1, activeArea.maxInches.w)}
              onChange={(e) => {
                const px = (Number(e.target.value) * activeArea.rect.w) / activeArea.maxInches.w;
                onTransformCommit(setWidth(artwork.transform, px));
              }}
              className="w-full accent-[var(--neon-cyan)]"
              data-testid="size-slider"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onTransformCommit(centerInRect(artwork.transform, activeRect(view, placement?.printArea)))}
            >
              Center
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onTransformCommit(rotateBy(artwork.transform, 15))}
            >
              Rotate 15°
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onRemove} data-testid="remove-artwork">
              Remove
            </Button>
          </div>

          <details
            open={moreOpen}
            onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}
            className="text-text-2 text-xs"
            data-testid="more-controls"
          >
            <summary className="text-text-1 focus-visible:ring-neon-cyan cursor-pointer rounded text-sm font-medium focus-visible:ring-2 focus-visible:outline-none">
              More
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <div>
                <label
                  htmlFor="builder-rotate"
                  className="text-text-1 mb-1 flex items-center justify-between text-sm font-medium"
                >
                  Rotate
                  <span className="text-text-3 font-mono text-xs">{Math.round(artwork.transform.rotation)}°</span>
                </label>
                <input
                  id="builder-rotate"
                  type="range"
                  min={-180}
                  max={180}
                  step={15}
                  value={Math.round(artwork.transform.rotation)}
                  onChange={(e) =>
                    onTransformCommit(
                      rotateAroundCenter(artwork.transform, Number(e.target.value) - artwork.transform.rotation),
                    )
                  }
                  className="w-full accent-[var(--neon-cyan)]"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-pressed={artwork.transform.flipX}
                  onClick={() => onTransformCommit({ ...artwork.transform, flipX: !artwork.transform.flipX })}
                >
                  Flip
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    onTransformCommit({
                      ...fitTransform(
                        activeRect(view, placement?.printArea),
                        artwork.naturalWidth,
                        artwork.naturalHeight,
                      ),
                      flipX: artwork.transform.flipX,
                    })
                  }
                >
                  Reset
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={onUndo} disabled={!canUndo} data-testid="undo">
                  Undo
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={onRedo} disabled={!canRedo} data-testid="redo">
                  Redo
                </Button>
              </div>
              <ul className="flex flex-col gap-1">
                <li>Arrow keys — nudge (hold Shift for 10 px)</li>
                <li>+ / − — scale</li>
                <li>R — rotate 15°</li>
                <li>Delete or Backspace — remove artwork</li>
                <li>Ctrl/Cmd + Z — undo · Ctrl/Cmd + Shift + Z — redo</li>
              </ul>
            </div>
          </details>

          <PrintedSize garment={garment} view={view} placement={placement} />
        </div>
      ) : null}
    </div>
  );
}

function activeRect(view: GarmentView, printAreaId?: string) {
  return (view.printAreas.find((a) => a.id === printAreaId) ?? view.printAreas[0]!).rect;
}

/** Approximate printed size in inches plus the low-resolution warning (docs/04 §3). */
function PrintedSize({
  garment,
  view,
  placement,
}: {
  garment: GarmentConfig;
  view: GarmentView;
  placement?: BuilderViewState;
}) {
  const artwork = placement?.artwork;
  if (!artwork) return null;
  const area = view.printAreas.find((a) => a.id === placement?.printArea) ?? view.printAreas[0]!;
  const inches = printedInches(area, { w: artwork.transform.width, h: artwork.transform.height });
  const lowRes = isLowResolution(artwork.kind, artwork.naturalWidth, inches.w);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-text-2 text-sm" data-testid="printed-size">
        Printed size: about{" "}
        <span className="text-neon-yellow font-mono">
          {inches.w.toFixed(1)}″ × {inches.h.toFixed(1)}″
        </span>
      </p>
      {lowRes ? (
        <p
          role="status"
          data-testid="dpi-warning"
          className="border-border bg-bg-2/60 text-text-2 flex items-start gap-1.5 rounded-md border p-2 text-xs"
        >
          <span aria-hidden="true">⚠</span>
          Low resolution: about {Math.round(effectiveDpi(artwork.naturalWidth, inches.w))} DPI at this size — 150 DPI or
          more prints crisp. A larger image will look better on your {garment.name.toLowerCase()}.
        </p>
      ) : null}
    </div>
  );
}
