"use client";
/**
 * The /design builder shell: stepper, layout (canvas + controls), file handling, and
 * the P4-2 email gate + success screen. Loaded client-only through next/dynamic
 * (ssr:false) because Konva must never run on the server.
 */
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { detectArtworkKind, ARTWORK_MAX_BYTES } from "@/lib/artwork";
import { getGarment, GARMENTS, isHexColor, type GarmentId, type ViewId } from "@/lib/garments";
import { MOCKUP_ARTWORK_KINDS, mockupViewSchema } from "@/lib/mockup-schema";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { ArtworkControls } from "./artwork-controls";
import { ColorPicker } from "./color-picker";
import { DetailsStep } from "./details-step";
import { GateStep, type GateContact } from "./gate-step";
import { GarmentPicker } from "./garment-picker";
import { GarmentStage, loadTemplate, type GarmentStageHandle } from "./garment-stage";
import {
  designFromRestore,
  initialDesign,
  toPayloadDesign,
  useBuilderState,
  type BuilderStep,
  type RestoredDesign,
} from "./use-builder-state";
import { SuccessScreen, type MockupResult } from "./success-screen";

const STEPS: { id: BuilderStep; label: string }[] = [
  { id: 1, label: "Garment" },
  { id: 2, label: "Colors" },
  { id: 3, label: "Design" },
  { id: 4, label: "Details" },
  { id: 5, label: "Get mockup" },
];

const raf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** File name for a restored artwork: the key's basename, or a friendly fallback. */
function safeUrlFileName(url: string): string {
  try {
    const name = new URL(url).pathname.split("/").pop();
    return name && name.length > 0 && name.length <= 255 ? name : "your-design.png";
  } catch {
    return "your-design.png";
  }
}

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

  // Email gate + success screen (P4-2).
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState("");
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateFieldErrors, setGateFieldErrors] = useState<Record<string, string> | null>(null);
  const [success, setSuccess] = useState<MockupResult | null>(null);
  const [exportedUrls, setExportedUrls] = useState<Partial<Record<ViewId, string>>>({});
  const [quoteRequested, setQuoteRequested] = useState(false);
  const lastContactRef = useRef<GateContact | null>(null);

  // Only one object URL alive at a time; revoked on replace and on unmount.
  useEffect(
    () => () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    },
    [fileUrl],
  );

  // Restore-design deep link (email CTA: /design?mockup=<id>). Runs once per mount.
  const restoredRef = useRef(false);
  const [restoreStatus, setRestoreStatus] = useState<"loading" | "loaded" | "failed" | null>(null);

  const restoreMockup = async (mockupId: string) => {
    // One deferred tick: no setState may run synchronously inside the mount effect.
    await Promise.resolve();
    setRestoreStatus("loading");
    try {
      const res = await fetch(`/api/mockups/${mockupId}`);
      if (!res.ok) throw new Error("restore request failed");
      const json = (await res.json()) as
        { ok: true; design: RestoredDesign; artwork: { url: string } } | { ok: false; error: string };
      if (!json.ok) throw new Error(json.error);
      // Re-validate on the client: the same schemas the server used for the row.
      const garmentEnum = z.enum(GARMENTS.map((g) => g.id) as [GarmentId, ...GarmentId[]]);
      const garmentId = garmentEnum.safeParse(json.design.garment).success ? json.design.garment : null;
      const views = json.design.views.flatMap((entry) => {
        const parsed = mockupViewSchema.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      });
      if (!garmentId || views.length === 0) throw new Error("restore payload invalid");
      const viewEntries = views.map((v) => ({
        view: v.view as ViewId,
        printArea: v.printArea,
        transform: v.transform,
      }));
      const colors = Object.fromEntries(Object.entries(json.design.colors).filter(([, hex]) => isHexColor(hex)));

      // The artwork is cross-origin (R2/MinIO): fetch it as a Blob and use an object
      // URL, so the canvas stays untainted and the mockup can still be exported.
      const blob = await fetch(json.artwork.url).then((r) => {
        if (!r.ok) throw new Error("artwork fetch failed");
        return r.blob();
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const kind = detectArtworkKind(bytes);
      const builderKind = MOCKUP_ARTWORK_KINDS.find((k) => k === kind);
      if (!builderKind) throw new Error("artwork not drawable");
      const fileName = safeUrlFileName(json.artwork.url);
      const file = new File([blob], fileName, { type: blob.type || "image/png" });
      const objectUrl = URL.createObjectURL(file);
      let img: HTMLImageElement;
      try {
        img = await loadTemplate(objectUrl);
      } catch {
        URL.revokeObjectURL(objectUrl);
        throw new Error("artwork decode failed");
      }
      if (img.naturalWidth === 0) {
        URL.revokeObjectURL(objectUrl);
        throw new Error("artwork has no size");
      }

      dispatch({
        type: "hydrate",
        step: 3,
        design: designFromRestore(
          { garment: garmentId, colors, views: viewEntries, sizes: json.design.sizes },
          {
            name: fileName,
            kind: builderKind,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          },
        ),
      });
      setFile(file);
      setFileUrl(objectUrl);
      setArtworkImg(img);
      setRestoreStatus("loaded");
    } catch {
      // Unknown id, expired link, or a hiccup: friendly message, fresh builder.
      dispatch({ type: "hydrate", step: 1, design: initialDesign(GARMENTS[0]!.id) });
      setRestoreStatus("failed");
    }
  };

  useEffect(() => {
    const mockupId = new URLSearchParams(window.location.search).get("mockup");
    if (!mockupId) return;
    // Deferred: the restore fetch (and its status updates) must not run inside the
    // effect body — React runs this after paint, same as any fetch-on-mount. The
    // guard lives in the callback so StrictMode's setup→cleanup→setup doesn't
    // swallow the run (dev double-invokes effects with this ref already set).
    const timer = setTimeout(() => {
      if (restoredRef.current) return;
      restoredRef.current = true;
      void restoreMockup(mockupId);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Object URLs for the success screen: revoked when replaced or on unmount.
  useEffect(
    () => () => {
      for (const url of Object.values(exportedUrls)) if (url) URL.revokeObjectURL(url);
    },
    [exportedUrls],
  );

  useEffect(() => {
    track("builder_start");
  }, []);

  useEffect(() => {
    if (step === 5 && !success) track("gate_viewed", { garment: design.garment });
  }, [step, success, design.garment]);

  const hasFile = file !== null && artworkImg !== null;
  const placedViews = toPayloadDesign(design).views;
  const hasArtwork = placedViews.length > 0;

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
    track("artwork_uploaded", { garment: design.garment, kind: builderKind });
  };

  /**
   * Renders `viewId` at native template size and returns a PNG blob. For the inactive
   * view it flips the stage, then waits until the switched view is actually drawn
   * (re-renders can lag under load) before exporting.
   */
  const exportViewPng = async (viewId: ViewId): Promise<Blob | null> => {
    if (viewId === activeViewId) return stageRef.current?.exportPng() ?? null;
    const previous = activeViewId;
    setRequestedView(viewId);
    try {
      for (let attempt = 0; attempt < 30; attempt++) {
        if (stageRef.current?.getView() === viewId) {
          const blob = await stageRef.current.exportPng();
          if (blob) return blob;
        }
        await raf();
      }
      return null;
    } finally {
      setRequestedView(previous);
    }
  };

  const refreshTurnstile = () => {
    // Turnstile tokens are single-use: get a fresh one after EVERY attempt, or retries always fail.
    setTurnstileToken(null);
    setTurnstileKey((k) => k + 1);
  };

  /** Builds the multipart body and POSTs it to /api/mockups (docs/04 §5). */
  const send = async (contact: GateContact, wantsQuote: boolean) => {
    if (sending) return;
    const payloadDesign = toPayloadDesign(design);
    if (!file || payloadDesign.views.length === 0) {
      setGateError("Add your design first — go back to step 3 and place your artwork on at least one side.");
      return;
    }
    if (wantsQuote) track("quote_requested", { garment: design.garment });
    setSending(true);
    setGateError(null);
    setGateFieldErrors(null);
    setProgress("Rendering your mockup…");
    try {
      const body = new FormData();
      body.append(
        "payload",
        JSON.stringify({
          ...payloadDesign,
          email: contact.email,
          name: contact.name || undefined,
          phone: contact.phone || undefined,
          marketingOptIn: contact.marketingOptIn,
          referralSource: design.referral.referralSource,
          referralOther: design.referral.referralOther,
          wantsQuote,
        }),
      );
      body.append("turnstileToken", turnstileToken ?? "");
      body.append("website", contact.website);
      body.append("artwork", file);

      setProgress("Uploading your mockup…");
      const blobs: Partial<Record<ViewId, Blob>> = {};
      for (const view of payloadDesign.views) {
        const blob = await exportViewPng(view.view);
        if (!blob) throw new Error(`could not render the ${view.view} view`);
        blobs[view.view] = blob;
        body.append(`mockup-${view.view}`, blob, `mockup-${view.view}.png`);
      }

      const res = await fetch("/api/mockups", { method: "POST", body });
      const json = (await res.json()) as
        | { ok: true; mockupId: string; coupon: MockupResult["coupon"]; mockups: MockupResult["mockups"] }
        | { ok: false; error: string; fieldErrors?: Record<string, string> };
      if (!json.ok) {
        if (json.fieldErrors) setGateFieldErrors(json.fieldErrors);
        setGateError(json.error ?? "Something went wrong. Please try again or email us.");
        return;
      }
      if (!wantsQuote) track("gate_submitted", { garment: design.garment, views: payloadDesign.views.length });
      const urls: Partial<Record<ViewId, string>> = {};
      for (const [view, blob] of Object.entries(blobs)) {
        if (blob) urls[view as ViewId] = URL.createObjectURL(blob);
      }
      setExportedUrls(urls);
      lastContactRef.current = contact;
      setQuoteRequested((prev) => prev || wantsQuote);
      setSuccess({ mockupId: json.mockupId, coupon: json.coupon, mockups: json.mockups });
    } catch {
      setGateError("Something went wrong. Please try again or email us.");
    } finally {
      setSending(false);
      setProgress("");
      refreshTurnstile();
    }
  };

  /** Success-screen CTA: re-sends the same request with wantsQuote: true. */
  const requestQuote = async () => {
    const contact = lastContactRef.current;
    if (!contact || quoteRequested || sending) return;
    await send(contact, true);
  };

  const designAnother = () => {
    dispatch({ type: "hydrate", step: 1, design: initialDesign(GARMENTS[0]!.id) });
    setSuccess(null);
    setExportedUrls({});
    setQuoteRequested(false);
    setGateError(null);
    setGateFieldErrors(null);
    lastContactRef.current = null;
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(null);
    setFileUrl(null);
    setArtworkImg(null);
    // The persist effect rewrites sessionStorage with the fresh state.
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
      </div>

      <div id="builder-panel" className="flex flex-col gap-4">
        {success ? (
          <Card className="p-4 sm:p-6">
            <SuccessScreen
              garmentId={design.garment}
              result={success}
              urls={exportedUrls}
              quoteRequested={quoteRequested}
              quoteSending={sending}
              quoteError={gateError}
              turnstileToken={turnstileToken}
              onTurnstileToken={setTurnstileToken}
              turnstileResetKey={turnstileKey}
              onRequestQuote={() => void requestQuote()}
              onDesignAnother={designAnother}
            />
          </Card>
        ) : (
          <>
            {restoreStatus ? (
              <p
                role="status"
                data-testid="restore-status"
                className={restoreStatus === "failed" ? "text-danger text-sm" : "text-neon-cyan text-sm"}
              >
                {restoreStatus === "loading"
                  ? "Loading your saved design…"
                  : restoreStatus === "loaded"
                    ? "Loaded your saved design."
                    : "We couldn't load that saved design — starting fresh."}
              </p>
            ) : null}
            <ol className="flex flex-wrap items-center gap-1.5" aria-label="Builder steps">
              {STEPS.map(({ id, label }) => (
                <li key={id} className="flex items-center gap-1.5" aria-current={step === id ? "step" : undefined}>
                  <button
                    type="button"
                    onClick={() => goStep(id)}
                    aria-label={`Step ${id}: ${label}`}
                    className={
                      step === id
                        ? "bg-neon-pink text-bg-0 focus-visible:ring-neon-cyan flex min-h-11 items-center rounded-full px-3 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none"
                        : "border-border bg-bg-2 text-text-2 focus-visible:ring-neon-cyan hover:border-border-strong flex min-h-11 items-center rounded-full border px-3 text-xs focus-visible:ring-2 focus-visible:outline-none"
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
                    track("garment_selected", { garment: id });
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
                  onSetPrintArea={(viewId, areaId) =>
                    dispatch({ type: "setPrintArea", view: viewId, printAreaId: areaId })
                  }
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
              {step === 5 ? (
                <GateStep
                  garmentName={garment.name}
                  hasArtwork={hasArtwork}
                  sending={sending}
                  progress={progress}
                  error={gateError}
                  fieldErrors={gateFieldErrors}
                  turnstileToken={turnstileToken}
                  onTurnstileToken={setTurnstileToken}
                  turnstileResetKey={turnstileKey}
                  onSubmit={(contact) => send(contact, false)}
                  onQuote={(contact) => send(contact, true)}
                />
              ) : null}

              <div className="mt-6 flex items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => goStep((step - 1) as BuilderStep)}
                  disabled={step === 1}
                >
                  ← Back
                </Button>
                {step < 5 ? (
                  <Button size="sm" onClick={() => goStep((step + 1) as BuilderStep)}>
                    Continue →
                  </Button>
                ) : null}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
