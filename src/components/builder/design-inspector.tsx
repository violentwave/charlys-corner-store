"use client";
/**
 * Step 3: the design inspector (docs/04 §3 v4). One calm panel: Side, Add, Layers,
 * Selected item — grouped with one-line hints, no stacked bordered boxes, one primary
 * action per area. Desktop: this panel sits right of the canvas; at 360px the sections
 * stack below it.
 */
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GarmentView, ViewId } from "@/lib/garments";
import { effectiveDpi, MAX_LAYERS_PER_VIEW } from "@/lib/mockup-schema";
import { printedInches } from "@/lib/garments";

import { isOutsideArea } from "./geometry";
import { InspectorSection } from "./inspector-section";
import { LayersPanel } from "./layers-panel";
import { LayerControls } from "./layer-controls";
import type { BuilderLayer, BuilderViewState } from "./use-builder-state";

export interface DesignInspectorProps {
  view: GarmentView;
  views: GarmentView[];
  viewState: BuilderViewState;
  /** Which sides already carry art (the side picker marks them). */
  artByView: Partial<Record<ViewId, boolean>>;
  /** The builder's uploaded files, for layer thumbnails (fileIndex → { url, name }). */
  files: { index: number; url: string; name: string }[];
  /** The decoded file exists for the selected image layer (false after a refresh). */
  selectedFileReady: boolean;
  fileError: string | null;
  capReached: boolean;
  accountEmail: string | null;
  /** The Transformer's lock-ratio toggle (shared with the canvas). */
  lockRatio: boolean;
  onLockRatioChange: (lock: boolean) => void;
  onUploadClick: () => void;
  onDropFile: (file: File) => void;
  onAddText: () => void;
  onViewChange: (view: ViewId) => void;
  onSetPrintArea: (viewId: ViewId, areaId: string) => void;
  onSelectLayer: (layerId: string | null) => void;
  onTransform: (layerId: string, transform: BuilderLayer["transform"], mergeKey?: string) => void;
  onTextChange: (
    layerId: string,
    patch: {
      text?: string;
      font?: import("@/lib/text-fonts").TextFontId;
      color?: string;
      align?: "left" | "center" | "right";
      letterSpacing?: number;
    },
    mergeKey?: string,
  ) => void;
  onOutlineChange: (layerId: string, outline: { color: string; width: number }, mergeKey?: string) => void;
  onRemoveLayer: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  onMoveLayer: (layerId: string, to: "up" | "down") => void;
}

export function DesignInspector({
  view,
  views,
  viewState,
  artByView,
  files,
  selectedFileReady,
  fileError,
  capReached,
  accountEmail,
  lockRatio,
  onLockRatioChange,
  onUploadClick,
  onDropFile,
  onAddText,
  onViewChange,
  onSetPrintArea,
  onSelectLayer,
  onTransform,
  onTextChange,
  onOutlineChange,
  onRemoveLayer,
  onDuplicateLayer,
  onMoveLayer,
}: DesignInspectorProps) {
  const selected = viewState.layers.find((l) => l.id === viewState.selectedLayerId) ?? null;
  const area = view.printAreas.find((a) => a.id === viewState.printArea) ?? view.printAreas[0]!;
  const fileByIndex = new Map(files.map((f) => [f.index, f]));
  const rows = [...viewState.layers].reverse().map((layer) => ({
    id: layer.id,
    type: layer.type,
    name:
      layer.type === "text"
        ? layer.text.slice(0, 20) || "Text"
        : (fileByIndex.get(layer.fileIndex)?.name ?? layer.name),
    thumbUrl: layer.type === "image" ? fileByIndex.get(layer.fileIndex)?.url : undefined,
  }));

  return (
    <div
      className="flex flex-col gap-4"
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
      {fileError ? (
        <p role="alert" aria-live="polite" className="text-danger flex items-center gap-1.5 text-xs">
          <span aria-hidden="true">⚠</span>
          {fileError}
        </p>
      ) : null}

      <InspectorSection label="Side" divider={false}>
        <div role="group" aria-label="Side" className="flex flex-wrap gap-1.5">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={v.id === view.id}
              data-testid={`view-${v.id}`}
              onClick={() => onViewChange(v.id)}
              className="border-border bg-bg-3 text-text-1 focus-visible:ring-neon-cyan hover:border-border-strong aria-pressed:border-neon-cyan aria-pressed:text-neon-cyan relative flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              {v.label}
              {artByView[v.id] ? (
                <>
                  <span aria-hidden="true" className="bg-neon-pink h-1.5 w-1.5 rounded-full" />
                  <span className="sr-only">(has a design)</span>
                </>
              ) : null}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <label htmlFor="print-location" className="text-text-2 mb-1 block text-xs">
            Print location
          </label>
          <Select value={viewState.printArea} onValueChange={(areaId) => onSetPrintArea(view.id, areaId)}>
            <SelectTrigger id="print-location" data-testid="print-location" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {view.printAreas.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </InspectorSection>

      <InspectorSection label="Add" hint={`${viewState.layers.length}/${MAX_LAYERS_PER_VIEW} on this side`}>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" onClick={onUploadClick} disabled={capReached} data-testid="upload-image">
            Upload image
          </Button>
          <Button type="button" variant="secondary" onClick={onAddText} disabled={capReached} data-testid="add-text">
            Add text
          </Button>
        </div>
        {capReached ? (
          <p className="text-text-3 text-xs" role="note" data-testid="layers-cap">
            This side holds 8 designs — remove one to add another.
          </p>
        ) : (
          <p className="text-text-3 text-xs">Each side gets its own stack. Transparent PNGs print best.</p>
        )}
      </InspectorSection>

      <InspectorSection label="Layers" hint="Top prints last">
        <LayersPanel
          rows={rows}
          selectedId={viewState.selectedLayerId}
          onSelect={onSelectLayer}
          onMove={onMoveLayer}
          onDuplicate={onDuplicateLayer}
          onRemove={onRemoveLayer}
        />
      </InspectorSection>

      {selected ? (
        <InspectorSection label={selected.type === "text" ? "Selected text" : "Selected image"}>
          {selected.type === "image" && !selectedFileReady ? (
            <p className="border-border bg-bg-2/60 mb-2 rounded-md border p-2 text-xs" data-testid="relink-note">
              Your saved design is still here — upload the file again to put it back.
            </p>
          ) : null}
          {isOutsideArea(selected.transform, area.rect) ? (
            <p
              role="status"
              data-testid="outside-area"
              className="border-border bg-bg-2/60 text-text-2 mb-2 flex items-start gap-1.5 rounded-md border p-2 text-xs"
            >
              <span aria-hidden="true">⚠</span>
              Part of this runs past the print area (dashed box) and won&apos;t print. Shown faded on the shirt. Use
              &ldquo;Fit to area&rdquo; to pull it in, or pick a bigger print location.
            </p>
          ) : null}
          <LayerControls
            area={area}
            imageLayer={selected.type === "image" ? selected : undefined}
            textLayer={selected.type === "text" ? selected : undefined}
            lockRatio={lockRatio}
            onLockRatioChange={onLockRatioChange}
            onTransform={(transform, mergeKey) => onTransform(selected.id, transform, mergeKey)}
            onTextChange={(patch, mergeKey) => onTextChange(selected.id, patch, mergeKey)}
            onOutlineChange={(outline, mergeKey) => onOutlineChange(selected.id, outline, mergeKey)}
          />
          {selected.type === "image" && selectedFileReady
            ? (() => {
                const printed = printedInches(area, { w: selected.transform.width, h: selected.transform.height });
                const lowDpi = effectiveDpi(selected.naturalWidth, printed.w) < 150;
                return lowDpi ? (
                  <p
                    role="status"
                    data-testid="dpi-warning"
                    className="border-border bg-bg-2/60 text-text-2 mt-2 flex items-start gap-1.5 rounded-md border p-2 text-xs"
                  >
                    <span aria-hidden="true">⚠</span>
                    Low resolution: about {Math.round(effectiveDpi(selected.naturalWidth, printed.w))} DPI at this size
                    — 150 DPI or more prints crisp. A larger image will look better.
                  </p>
                ) : (
                  <p className="text-text-3 text-xs" data-testid="printed-size">
                    Printed size: about{" "}
                    <span className="text-neon-yellow font-mono">
                      {printed.w.toFixed(1)}″ × {printed.h.toFixed(1)}″
                    </span>
                  </p>
                );
              })()
            : null}
        </InspectorSection>
      ) : null}
    </div>
  );
}
