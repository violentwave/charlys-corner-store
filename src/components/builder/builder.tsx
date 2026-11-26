"use client";
/**
 * The /design builder shell (v4): stepper with one-line headlines and a slim progress
 * bar, canvas + design-inspector layout, the account gate before upload, LAYERS per side
 * (up to 8 images/text items, reorderable/duplicable/deletable), free stretch + skew, and
 * the two send paths ("Email me this mockup" / "Order this design"). Loaded client-only
 * through next/dynamic (ssr:false) because Konva must never run on the server.
 */
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { detectArtworkKind, ARTWORK_MAX_BYTES } from "@/lib/artwork";
import type { AccountUser } from "@/lib/auth-schema";
import { getGarment, GARMENTS, isHexColor, luma, VIEW_LABELS, type GarmentId, type ViewId } from "@/lib/garments";
import { MAX_LAYERS_PER_VIEW, MOCKUP_ARTWORK_KINDS, mockupViewSchema } from "@/lib/mockup-schema";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";

import { ColorPicker } from "./color-picker";
import { GarmentStep } from "./garment-step";
import { GarmentStage, loadTemplate, type GarmentStageHandle } from "./garment-stage";
import { AUTH_CHANGED_EVENT } from "@/components/layout/account-link";

import { DesignInspector } from "./design-inspector";
import { SignInDialog, type SignInDialogMode } from "./sign-in-dialog";
import {
  designFromRestore,
  initialDesign,
  payloadPlan,
  usedFileIndexes,
  useBuilderState,
  type BuilderLayer,
  type BuilderStep,
  type RestoredDesign,
  type TextPatch,
} from "./use-builder-state";
import { SendStep } from "./send-step";
import { StartOverButton } from "./start-over-dialog";
import { SuccessScreen, type MockupResult } from "./success-screen";
import { uploadGateFor } from "./upload-gate";
import "./text-fonts.css";
import { loadTextFont } from "./load-text-font";
import { initialTextTransform, refitTextBox } from "./text-measure";

const STEPS: { id: BuilderStep; label: string; headline: string; helper: string }[] = [
  {
    id: 1,
    label: "Garment",
    headline: "Pick your shirt",
    helper: "Gildan tees, long sleeves and hoodies are always stocked.",
  },
  { id: 2, label: "Colors", headline: "Choose its color", helper: "Only colors the real blank comes in." },
  {
    id: 3,
    label: "Design",
    headline: "Add your design",
    helper:
      "Your design goes on the front. Want it on the back or a sleeve too? Pick the side, then use the same design or upload another.",
  },
  { id: 4, label: "Send", headline: "Send it or order it", helper: "Pick one — you can always do the other after." },
];

const raf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const DEFAULT_TEXT = "Your text";
const DEFAULT_TEXT_FONT = "anton";
/** New text starts in black, or white on a dark garment, so it's visible right away. */
const defaultTextColor = (garmentHex: string | undefined) =>
  garmentHex && luma(garmentHex) < 0.5 ? "#ffffff" : "#000000";

/** File name for a restored artwork: the key's basename, or a friendly fallback. */
function safeUrlFileName(url: string): string {
  try {
    const name = new URL(url).pathname.split("/").pop();
    return name && name.length > 0 && name.length <= 255 ? name : "your-design.png";
  } catch {
    return "your-design.png";
  }
}

/** One uploaded file: the original, its object URL and the decoded image for the canvas. */
type ArtworkFile = {
  file: File;
  url: string;
  img: HTMLImageElement;
  name: string;
  kind: (typeof MOCKUP_ARTWORK_KINDS)[number];
  naturalWidth: number;
  naturalHeight: number;
};

export function Builder() {
  const { state, dispatch, canUndo, canRedo, undo, redo } = useBuilderState();
  const { design, step } = state;
  const garment = getGarment(design.garment);

  const [requestedView, setRequestedView] = useState<ViewId>("front");
  const activeViewId: ViewId = garment.views.some((v) => v.id === requestedView) ? requestedView : garment.views[0]!.id;
  const activeView = garment.views.find((v) => v.id === activeViewId)!;
  const activeViewState = design.views[activeViewId] ?? {
    printArea: activeView.printAreas[0]!.id,
    layers: [],
    selectedLayerId: null,
  };

  /** Uploaded files (≤ 4). Image layers' `fileIndex` points into this array. */
  const [files, setFiles] = useState<ArtworkFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const stageRef = useRef<GarmentStageHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The verified account (GET /api/auth/me): gates uploads and personalizes step 4.
  const [account, setAccount] = useState<AccountUser | null | undefined>(undefined);
  const [signInDialog, setSignInDialog] = useState<SignInDialogMode>(null);
  /** Why the dialog opened: to upload (then continue into the picker / dropped file) or to send. */
  const dialogPurposeRef = useRef<"upload" | "send">("upload");
  const pendingDropRef = useRef<File | null>(null);

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [success, setSuccess] = useState<MockupResult | null>(null);
  const [exportedUrls, setExportedUrls] = useState<Partial<Record<ViewId, string>>>({});

  // Object URLs of the uploaded files: revoked when dropped or on unmount.
  useEffect(
    () => () => {
      for (const f of files) URL.revokeObjectURL(f.url);
    },
    [files],
  );

  const refreshAccount = () => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { user: AccountUser | null } | null;
        setAccount(json?.user ?? null);
        // Next keeps this page's state when the visitor navigates away and back (React
        // Activity), so a dialog left open must not survive signing in elsewhere.
        if (json?.user?.verified) setSignInDialog(null);
      })
      .catch(() => setAccount(null));
  };

  useEffect(refreshAccount, []);

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
        { ok: true; design: RestoredDesign; artworks: { url: string }[] } | { ok: false; error: string };
      if (!json.ok) throw new Error(json.error);
      // Re-validate on the client: the same schemas the server used for the row.
      const garmentEnum = z.enum(GARMENTS.map((g) => g.id) as [GarmentId, ...GarmentId[]]);
      const garmentId = garmentEnum.safeParse(json.design.garment).success ? json.design.garment : null;
      const views = json.design.views.flatMap((entry) => {
        const parsed = mockupViewSchema.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      });
      if (!garmentId || views.length === 0) throw new Error("restore payload invalid");
      const colors = Object.fromEntries(Object.entries(json.design.colors).filter(([, hex]) => isHexColor(hex)));

      // Every artwork file (v3): fetch as a Blob and use object URLs, so the canvas stays
      // untainted and the mockups can still be exported. Image layers' `artwork` indexes
      // this restored array; text-only designs have no files at all.
      const restoredFiles: ArtworkFile[] = [];
      for (const artwork of json.artworks) {
        const blob = await fetch(artwork.url).then((r) => {
          if (!r.ok) throw new Error("artwork fetch failed");
          return r.blob();
        });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const kind = detectArtworkKind(bytes);
        const builderKind = MOCKUP_ARTWORK_KINDS.find((k) => k === kind);
        if (!builderKind) throw new Error("artwork not drawable");
        const fileName = safeUrlFileName(artwork.url);
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
        restoredFiles.push({
          file,
          url: objectUrl,
          img,
          name: fileName,
          kind: builderKind,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        });
      }

      dispatch({
        type: "hydrate",
        step: 3,
        design: designFromRestore({ garment: garmentId, colors, views, sizes: json.design.sizes }, restoredFiles),
      });
      setFiles(restoredFiles);
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
    if (step === 4 && !success) track("gate_viewed", { garment: design.garment });
  }, [step, success, design.garment]);

  const plan = payloadPlan(design);
  const hasLayers = plan.payload.views.length > 0;
  /** Sides whose image layers reference a file that needs re-picking after a refresh. */
  const sidesNeedingFiles = plan.payload.views
    .filter((v) => v.layers.some((l) => l.type === "image" && !files[plan.filesInUse[l.artwork]!]))
    .map((v) => VIEW_LABELS[v.view]);
  const artByView = Object.fromEntries(
    Object.entries(design.views).map(([view, state]) => [view, (state?.layers.length ?? 0) > 0]),
  ) as Partial<Record<ViewId, boolean>>;
  const chooserFiles = files.map((f, index) => ({ index, url: f.url, name: f.name }));
  const selectedLayer = activeViewState.layers.find((l) => l.id === activeViewState.selectedLayerId) ?? null;

  // Lock-ratio defaults: on for images, off for text; resets with the selection. Derived
  // during render ("adjust state during render", react.dev) — no sync effect needed.
  const [lockRatio, setLockRatio] = useState(selectedLayer?.type === "image");
  const [lockRatioFor, setLockRatioFor] = useState<string | null>(activeViewState.selectedLayerId);
  if (lockRatioFor !== activeViewState.selectedLayerId) {
    setLockRatioFor(activeViewState.selectedLayerId);
    setLockRatio(selectedLayer?.type === "image");
  }

  /** Validates + decodes an uploaded file into a new ArtworkFile entry. */
  const decodeUpload = async (selected: File): Promise<ArtworkFile | null> => {
    setFileError(null);
    if (selected.size > ARTWORK_MAX_BYTES) {
      setFileError("That file is larger than 20 MB. Please upload a smaller image.");
      return null;
    }
    const bytes = new Uint8Array(await selected.arrayBuffer());
    const kind = detectArtworkKind(bytes);
    const builderKind = MOCKUP_ARTWORK_KINDS.find((k) => k === kind);
    if (!builderKind) {
      setFileError("That file type won't render on the mockup. Please use PNG, JPG, WEBP, or SVG.");
      return null;
    }
    const url = URL.createObjectURL(selected);
    let img: HTMLImageElement;
    try {
      img = await loadTemplate(url);
    } catch {
      URL.revokeObjectURL(url);
      setFileError("We couldn't read that image. If it's an SVG, re-export it with a width and height.");
      return null;
    }
    if (img.naturalWidth === 0) {
      URL.revokeObjectURL(url);
      setFileError("That image has no usable size. Please re-export it with real dimensions.");
      return null;
    }
    return {
      file: selected,
      url,
      img,
      name: selected.name,
      kind: builderKind,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    };
  };

  /**
   * An upload adds an image layer on the side currently shown (docs/04 "Artwork per
   * side"). The underlying file is reused when free slots run out; ≤ 4 files per mockup.
   */
  const handleFileSelected = async (selected: File) => {
    if (activeViewState.layers.length >= MAX_LAYERS_PER_VIEW) {
      setFileError(`This side holds ${MAX_LAYERS_PER_VIEW} designs — remove one to add another.`);
      return;
    }
    const decoded = await decodeUpload(selected);
    if (!decoded) return;
    let fileIndex: number;
    if (files.length < 4) {
      fileIndex = files.length;
      setFiles([...files, decoded]);
    } else {
      // The wire format takes 4 files; reuse a slot no layer references anymore.
      // Never reuse a file an Undo/Redo step could bring back.
      const used = new Set([design, ...state.past, ...state.future].flatMap((d) => [...usedFileIndexes(d)]));
      const free = files.findIndex((_, i) => !used.has(i));
      if (free === -1) {
        setFileError("Up to 4 images per mockup — remove one first.");
        URL.revokeObjectURL(decoded.url);
        return;
      }
      fileIndex = free;
      setFiles((prev) => {
        const next = [...prev];
        URL.revokeObjectURL(next[free]!.url);
        next[free] = decoded;
        return next;
      });
    }
    dispatch({ type: "addImageLayer", view: activeViewId, input: { ...decoded, fileIndex } });
    track("artwork_uploaded", { garment: design.garment, kind: decoded.kind });
  };

  /** "Use the same design": an already-uploaded file becomes a layer on this side. */
  const useSameDesign = (fileIndex: number) => {
    const entry = files[fileIndex];
    if (!entry) return;
    dispatch({
      type: "addImageLayer",
      view: activeViewId,
      input: {
        fileIndex,
        name: entry.name,
        kind: entry.kind,
        naturalWidth: entry.naturalWidth,
        naturalHeight: entry.naturalHeight,
      },
    });
  };

  /** Removing a layer drops its file when no other layer uses it (object URL revoked). */
  const removeLayer = (viewId: ViewId, layerId: string) => {
    dispatch({ type: "removeLayer", view: viewId, layerId });
    // The file stays in `files`: other layers' fileIndex values point into that array (removing
    // an entry would shift them onto the wrong file), Undo can bring the layer back, and the
    // upload path reuses a slot nothing references once 4 files are loaded. Unused files are
    // never uploaded (payloadPlan only sends files in use).
  };

  /**
   * The account gate (docs/04 Flow v2): a fresh GET /api/auth/me decides. Signed in
   * and verified → proceed (open the picker, or take the dropped file). Otherwise the
   * dialog explains why and links to the right account page with `next` back here.
   */
  const attemptUpload = async (file?: File) => {
    let gate: "signedOut" | "unverified" | "allowed";
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { user: AccountUser | null } | null;
      setAccount(json?.user ?? null);
      gate = uploadGateFor(json?.user ?? null);
    } catch {
      gate = "signedOut";
    }
    if (gate !== "allowed") {
      dialogPurposeRef.current = "upload";
      pendingDropRef.current = file ?? null;
      setSignInDialog(gate);
      return;
    }
    if (file) void handleFileSelected(file);
    else fileInputRef.current?.click();
  };

  /** "Add text": a fresh text layer on the current side, selected and ready to type. */
  const addText = async () => {
    const viewId = activeViewId;
    const rect = (activeView.printAreas.find((a) => a.id === activeViewState.printArea) ?? activeView.printAreas[0]!)
      .rect;
    // Measure with the real font so the new text starts at its natural shape, not squashed.
    await loadTextFont(DEFAULT_TEXT_FONT);
    dispatch({
      type: "addTextLayer",
      view: viewId,
      input: {
        text: DEFAULT_TEXT,
        font: DEFAULT_TEXT_FONT,
        color: defaultTextColor(design.colors[garment.colorZones[0]!.id]),
        transform: initialTextTransform(DEFAULT_TEXT, DEFAULT_TEXT_FONT, 0, rect),
      },
    });
    track("text_added", { garment: design.garment });
  };

  /**
   * Text edits. Changing the words, font, spacing or arch resizes the box so the letters keep their
   * current proportions (text-measure.ts refitTextBox) instead of squashing into the old box.
   */
  const changeText = async (layerId: string, patch: TextPatch, mergeKey?: string) => {
    const viewId = activeViewId;
    const layer = activeViewState.layers.find((l) => l.id === layerId);
    const reshapes =
      patch.text !== undefined ||
      patch.font !== undefined ||
      patch.letterSpacing !== undefined ||
      patch.curve !== undefined;
    if (!layer || layer.type !== "text" || !reshapes) {
      dispatch({ type: "updateLayer", view: viewId, layerId, patch, mergeKey });
      return;
    }
    const rect = (activeView.printAreas.find((a) => a.id === activeViewState.printArea) ?? activeView.printAreas[0]!)
      .rect;
    if (patch.font) await loadTextFont(patch.font);
    const next = {
      text: patch.text ?? layer.text,
      font: patch.font ?? layer.font,
      letterSpacing: patch.letterSpacing ?? layer.letterSpacing,
      curve: patch.curve ?? layer.curve,
    };
    const transform = refitTextBox(layer, next, rect);
    dispatch({ type: "updateLayer", view: viewId, layerId, patch: { ...patch, transform }, mergeKey });
  };

  /** Tab cycles the side's layer selection (shift goes backwards). */
  const cycleLayer = (backwards: boolean) => {
    const layers = activeViewState.layers;
    if (layers.length === 0) return;
    const current = layers.findIndex((l) => l.id === activeViewState.selectedLayerId);
    const next = current === -1 ? 0 : (current + (backwards ? -1 : 1) + layers.length) % layers.length;
    dispatch({ type: "selectLayer", view: activeViewId, layerId: layers[next]!.id });
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

  /**
   * Builds the multipart body per the wire format (docs/04 v4): artwork files numbered
   * 0..n-1 in first-use order across image layers, one `artwork-<n>` per file, one
   * `mockup-<view>` per side with layers, `views[].layers` in stack order. Text-only
   * designs send no files at all.
   */
  const send = async (intent: "email" | "order", marketingOptIn: boolean) => {
    if (sending) return;
    const plan = payloadPlan(design);
    if (plan.payload.views.length === 0) {
      setSendError("Add something to at least one side — go back to step 3.");
      return;
    }
    const missing = plan.payload.views
      .filter((v) => v.layers.some((l) => l.type === "image" && !files[plan.filesInUse[l.artwork]!]))
      .map((v) => VIEW_LABELS[v.view]);
    if (missing.length > 0) {
      setSendError(`Pick your artwork file again for: ${missing.join(", ")}.`);
      return;
    }
    setSending(true);
    setSendError(null);
    setProgress("Rendering your mockup…");
    try {
      const body = new FormData();
      body.append(
        "payload",
        JSON.stringify({
          ...plan.payload,
          marketingOptIn,
          referralSource: design.referral.referralSource,
          referralOther: design.referral.referralOther,
          intent,
        }),
      );
      body.append("website", honeypot);
      plan.filesInUse.forEach((fileIndex, i) => {
        body.append(`artwork-${i}`, files[fileIndex]!.file);
      });

      setProgress("Uploading your mockup…");
      const blobs: Partial<Record<ViewId, Blob>> = {};
      for (const view of plan.payload.views) {
        const blob = await exportViewPng(view.view);
        if (!blob) throw new Error(`could not render the ${view.view} view`);
        blobs[view.view] = blob;
        body.append(`mockup-${view.view}`, blob, `mockup-${view.view}.png`);
      }

      const res = await fetch("/api/mockups", { method: "POST", body });
      const json = (await res.json()) as
        | { ok: true; mockupId: string; coupon: MockupResult["coupon"]; mockups: MockupResult["mockups"] }
        | { ok: false; error: string };
      if (!json.ok) {
        setSendError(json.error ?? "Something went wrong. Please try again or email us.");
        if (res.status === 401 || res.status === 403) {
          // Session expired mid-design: the gate dialog explains the way back in.
          refreshAccount();
          dialogPurposeRef.current = "send";
          setSignInDialog(res.status === 401 ? "signedOut" : "unverified");
        }
        return;
      }
      track("gate_submitted", { garment: design.garment, intent, views: plan.payload.views.length });
      const urls: Partial<Record<ViewId, string>> = {};
      for (const [view, blob] of Object.entries(blobs)) {
        if (blob) urls[view as ViewId] = URL.createObjectURL(blob);
      }
      setExportedUrls(urls);
      setSuccess({ mockupId: json.mockupId, intent, coupon: json.coupon, mockups: json.mockups });
    } catch {
      setSendError("Something went wrong. Please try again or email us.");
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  const designAnother = () => {
    dispatch({ type: "hydrate", step: 1, design: initialDesign(GARMENTS[0]!.id) });
    setRequestedView("front");
    setFileError(null);
    setSuccess(null);
    setExportedUrls({});
    setSendError(null);
    for (const f of files) URL.revokeObjectURL(f.url);
    setFiles([]);
    // The persist effect rewrites sessionStorage with the fresh state.
  };

  const goStep = (next: BuilderStep) => {
    dispatch({ type: "setStep", step: next });
    // Steps live below the canvas on phones; keep the panel in view.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      document.getElementById("builder-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const stepInfo = STEPS.find((s) => s.id === step)!;
  const colorNames = garment.colorZones.map((zone) => {
    const hex = design.colors[zone.id] ?? garment.defaultColors[zone.id] ?? "#f4f4f4";
    const name = garment.palette.find((c) => c.hex === hex)?.name;
    return name ? `${zone.label}: ${name}` : zone.label;
  });
  const sizeEntries = Object.entries(design.sizes)
    .filter(([, qty]) => qty > 0)
    .map(([size, qty]) => `${qty} × ${size}`);

  return (
    <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <div className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-24">
        <GarmentStage
          ref={stageRef}
          garmentName={garment.name}
          view={activeView}
          printAreaId={activeViewState.printArea}
          colors={design.colors}
          layers={activeViewState.layers}
          selectedLayerId={activeViewState.selectedLayerId}
          images={Object.fromEntries(files.map((f, i) => [i, f.img]))}
          emptyState={
            step === 3
              ? {
                  files: chooserFiles,
                  onUse: useSameDesign,
                  onUploadDifferent: () => void attemptUpload(),
                }
              : undefined
          }
          lockRatio={lockRatio}
          onSelectLayer={(layerId) => dispatch({ type: "selectLayer", view: activeViewId, layerId })}
          onTransformCommit={(layerId, transform) =>
            dispatch({ type: "updateLayer", view: activeViewId, layerId, patch: { transform } })
          }
          onRemoveLayer={(layerId) => removeLayer(activeViewId, layerId)}
          onDuplicateLayer={(layerId) => dispatch({ type: "duplicateLayer", view: activeViewId, layerId })}
          onMoveLayer={(layerId, to) => dispatch({ type: "moveLayer", view: activeViewId, layerId, to })}
          onCycleLayer={cycleLayer}
          onUndo={undo}
          onRedo={redo}
        />
        <p className="text-text-3 text-xs">
          Preview on a neutral studio background — the exported mockup is exactly what we print.
        </p>
        {/* The gated file picker: opened by attemptUpload, never before the account check. */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          data-testid="builder-file-input"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) void handleFileSelected(selected);
            e.target.value = "";
          }}
        />
      </div>

      <div id="builder-panel" className="flex min-w-0 flex-col gap-4">
        {success ? (
          <div className="bg-bg-2/60 rounded-2xl p-4 sm:p-6">
            <SuccessScreen
              garmentId={design.garment}
              summary={{ garmentName: garment.name, colorNames, sizeEntries }}
              result={success}
              urls={exportedUrls}
              onDesignAnother={designAnother}
              onGoToOrder={() => {
                setSuccess(null);
                goStep(4);
              }}
            />
          </div>
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
            {sidesNeedingFiles.length > 0 && step === 3 ? (
              <p
                className="border-border bg-bg-2/60 rounded-md border p-2 text-xs"
                data-testid="relink-sides"
                role="note"
              >
                Pick your artwork file again to put it back on: {sidesNeedingFiles.join(", ")}.
              </p>
            ) : null}

            {/* Step pills (smaller) + "Step n of 4" + slim progress bar (docs/04 v2). */}
            <div className="flex flex-col gap-2" data-testid="builder-progress">
              <div className="flex items-center justify-between gap-3">
                <ol className="flex flex-wrap items-center gap-1.5" aria-label="Builder steps">
                  {STEPS.map(({ id, label }) => (
                    <li key={id} className="flex items-center gap-1.5" aria-current={step === id ? "step" : undefined}>
                      <button
                        type="button"
                        onClick={() => goStep(id)}
                        aria-label={`Step ${id}: ${label}`}
                        className={
                          step === id
                            ? "bg-neon-pink text-bg-0 focus-visible:ring-neon-cyan flex h-9 items-center rounded-full px-3 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none"
                            : "bg-bg-2 text-text-2 focus-visible:ring-neon-cyan hover:text-text-1 flex h-9 items-center rounded-full px-3 text-xs focus-visible:ring-2 focus-visible:outline-none"
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
                <p aria-hidden="true" className="text-text-3 shrink-0 font-mono text-xs">
                  Step {step} of {STEPS.length}
                </p>
              </div>
              <div className="bg-bg-3 h-1 overflow-hidden rounded-full" role="presentation">
                <div
                  className="bg-neon-pink h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${(step / STEPS.length) * 100}%` }}
                />
              </div>
              <p className="sr-only" role="status">
                Step {step} of {STEPS.length}: {stepInfo.headline}
              </p>
            </div>

            <div className="bg-bg-2/60 rounded-2xl p-4 sm:p-6">
              <header className="mb-5 flex flex-col gap-1">
                <h2 className="font-heading text-text-1 text-xl tracking-wide uppercase">{stepInfo.headline}</h2>
                <p className="text-text-2 text-sm">{stepInfo.helper}</p>
              </header>

              {step === 1 ? (
                <GarmentStep
                  selectedId={design.garment}
                  onSelect={(id) => {
                    dispatch({ type: "selectGarment", garmentId: id });
                    track("garment_selected", { garment: id });
                  }}
                  onContinue={() => goStep(2)}
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
                <DesignInspector
                  view={activeView}
                  views={garment.views}
                  viewState={activeViewState}
                  artByView={artByView}
                  files={chooserFiles}
                  selectedFileReady={selectedLayer?.type !== "image" || !!files[selectedLayer.fileIndex]}
                  fileError={fileError}
                  capReached={activeViewState.layers.length >= MAX_LAYERS_PER_VIEW}
                  accountEmail={account?.verified ? account.email : null}
                  lockRatio={lockRatio}
                  onLockRatioChange={setLockRatio}
                  onUploadClick={() => void attemptUpload()}
                  onDropFile={(file) => void attemptUpload(file)}
                  onAddText={addText}
                  onViewChange={setRequestedView}
                  onSetPrintArea={(viewId, areaId) =>
                    dispatch({ type: "setPrintArea", view: viewId, printAreaId: areaId })
                  }
                  onSelectLayer={(layerId) => dispatch({ type: "selectLayer", view: activeViewId, layerId })}
                  onTransform={(layerId, transform, mergeKey) =>
                    dispatch({ type: "updateLayer", view: activeViewId, layerId, patch: { transform }, mergeKey })
                  }
                  onTextChange={changeText}
                  onOutlineChange={(layerId, outline, mergeKey) =>
                    dispatch({
                      type: "updateLayer",
                      view: activeViewId,
                      layerId,
                      patch: { outline } as Partial<BuilderLayer>,
                      mergeKey,
                    })
                  }
                  onRemoveLayer={(layerId) => removeLayer(activeViewId, layerId)}
                  onDuplicateLayer={(layerId) => dispatch({ type: "duplicateLayer", view: activeViewId, layerId })}
                  onMoveLayer={(layerId, to) => dispatch({ type: "moveLayer", view: activeViewId, layerId, to })}
                />
              ) : null}
              {step === 4 ? (
                <SendStep
                  garment={garment}
                  design={design}
                  accountEmail={account?.verified ? account.email : null}
                  hasArtwork={hasLayers}
                  sending={sending}
                  progress={progress}
                  error={sendError}
                  onSize={(size, qty) => dispatch({ type: "setSize", size, qty })}
                  onNotes={(notes) => dispatch({ type: "setNotes", notes })}
                  onReferral={(referral) => dispatch({ type: "setReferral", referral })}
                  onWebsite={setHoneypot}
                  onSend={(intent, marketingOptIn) => void send(intent, marketingOptIn)}
                />
              ) : null}

              <div className="mt-6 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => goStep((step - 1) as BuilderStep)}
                    disabled={step === 1}
                  >
                    ← Back
                  </Button>
                  {step < 4 ? (
                    <Button size="sm" onClick={() => goStep((step + 1) as BuilderStep)}>
                      Continue →
                    </Button>
                  ) : null}
                </div>
                {/* Secondary actions on their own row, so the footer never overflows at 360px. */}
                {step > 1 ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {step === 3 ? (
                      <>
                        <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} data-testid="undo">
                          Undo
                        </Button>
                        <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo} data-testid="redo">
                          Redo
                        </Button>
                      </>
                    ) : null}
                    <span className="ml-auto">
                      <StartOverButton onConfirm={designAnother} />
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>

      <SignInDialog
        mode={signInDialog}
        email={account?.email}
        onClose={() => {
          pendingDropRef.current = null;
          setSignInDialog(null);
        }}
        onAccount={(user) => {
          setAccount((prev) => ({ ...user, name: user.name ?? prev?.name ?? null }));
          window.dispatchEvent(new Event(AUTH_CHANGED_EVENT)); // header flips "Log in" → "My designs"
        }}
        onContinue={() => {
          setSignInDialog(null);
          setSendError(null);
          if (dialogPurposeRef.current === "send") return; // the send buttons are right there again
          const dropped = pendingDropRef.current;
          pendingDropRef.current = null;
          if (dropped) void handleFileSelected(dropped);
          else fileInputRef.current?.click(); // still inside the "Add my design" click
        }}
      />
    </div>
  );
}
