"use client";
/**
 * The /design builder shell: stepper, layout (canvas + controls), file handling and
 * the P4-2 email-gate placeholder. Loaded client-only through next/dynamic (ssr:false)
 * because Konva must never run on the server.
 */
import { useEffect, useRef, useState } from "react";

import { detectArtworkKind, ARTWORK_MAX_BYTES } from "@/lib/artwork";
import { getGarment, type ViewId } from "@/lib/garments";
import { MOCKUP_ARTWORK_KINDS } from "@/lib/mockup-schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { ArtworkControls } from "./artwork-controls";
import { ColorPicker } from "./color-picker";
import { DetailsStep } from "./details-step";
import { GarmentPicker } from "./garment-picker";
import { GarmentStage, loadTemplate, type GarmentStageHandle } from "./garment-stage";
import { useBuilderState, type BuilderStep } from "./use-builder-state";

const STEPS: { id: BuilderStep; label: string }[] = [
  { id: 1, label: "Garment" },
  { id: 2, label: "Colors" },
  { id: 3, label: "Design" },
  { id: 4, label: "Details" },
  { id: 5, label: "Get mockup" },
];

const raf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export function Builder() {
  const { state, dispatch, canUndo, canRedo, undo, redo } = useBuilderState();
  const { design, step } = state;
  const garment = getGarment(design.garment);

  const [requestedView, setRequestedView] = useState<ViewId>("front");
  const activeViewId: ViewId = garment.views.some((v) => v.id === requestedView) ? requestedView : garment.views[0]!.id;
  const activeView = garment.views.find((v) => v.id === activeViewId)!;

  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [artworkImg, setArtworkImg] = useState<HTMLImageElement | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const stageRef = useRef<GarmentStageHandle>(null);

  // Only one object URL alive at a time; revoked on replace and on unmount.
  useEffect(
    () => () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    },
    [fileUrl],
  );

  const hasFile = file !== null && artworkImg !== null;

  const handleFileSelected = async (selected: File) => {
    setFileError(null);
    if (selected.size > ARTWORK_MAX_BYTES) {
      setFileError("That file is larger than 20 MB. Please upload a smaller image.");
      return;
    }
    const bytes = new Uint8Array(await selected.arrayBuffer());
    const kind = detectArtworkKind(bytes);
    const builderKind = MOCKUP_ARTWORK_KINDS.find((k) => k === kind);
    if (!builderKind) {
      setFileError("That file type won't render on the mockup. Please use PNG, JPG, WEBP, or SVG.");
      return;
    }
    const url = URL.createObjectURL(selected);
    let img: HTMLImageElement;
    try {
      img = await loadTemplate(url);
    } catch {
      URL.revokeObjectURL(url);
      setFileError("We couldn't read that image. If it's an SVG, re-export it with a width and height.");
      return;
    }
    if (img.naturalWidth === 0) {
      URL.revokeObjectURL(url);
      setFileError("That image has no usable size. Please re-export it with real dimensions.");
      return;
    }
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(selected);
    setFileUrl(url);
    setArtworkImg(img);
    dispatch({
      type: "placeArtwork",
      views: garment.views.map((v) => v.id),
      meta: {
        name: selected.name,
        kind: builderKind,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      },
    });
  };

  /** Renders `viewId` at native template size and returns a PNG blob (P4-2 uses this). */
  const exportViewPng = async (viewId: ViewId): Promise<Blob | null> => {
    if (viewId === activeViewId) return stageRef.current?.exportPng() ?? null;
    const previous = activeViewId;
    setRequestedView(viewId);
    await raf();
    await raf();
    await raf();
    const blob = stageRef.current?.exportPng() ?? null;
    setRequestedView(previous);
    return blob;
  };

  const downloadPreview = async () => {
    const blob = await exportViewPng(activeViewId);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mockup-${design.garment}-${activeViewId}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const goStep = (next: BuilderStep) => {
    dispatch({ type: "setStep", step: next });
    // Steps live below the canvas on phones; keep the panel in view.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      document.getElementById("builder-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <div className="flex flex-col gap-2 lg:sticky lg:top-24">
        <GarmentStage
          ref={stageRef}
          garmentName={garment.name}
          view={activeView}
          colors={design.colors}
          placement={design.views[activeViewId]}
          artworkImg={artworkImg}
          onTransformCommit={(transform) => dispatch({ type: "setTransform", view: activeViewId, transform })}
          onRemove={() => dispatch({ type: "removeArtwork", view: activeViewId })}
          onUndo={undo}
          onRedo={redo}
        />
        <p className="text-text-3 text-xs">
          Preview on a neutral studio background — the exported mockup is exactly what we print.
        </p>
        {process.env.NODE_ENV !== "production" ? (
          <button
            type="button"
            onClick={downloadPreview}
            className="text-neon-cyan focus-visible:ring-neon-cyan self-start rounded-md px-1 text-xs focus-visible:ring-2 focus-visible:outline-none"
          >
            Download preview (dev)
          </button>
        ) : null}
      </div>

      <div id="builder-panel" className="flex flex-col gap-4">
        <ol className="flex flex-wrap items-center gap-1.5" aria-label="Builder steps">
          {STEPS.map(({ id, label }) => (
            <li key={id} className="flex items-center gap-1.5" aria-current={step === id ? "step" : undefined}>
              <button
                type="button"
                onClick={() => goStep(id)}
                aria-label={`Step ${id}: ${label}`}
                className={
                  step === id
                    ? "bg-neon-pink text-bg-0 focus-visible:ring-neon-cyan rounded-full px-3 py-1 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none"
                    : "border-border bg-bg-2 text-text-2 focus-visible:ring-neon-cyan hover:border-border-strong rounded-full border px-3 py-1 text-xs focus-visible:ring-2 focus-visible:outline-none"
                }
              >
                {id}. {label}
              </button>
              {id < STEPS.length ? (
                <span aria-hidden="true" className="text-text-3 text-xs">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>

        <Card className="p-4 sm:p-6">
          {step === 1 ? (
            <GarmentPicker
              selectedId={design.garment}
              onSelect={(id) => {
                dispatch({ type: "selectGarment", garmentId: id });
                goStep(2);
              }}
            />
          ) : null}
          {step === 2 ? (
            <ColorPicker
              garment={garment}
              colors={design.colors}
              onZoneColor={(zone, hex) => dispatch({ type: "setZoneColor", zone, hex })}
            />
          ) : null}
          {step === 3 ? (
            <ArtworkControls
              garment={garment}
              view={activeView}
              views={garment.views}
              placement={design.views[activeViewId]}
              hasFile={hasFile}
              fileError={fileError}
              onFileSelected={handleFileSelected}
              onViewChange={setRequestedView}
              onSetPrintArea={(viewId, areaId) => dispatch({ type: "setPrintArea", view: viewId, printAreaId: areaId })}
              onTransformCommit={(transform) => dispatch({ type: "setTransform", view: activeViewId, transform })}
              onRemove={() => dispatch({ type: "removeArtwork", view: activeViewId })}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
            />
          ) : null}
          {step === 4 ? (
            <DetailsStep
              garment={garment}
              design={design}
              onSize={(size, qty) => dispatch({ type: "setSize", size, qty })}
              onNotes={(notes) => dispatch({ type: "setNotes", notes })}
              onReferral={(referral) => dispatch({ type: "setReferral", referral })}
            />
          ) : null}
          {step === 5 ? <GatePlaceholder garmentName={garment.name} /> : null}

          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={() => goStep((step - 1) as BuilderStep)} disabled={step === 1}>
              ← Back
            </Button>
            {step < 5 ? (
              <Button size="sm" onClick={() => goStep((step + 1) as BuilderStep)}>
                Continue →
              </Button>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Step 5 placeholder — P4-2 wires the real email gate, coupon and /api/mockups. */
function GatePlaceholder({ garmentName }: { garmentName: string }) {
  return (
    <div className="flex flex-col gap-3" data-testid="email-gate-placeholder">
      <h2 className="font-heading text-text-1 text-lg tracking-wide uppercase">Almost done</h2>
      <p className="text-text-2 text-sm">
        Your {garmentName.toLowerCase()} design is saved for this session. Next, enter your email and we&apos;ll send
        your mockup <strong className="text-text-1">plus 15% off your 2nd order</strong>.
      </p>
      <Button type="button" disabled aria-describedby="gate-note">
        Get my mockup + 15% off
      </Button>
      <p id="gate-note" className="text-text-3 text-xs" role="note">
        Coming next — email delivery isn&apos;t wired up yet. Your design stays saved in this tab.
      </p>
    </div>
  );
}
