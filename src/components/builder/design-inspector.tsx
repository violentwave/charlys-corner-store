"use client";
/**
 * Step 3: the design inspector (docs/04 §3, simple-panel pass 2026-11-26). The everyday
 * controls are visible — Side (segmented control + print location on one row), Add, the
 * Selected item (text/font/ink, one action row, printed size) — and everything else is a
 * tap away: the layers list only appears at 2+ layers, and the advanced controls fold
 * into disclosures inside the selected-item panel. One divider between sections, no
 * nested bordered boxes; the warnings keep their bordered look (they must stand out).
 * "Signed in as" is a quiet line at the bottom. Desktop: this panel sits right of the
 * canvas; at 360px the sections stack below it.
 */
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GarmentView, ViewId } from "@/lib/garments";
import type { TextFontId } from "@/lib/text-fonts";
import { effectiveDpi } from "@/lib/mockup-schema";
import { printedInches } from "@/lib/garments";
import { RECOMMEND_LABEL, type PrintMethodChoice, type PrintMethodId } from "@/lib/print-methods";

import { isOutsideArea } from "./geometry";
import { InspectorSection } from "./inspector-section";
import { LayersPanel } from "./layers-panel";
import { LayerControls } from "./layer-controls";
import type { BuilderLayer, BuilderViewState, TextPatch } from "./use-builder-state";

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
  /** This side's print method (already checked against garment, color and area). */
  method: PrintMethodChoice;
  /** Every method, with why it can't be used here (null = usable). */
  methodOptions: { id: PrintMethodId; name: string; blurb: string; blocker: string | null }[];
  onSetPrintMethod: (viewId: ViewId, method: PrintMethodChoice) => void;
  onSelectLayer: (layerId: string | null) => void;
  onTransform: (layerId: string, transform: BuilderLayer["transform"], mergeKey?: string) => void;
  onTextChange: (layerId: string, patch: TextPatch, mergeKey?: string) => void;
  onOutlineChange: (layerId: string, outline: { color: string; width: number }, mergeKey?: string) => void;
  onRemoveLayer: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  onMoveLayer: (layerId: string, to: "up" | "down") => void;
  /** The member's brand kit (Member perks): inks/fonts lead the pickers, the logo is one tap. */
  brandInks?: string[];
  brandFonts?: TextFontId[];
  logo?: { name: string; url: string | null } | null;
  onAddLogo?: () => void;
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
  method,
  methodOptions,
  onSetPrintMethod,
  onSelectLayer,
  onTransform,
  onTextChange,
  onOutlineChange,
  onRemoveLayer,
  onDuplicateLayer,
  onMoveLayer,
  brandInks,
  brandFonts,
  logo,
  onAddLogo,
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
      {fileError ? (
        <p role="alert" aria-live="polite" className="text-danger flex items-center gap-1.5 text-xs">
          <span aria-hidden="true">⚠</span>
          {fileError}
        </p>
      ) : null}

      {/* Side: the segmented control and the print location share one row on desktop. */}
      <InspectorSection label="Side" divider={false}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
          <div className="sm:w-52 sm:shrink-0">
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
        </div>
        <div className="mt-3">
          <label htmlFor="print-method" className="text-text-2 mb-1 block text-xs">
            Print method
          </label>
          <Select value={method} onValueChange={(value) => onSetPrintMethod(view.id, value as PrintMethodChoice)}>
            <SelectTrigger
              id="print-method"
              data-testid="print-method"
              className="h-11 w-full"
              aria-describedby="print-method-help"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recommend">{RECOMMEND_LABEL}</SelectItem>
              {methodOptions.map((m) => (
                <SelectItem key={m.id} value={m.id} disabled={m.blocker !== null} data-testid={`print-method-${m.id}`}>
                  <span className="flex flex-col">
                    <span>{m.name}</span>
                    {m.blocker ? <span className="text-text-3 text-xs">{m.blocker}</span> : null}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id="print-method-help" className="text-text-3 mt-1 text-xs" data-testid="print-method-help">
            {method === "recommend"
              ? "We'll pick what suits your design, garment and quantity."
              : methodOptions.find((m) => m.id === method)?.blurb}
          </p>
        </div>
      </InspectorSection>

      <InspectorSection label="Add">
        <div className={logo?.url ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
          <Button type="button" onClick={onUploadClick} disabled={capReached} data-testid="upload-image">
            Upload image
          </Button>
          <Button type="button" variant="secondary" onClick={onAddText} disabled={capReached} data-testid="add-text">
            Add text
          </Button>
          {logo?.url ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onAddLogo}
              disabled={capReached}
              data-testid="add-my-logo"
              title={logo.name}
            >
              Add my logo
            </Button>
          ) : null}
        </div>
        {capReached ? (
          <p className="text-text-3 text-xs" role="note" data-testid="layers-cap">
            This side holds 8 designs — remove one to add another.
          </p>
        ) : null}
      </InspectorSection>

      {/* The list earns its place at 2 layers: at 0 the canvas guides, at 1 the
          selected-item panel covers it (P48-2). */}
      {viewState.layers.length >= 2 ? (
        <InspectorSection label={`Layers (${viewState.layers.length})`}>
          <LayersPanel
            rows={rows}
            selectedId={viewState.selectedLayerId}
            onSelect={onSelectLayer}
            onMove={onMoveLayer}
            onDuplicate={onDuplicateLayer}
            onRemove={onRemoveLayer}
          />
        </InspectorSection>
      ) : null}

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
            brandInks={brandInks}
            brandFonts={brandFonts}
            lockRatio={lockRatio}
            onLockRatioChange={onLockRatioChange}
            onTransform={(transform, mergeKey) => onTransform(selected.id, transform, mergeKey)}
            onTextChange={(patch, mergeKey) => onTextChange(selected.id, patch, mergeKey)}
            onOutlineChange={(outline, mergeKey) => onOutlineChange(selected.id, outline, mergeKey)}
            onDuplicate={() => onDuplicateLayer(selected.id)}
            onRemove={() => onRemoveLayer(selected.id)}
          />
          {(() => {
            const printed = printedInches(area, { w: selected.transform.width, h: selected.transform.height });
            return (
              <>
                <p className="text-text-3 text-xs" data-testid="printed-size">
                  Printed size: about{" "}
                  <span className="text-neon-yellow font-mono">
                    {printed.w.toFixed(1)}″ × {printed.h.toFixed(1)}″
                  </span>
                </p>
                {selected.type === "image" &&
                selectedFileReady &&
                effectiveDpi(selected.naturalWidth, printed.w) < 150 ? (
                  <p
                    role="status"
                    data-testid="dpi-warning"
                    className="border-border bg-bg-2/60 text-text-2 flex items-start gap-1.5 rounded-md border p-2 text-xs"
                  >
                    <span aria-hidden="true">⚠</span>
                    Low resolution: about {Math.round(effectiveDpi(selected.naturalWidth, printed.w))} DPI at this size
                    — 150 DPI or more prints crisp. A larger image will look better.
                  </p>
                ) : null}
              </>
            );
          })()}
        </InspectorSection>
      ) : null}

      {accountEmail ? (
        <p className="text-text-3 text-xs" data-testid="signed-in-as">
          Signed in as <span className="text-text-2">{accountEmail}</span>
        </p>
      ) : null}
    </div>
  );
}
