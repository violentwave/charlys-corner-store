"use client";
import { useId } from "react";

import { printedInches, type GarmentConfig, type GarmentView, type ViewId } from "@/lib/garments";
import { effectiveDpi, MOCKUP_ARTWORK_ACCEPT, MOCKUP_ARTWORK_HELP } from "@/lib/mockup-schema";
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
  onFileSelected: (file: File) => void;
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

/**
 * Step 3: front/back toggle, print-location presets, upload/drop zone, transform
 * controls, printed size + low-DPI warning, and the keyboard shortcut help.
 */
export function ArtworkControls({
  garment,
  view,
  views,
  placement,
  hasFile,
  fileError,
  onFileSelected,
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
  const inputId = useId();

  return (
    <div className="flex flex-col gap-6" data-testid="artwork-controls">
      {views.length > 1 ? (
        <div role="group" aria-label="View">
          <p className="text-text-1 mb-2 text-sm font-medium">View</p>
          <div className="flex gap-2">
            {views.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={v.id === view.id}
                data-testid={`view-${v.id}`}
                onClick={() => onViewChange(v.id)}
                className="border-border bg-bg-3 text-text-1 focus-visible:ring-neon-cyan hover:border-border-strong aria-pressed:border-neon-cyan aria-pressed:text-neon-cyan rounded-full border px-4 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
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
              className="border-border bg-bg-3 text-text-2 focus-visible:ring-neon-cyan hover:border-border-strong aria-pressed:border-neon-pink aria-pressed:text-text-1 rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              {area.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-text-1 mb-2 text-sm font-medium">Your design</p>
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
        <label
          htmlFor={inputId}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) onFileSelected(file);
          }}
          className="border-border text-text-2 hover:border-neon-cyan focus-visible:ring-neon-cyan flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed p-4 text-center text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <span aria-hidden="true" className="text-lg">
            🎨
          </span>
          <span className="text-text-1">{artwork ? "Replace artwork" : "Upload artwork"}</span>
          <span className="text-text-3 text-xs">Drop a file here or click to browse</span>
          <input
            id={inputId}
            type="file"
            accept={MOCKUP_ARTWORK_ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelected(file);
              e.target.value = "";
            }}
          />
        </label>
        <p className="text-text-3 mt-1.5 text-xs">{MOCKUP_ARTWORK_HELP}</p>
        {artwork ? (
          <p className="text-text-2 mt-2 truncate text-xs" data-testid="artwork-name">
            <span className="sr-only">Artwork file: </span>
            {artwork.name}
            {!hasFile ? " (needs re-selecting)" : ""}
          </p>
        ) : null}
        {artwork && hasFile ? (
          <button
            type="button"
            onClick={onRemove}
            data-testid="remove-artwork"
            className="text-neon-cyan focus-visible:ring-neon-cyan mt-1 rounded-md px-1 text-xs focus-visible:ring-2 focus-visible:outline-none"
          >
            Remove from {view.label.toLowerCase()}
          </button>
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
              <span className="text-text-3 font-mono text-xs">{Math.round(artwork.transform.width)} px</span>
            </label>
            <input
              id="builder-size"
              type="range"
              min={8}
              max={Math.max(view.width, Math.round(artwork.transform.width))}
              step={1}
              value={Math.round(artwork.transform.width)}
              onChange={(e) => onTransformCommit(setWidth(artwork.transform, Number(e.target.value)))}
              className="w-full accent-[var(--neon-cyan)]"
            />
          </div>
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
              onClick={() => onTransformCommit(centerInRect(artwork.transform, activeRect(view, placement?.printArea)))}
            >
              Center
            </Button>
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
                  ...fitTransform(activeRect(view, placement?.printArea), artwork.naturalWidth, artwork.naturalHeight),
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

          <PrintedSize garment={garment} view={view} placement={placement} />
        </div>
      ) : null}

      <details className="text-text-2 text-xs">
        <summary className="text-text-1 cursor-pointer text-sm font-medium">Keyboard shortcuts</summary>
        <ul className="mt-2 flex flex-col gap-1">
          <li>Arrow keys — nudge (hold Shift for 10 px)</li>
          <li>+ / − — scale</li>
          <li>R — rotate 15°</li>
          <li>Delete or Backspace — remove artwork</li>
          <li>Ctrl/Cmd + Z — undo · Ctrl/Cmd + Shift + Z — redo</li>
        </ul>
      </details>
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
