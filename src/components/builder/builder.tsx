"use client";
/**
 * The /design builder shell (v4): stepper with one-line headlines and a slim progress
 * bar, canvas + design-inspector layout, the account gate before upload, LAYERS per side
 * (up to 8 images/text items, reorderable/duplicable/deletable), free stretch + skew, and
 * the two send paths ("Email me this mockup" / "Order this design"). Loaded client-only
 * through next/dynamic (ssr:false) because Konva must never run on the server.
 */
import { startTransition, ViewTransition } from "react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { detectArtworkKind, ARTWORK_MAX_BYTES } from "@/lib/artwork";
import type { AccountUser } from "@/lib/auth-schema";
import { getGarment, GARMENTS, isHexColor, luma, VIEW_LABELS, type GarmentId, type ViewId } from "@/lib/garments";
import { designMethodBlocker, PRINT_METHODS } from "@/lib/print-methods";
import { MAX_LAYERS_PER_VIEW, MOCKUP_ARTWORK_KINDS, mockupViewSchema } from "@/lib/mockup-schema";
import type { TextFontId } from "@/lib/text-fonts";
import { track } from "@/lib/analytics";
import { MOCKUP_FILES_RETENTION_DAYS } from "@/lib/retention";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { CART_CHANGED_EVENT } from "@/lib/cart-events";
import type { BrandKit } from "@/app/api/account/brand-kit/route";

import { ColorPicker } from "./color-picker";
import { GarmentStep } from "./garment-step";
import { GarmentStage, loadTemplate, type GarmentStageHandle } from "./garment-stage";
import { AUTH_CHANGED_EVENT } from "@/components/layout/session";

import { DesignInspector } from "./design-inspector";
import { SignInDialog, type SignInDialogMode } from "./sign-in-dialog";
import { MobileActionBar } from "./action-bar";
import { ToolTabs } from "./tool-tabs";
import {
  designFromRestore,
  designPrintMethod,
  initialDesign,
  payloadPlan,
  usedFileIndexes,
  useBuilderState,
  type BuilderLayer,
  type BuilderStep,
  type RestoredDesign,
  type TextPatch,
} from "./use-builder-state";
import { SendStep, type CartAddState } from "./send-step";
import { buildMockupUpload } from "./upload-body";
import { CheckIcon, GarmentIcon, MailIcon, PaletteIcon, RedoIcon, SaveIcon, TextIcon, UndoIcon } from "./studio-icons";
import { StartOverButton } from "./start-over-dialog";
import { SaveDraftDialog } from "./save-draft-dialog";
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

/** Panel header icon per step (P52-2b). */
const STEP_ICONS = { 1: GarmentIcon, 2: PaletteIcon, 3: TextIcon, 4: MailIcon } as const;

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
  /** Why the dialog opened: to upload (picker/dropped file), to send, or to save a draft. */
  const dialogPurposeRef = useRef<"upload" | "send" | "draft">("upload");
  const pendingDropRef = useRef<File | null>(null);

  // Saved draft (Member perks): the id/name this design was last saved as. Kept in
  // sessionStorage so a refresh keeps updating the same draft. (The builder is
  // client-only — `next/dynamic` with ssr:false — so sessionStorage exists at mount.)
  const [draftId, setDraftId] = useState<string | null>(() => sessionStorage.getItem("charly.draft-id"));
  const [draftName, setDraftName] = useState<string | null>(() => sessionStorage.getItem("charly.draft-name"));
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saveDraftOpen, setSaveDraftOpen] = useState(false);
  // The brand kit (colors/fonts/logo), fetched once per session when signed in.
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [success, setSuccess] = useState<MockupResult | null>(null);
  const [exportedUrls, setExportedUrls] = useState<Partial<Record<ViewId, string>>>({});
  // Cart (docs/04 §5b): the id being edited (?cart=<id>) and the last add's inline status.
  const [cartEditingId, setCartEditingId] = useState<string | null>(null);
  const [cartState, setCartState] = useState<CartAddState | null>(null);

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

  // The brand kit, fetched once per session for signed-in members (docs/02 Member perks).
  useEffect(() => {
    if (account === undefined || account === null || !account.verified) return;
    let alive = true;
    fetch("/api/account/brand-kit", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { brandKit?: BrandKit } | null;
        if (alive && res.ok && data?.brandKit) setBrandKit(data.brandKit);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [account]);

  // Restore-design deep link (email CTA: /design?mockup=<id>). Runs once per mount.
  const restoredRef = useRef(false);
  const [restoreStatus, setRestoreStatus] = useState<"loading" | "loaded" | "expired" | "failed" | null>(null);

  /** Fetches the design's stored images as decoded ArtworkFiles (restore + drafts share this). */
  const fetchArtworkFiles = async (artworks: { url: string; name?: string }[]): Promise<ArtworkFile[]> => {
    const files: ArtworkFile[] = [];
    for (const artwork of artworks) {
      const blob = await fetch(artwork.url).then((r) => {
        if (!r.ok) throw new Error("artwork fetch failed");
        return r.blob();
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const kind = detectArtworkKind(bytes);
      const builderKind = MOCKUP_ARTWORK_KINDS.find((k) => k === kind);
      if (!builderKind) throw new Error("artwork not drawable");
      const fileName = artwork.name ?? safeUrlFileName(artwork.url);
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
      files.push({
        file,
        url: objectUrl,
        img,
        name: fileName,
        kind: builderKind,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      });
    }
    return files;
  };

  /** Hydrates the builder with a fetched design (+ its decoded files) at the Design step. */
  const applyRestoredDesign = (design: RestoredDesign, files: ArtworkFile[]) => {
    // Re-validate on the client: the same schemas the server used for the row.
    const garmentEnum = z.enum(GARMENTS.map((g) => g.id) as [GarmentId, ...GarmentId[]]);
    const garmentId = garmentEnum.safeParse(design.garment).success ? design.garment : null;
    const views = design.views.flatMap((entry) => {
      const parsed = mockupViewSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    });
    if (!garmentId || views.length === 0) throw new Error("restore payload invalid");
    const colors = Object.fromEntries(Object.entries(design.colors).filter(([, hex]) => isHexColor(hex)));
    dispatch({
      type: "hydrate",
      step: 3,
      design: designFromRestore({ garment: garmentId, colors, views, sizes: design.sizes }, files),
    });
    for (const f of files) URL.revokeObjectURL(f.url);
    setFiles(files);
  };

  const restoreMockup = async (mockupId: string) => {
    // One deferred tick: no setState may run synchronously inside the mount effect.
    await Promise.resolve();
    setRestoreStatus("loading");
    try {
      const res = await fetch(`/api/mockups/${mockupId}`);
      if (!res.ok) throw new Error("restore request failed");
      const json = (await res.json()) as
        | { ok: true; design: RestoredDesign; artworks: { url: string }[]; filesExpired?: boolean }
        | { ok: false; error: string };
      if (!json.ok) throw new Error(json.error);
      applyRestoredDesign(json.design, await fetchArtworkFiles(json.artworks));
      setRestoreStatus(json.filesExpired ? "expired" : "loaded");
    } catch {
      // Unknown id, expired link, or a hiccup: friendly message, fresh builder.
      dispatch({ type: "hydrate", step: 1, design: initialDesign(GARMENTS[0]!.id) });
      setRestoreStatus("failed");
    }
  };

  /**
   * Opens a cart design for editing (/?cart=<id>#design): the same hydrate path as the
   * ?mockup= restore, and the step-4 cart card becomes "Update in cart".
   */
  const openCartItem = async (id: string) => {
    await Promise.resolve();
    setRestoreStatus("loading");
    try {
      const res = await fetch(`/api/cart/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("cart restore failed");
      const json = (await res.json()) as
        { ok: true; design: RestoredDesign; artworks: { url: string }[] } | { ok: false; error: string };
      if (!json.ok) throw new Error(json.error);
      applyRestoredDesign(json.design, await fetchArtworkFiles(json.artworks));
      setCartEditingId(id);
      setRestoreStatus("loaded");
    } catch {
      dispatch({ type: "hydrate", step: 1, design: initialDesign(GARMENTS[0]!.id) });
      setRestoreStatus("failed");
    }
  };

  /**
   * Takes ?mockup= / ?draft= / ?cart= out of the address bar once it's being loaded, keeping the hash.
   * Otherwise a refresh would load the saved copy again over the visitor's newer edits (the
   * builder already keeps those in sessionStorage).
   */
  const dropLoadParams = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("mockup");
    url.searchParams.delete("draft");
    url.searchParams.delete("cart");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };

  /** Opens a saved draft (/?draft=<id>#design) — the same hydrate path as the restore link. */
  const openDraft = async (id: string) => {
    await Promise.resolve();
    setRestoreStatus("loading");
    try {
      const res = await fetch(`/api/account/drafts/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("draft request failed");
      const json = (await res.json()) as
        | {
            ok: true;
            id: string;
            name: string;
            design: RestoredDesign;
            artworks: { name: string; url: string }[];
            filesExpired?: boolean;
          }
        | { ok: false; error: string };
      if (!json.ok) throw new Error(json.error);
      const files = json.filesExpired ? [] : await fetchArtworkFiles(json.artworks);
      if (files.length > 0) applyRestoredDesign(json.design, files);
      else {
        // Expired images: hydrate what's left (colors, text, sizes) without files.
        dispatch({ type: "hydrate", step: 3, design: designFromRestore(json.design, []) });
        for (const f of files) URL.revokeObjectURL(f.url);
        setFiles([]);
      }
      setDraftId(json.id);
      setDraftName(json.name);
      sessionStorage.setItem("charly.draft-id", json.id);
      sessionStorage.setItem("charly.draft-name", json.name);
      setRestoreStatus(json.filesExpired ? "expired" : "loaded");
    } catch {
      dispatch({ type: "hydrate", step: 1, design: initialDesign(GARMENTS[0]!.id) });
      setRestoreStatus("failed");
    }
  };

  useEffect(() => {
    const draftIdParam = new URLSearchParams(window.location.search).get("draft");
    if (draftIdParam) {
      const timer = setTimeout(() => {
        if (restoredRef.current) return;
        restoredRef.current = true;
        dropLoadParams();
        void openDraft(draftIdParam);
      }, 0);
      return () => clearTimeout(timer);
    }
    const cartId = new URLSearchParams(window.location.search).get("cart");
    if (cartId) {
      const timer = setTimeout(() => {
        if (restoredRef.current) return;
        restoredRef.current = true;
        dropLoadParams();
        void openCartItem(cartId);
      }, 0);
      return () => clearTimeout(timer);
    }
    const mockupId = new URLSearchParams(window.location.search).get("mockup");
    if (!mockupId) return;
    // Deferred: the restore fetch (and its status updates) must not run inside the
    // effect body — React runs this after paint, same as any fetch-on-mount. The
    // guard lives in the callback so StrictMode's setup→cleanup→setup doesn't
    // swallow the run (dev double-invokes effects with this ref already set).
    const timer = setTimeout(() => {
      if (restoredRef.current) return;
      restoredRef.current = true;
      dropLoadParams();
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

  // Preload the default text font so "Add text" measures and dispatches without a font
  // fetch in between (the tab auto-switch must not land a beat after the visitor's
  // next tap).
  useEffect(() => {
    void loadTextFont(DEFAULT_TEXT_FONT);
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

  // Below lg, step 3 switches to the mobile shell (sticky canvas + tool tabs + action
  // bar); desktop and the other steps keep the current layout.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // On-screen keyboard open (visual viewport shrank): the sticky canvas drops to 30svh
  // so the text field stays visible above the keyboard.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const onResize = () => setKeyboardOpen(viewport.height < window.innerHeight * 0.75);
    viewport.addEventListener("resize", onResize);
    return () => viewport.removeEventListener("resize", onResize);
  }, []);

  const mobileStep3 = step === 3 && !isDesktop;

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
  /**
   * Renders one side to a PNG. Always asks the stage which side it is showing *now* and waits
   * until that side's template and artwork are loaded: the old shortcut trusted a stale
   * `activeViewId` mid-switch and exported an empty canvas (blank sleeve mockups, 2026-11-26).
   * The caller restores the visitor's side once every export is done.
   */
  const exportViewPng = async (viewId: ViewId): Promise<Blob | null> => {
    setRequestedView(viewId);
    // Up to ~10 s at 60 fps: a cold template on a slow phone can take a few seconds.
    for (let attempt = 0; attempt < 600; attempt++) {
      const stage = stageRef.current;
      if (stage && stage.getView() === viewId && stage.isReady()) {
        await raf(); // one more frame so Konva has drawn the loaded images
        const blob = await stage.exportPng();
        if (blob) return blob;
      }
      await raf();
    }
    return null;
  };

  /**
   * Builds the multipart body per the wire format (docs/04 v4): artwork files numbered
   * 0..n-1 in first-use order across image layers, one `artwork-<n>` per file, one
   * `mockup-<view>` per side with layers, `views[].layers` in stack order. Text-only
   * designs send no files at all.
   */
  /** Shared upload options: the same render/export loop and side restore for all three paths. */
  const uploadOptions = {
    design,
    files,
    honeypot,
    renderView: exportViewPng,
    // `activeViewId` is the side the visitor was on when they pressed the button.
    restoreView: () => setRequestedView(activeViewId),
    onProgress: setProgress,
  };

  const send = async (intent: "email" | "order", marketingOptIn: boolean) => {
    if (sending) return;
    setSending(true);
    setSendError(null);
    setCartState(null);
    setProgress("Rendering your mockup…");
    try {
      const built = await buildMockupUpload({ ...uploadOptions, intent, marketingOptIn });
      if (!built.ok) {
        setSendError(built.error);
        return;
      }

      const res = await fetch("/api/mockups", { method: "POST", body: built.upload.body });
      const json = (await res.json()) as
        { ok: true; mockupId: string; mockups: MockupResult["mockups"] } | { ok: false; error: string };
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
      track("gate_submitted", {
        garment: design.garment,
        intent,
        views: payloadPlan(design).payload.views.length,
      });
      const urls: Partial<Record<ViewId, string>> = {};
      for (const [view, blob] of Object.entries(built.upload.blobs)) {
        if (blob) urls[view as ViewId] = URL.createObjectURL(blob);
      }
      setExportedUrls(urls);
      setSuccess({ mockupId: json.mockupId, intent, mockups: json.mockups });
    } catch {
      setSendError("Something went wrong. Please try again or email us.");
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  /**
   * Add to cart (docs/04 §5b): the same multipart body as the email path, posted to
   * /api/cart. Sizes may be empty here — the cart page collects them. When the design was
   * opened from the cart, the new version is stored first and only then is the old id
   * deleted (a failed delete leaves both, and the member removes one).
   */
  const addToCart = async () => {
    if (sending) return;
    setSending(true);
    setSendError(null);
    setCartState(null);
    setProgress("Rendering your mockup…");
    try {
      const built = await buildMockupUpload({ ...uploadOptions, intent: "email", marketingOptIn: false });
      if (!built.ok) {
        setSendError(built.error);
        return;
      }

      const res = await fetch("/api/cart", { method: "POST", body: built.upload.body });
      const json = (await res.json().catch(() => null)) as
        { ok: true; item: { id: string }; count: number } | { ok: false; error: string } | null;
      if (!json?.ok) {
        const message = json?.error ?? "Something went wrong. Please try again or email us.";
        if (res.status === 409) setCartState({ kind: "full", message });
        else setCartState({ kind: "error", message });
        if (res.status === 401 || res.status === 403) {
          refreshAccount();
          dialogPurposeRef.current = "send";
          setSignInDialog(res.status === 401 ? "signedOut" : "unverified");
        }
        return;
      }

      let warning: string | undefined;
      if (cartEditingId) {
        const removed = await fetch(`/api/cart/${cartEditingId}`, { method: "DELETE" }).catch(() => null);
        if (!removed?.ok) {
          warning = "The new version is in, but we couldn't remove the old copy — remove one on the cart page.";
        }
        setCartEditingId(null);
      }
      setCartState({ kind: "added", count: json.count, warning });
      window.dispatchEvent(new Event(CART_CHANGED_EVENT));
    } catch {
      setCartState({ kind: "error", message: "Something went wrong. Please try again or email us." });
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  const designAnother = () => {
    dispatch({ type: "hydrate", step: 1, design: initialDesign(GARMENTS[0]!.id) });
    setRequestedView("front");
    setDraftId(null);
    setDraftName(null);
    sessionStorage.removeItem("charly.draft-id");
    sessionStorage.removeItem("charly.draft-name");
    setFileError(null);
    setSuccess(null);
    setExportedUrls({});
    setSendError(null);
    setCartEditingId(null);
    setCartState(null);
    for (const f of files) URL.revokeObjectURL(f.url);
    setFiles([]);
    // The persist effect rewrites sessionStorage with the fresh state.
  };

  /**
   * Saves the design as a draft (Member perks): the same payloadPlan the send uses (dense
   * artwork indexes, only sides with layers) + the artwork files. An existing draftId
   * updates the same draft (its old images are replaced server-side); "Save as new" clears it.
   */
  const saveDraft = async (
    name: string,
    asNew: boolean,
  ): Promise<{ ok: boolean; error?: string; capReached?: boolean }> => {
    if (!account?.verified) return { ok: false, error: "Please log in first." };
    const plan = payloadPlan(design);
    const id = asNew ? undefined : (draftId ?? undefined);
    const body = new FormData();
    body.append("payload", JSON.stringify({ ...(id ? { id } : {}), name, design: plan.payload }));
    plan.filesInUse.forEach((fileIndex, i) => {
      body.append(`artwork-${i}`, files[fileIndex]!.file);
    });
    const res = await fetch("/api/account/drafts", { method: "POST", body });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; id?: string; error?: string } | null;
    if (!json?.ok) {
      const error = json?.error ?? "Something went wrong. Please try again.";
      // 409 = the drafts cap: the dialog offers the Drafts tab.
      return { ok: false, error, capReached: res.status === 409 };
    }
    const savedId = json.id!;
    setDraftId(savedId);
    setDraftName(name);
    sessionStorage.setItem("charly.draft-id", savedId);
    sessionStorage.setItem("charly.draft-name", name);
    toast({ title: "Draft saved" });
    return { ok: true };
  };

  /** "Add my logo": fetches the brand kit's logo and adds it through the normal upload path. */
  const addBrandLogo = async () => {
    const logo = brandKit?.logo;
    if (!logo?.url) return;
    try {
      const blob = await fetch(logo.url).then((r) => {
        if (!r.ok) throw new Error();
        return r.blob();
      });
      await handleFileSelected(new File([blob], logo.name, { type: blob.type || "image/png" }));
    } catch {
      setFileError("We couldn't load your logo. Try uploading the file instead.");
    }
  };

  /** Which way the step panel slides (P52-3): forward enters from the right, back from the left. */
  const [stepDir, setStepDir] = useState<1 | -1>(1);

  const goStep = (next: BuilderStep) => {
    setStepDir(next >= step ? 1 : -1);
    startTransition(() => {
      dispatch({ type: "setStep", step: next });
    });
    // Steps live below the canvas on phones; keep the panel in view. The scroll-margin
    // that clears the fixed canvas (mobile step 3) arrives with the new step's render,
    // so scroll one frame later — an immediate scrollIntoView reads margin 0.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => {
        document.getElementById("builder-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const stepInfo = STEPS.find((s) => s.id === step)!;

  /* The restore/relink notices (they matter most right after a refresh or restore). */
  const notices = (
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
              : restoreStatus === "expired"
                ? `Loaded your colors and text. Uploaded images are deleted after ${MOCKUP_FILES_RETENTION_DAYS} days, so add yours again.`
                : "We couldn't load that saved design — starting fresh."}
        </p>
      ) : null}
      {sidesNeedingFiles.length > 0 && step === 3 ? (
        <p className="border-border bg-bg-2/60 rounded-md border p-2 text-xs" data-testid="relink-sides" role="note">
          Pick your artwork file again to put it back on: {sidesNeedingFiles.join(", ")}.
        </p>
      ) : null}
    </>
  );

  /* Step pills (smaller) + "Step n of 4" + slim progress bar (docs/04 v2). Rendered in
     the flow everywhere, and inside the mobile tool shell on step 3 (the flow copy is
     display:none there — one visible instance per size). */
  const stepProgress = (
    <div className="border-border bg-bg-1/90 overflow-hidden rounded-xl border" data-testid="builder-progress">
      <div className="flex items-center gap-2 p-2">
        <ol className="flex min-w-0 flex-1 items-center gap-1" aria-label="Builder steps">
          {STEPS.map(({ id, label }) => {
            const done = id < step;
            return (
              <li
                key={id}
                // Phones: the other steps shrink to their number and the current one takes
                // the room its label needs. From 401px up they share the row evenly.
                className={cn("min-w-0 flex-1", step !== id && "max-[400px]:flex-none")}
                aria-current={step === id ? "step" : undefined}
              >
                <button
                  type="button"
                  onClick={() => goStep(id)}
                  aria-label={`Step ${id}: ${label}`}
                  className={cn(
                    "focus-visible:ring-neon-cyan flex min-h-11 w-full items-center gap-1.5 rounded-lg px-1 text-left text-[11px] font-semibold transition-colors duration-[var(--motion-fast)] focus-visible:ring-2 focus-visible:outline-none sm:text-xs",
                    step === id
                      ? "bg-studio-active text-text-1"
                      : done
                        ? "text-text-2 hover:bg-bg-2"
                        : "text-text-3 hover:bg-bg-2",
                  )}
                >
                  {/* The number is CSS content: the visible text (the label) is then a subset
                      of `aria-label="Step n: Label"`, which WCAG 2.5.3 requires. */}
                  <span
                    aria-hidden="true"
                    data-n={String(id).padStart(2, "0")}
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-md border font-mono text-[10px] before:content-[attr(data-n)] sm:h-7 sm:w-7 sm:text-[11px]",
                      step === id
                        ? "border-neon-pink bg-neon-pink text-bg-0 font-bold"
                        : done
                          ? "border-neon-cyan/40 text-neon-cyan"
                          : "border-border bg-bg-3 text-text-2",
                    )}
                  >
                    {done ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                  </span>
                  {/* Phones: only the current step's label shows (numbers otherwise) so the
                      row fits on one line — the aria-label still names every step. */}
                  <span className={cn("truncate", step !== id && "max-[400px]:hidden")}>{label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <p
          aria-hidden="true"
          className={cn("text-text-3 shrink-0 font-mono text-[11px]", step === 3 && "max-sm:hidden")}
        >
          Step {step} of {STEPS.length}
        </p>
      </div>
      <div className="bg-bg-3 h-[3px]" role="presentation">
        <div
          className="bg-sunset h-full transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${(step / STEPS.length) * 100}%` }}
        />
      </div>
      <p className="sr-only" role="status">
        Step {step} of {STEPS.length}: {stepInfo.headline}
      </p>
    </div>
  );

  /** The footer's and the action bar's shared "Save draft" click (sign-in gate first). */
  const startSaveDraft = () => {
    if (account?.verified) {
      setDraftError(null);
      setSaveDraftOpen(true);
      return;
    }
    dialogPurposeRef.current = "draft";
    pendingDropRef.current = null;
    setSignInDialog(account && !account.verified ? "unverified" : "signedOut");
  };

  const colorNames = garment.colorZones.map((zone) => {
    const hex = design.colors[zone.id] ?? garment.defaultColors[zone.id] ?? "#f4f4f4";
    const name = garment.palette.find((c) => c.hex === hex)?.name;
    return name ? `${zone.label}: ${name}` : zone.label;
  });
  const sizeEntries = Object.entries(design.sizes)
    .filter(([, qty]) => qty > 0)
    .map(([size, qty]) => `${qty} × ${size}`);

  // One print method for the whole garment: offered only when it fits every printed side.
  const printMethod = designPrintMethod(design, garment, activeViewId);
  const methodOptions = PRINT_METHODS.map((m) => ({
    ...m,
    blocker: designMethodBlocker(m.id, garment, design.colors, printMethod.areas),
  }));

  return (
    <div
      data-testid="builder-studio"
      className={cn(
        "mt-8 flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start",
        // Mobile step 3 (P51-1): the canvas height budget and the surrounding chrome
        // heights as custom properties, so the tool-tab panel can size itself against
        // them (the sticky canvas also reads --canvas-h).
        mobileStep3 && !keyboardOpen && "[--canvas-h:max(42svh,260px)]",
        mobileStep3 && keyboardOpen && "[--canvas-h:30svh]",
        // The fixed canvas leaves the flow: pad the content below it by its height.
        mobileStep3 && "pt-[calc(var(--canvas-h)+1rem)]",
      )}
    >
      {/* The stepper spans the studio (P52-2b), like the reference: full width above the
          canvas and the panel. Mobile step 3 keeps its own copy inside the tool shell. */}
      {!mobileStep3 ? (
        <div className="flex flex-col gap-3 lg:col-span-2">
          {notices}
          {stepProgress}
        </div>
      ) : null}

      <div
        className={cn(
          "flex min-w-0 flex-col lg:sticky lg:top-24",
          "border-border bg-bg-1/90 overflow-hidden rounded-2xl border shadow-[var(--glow-panel)]",
          // Mobile step 3: FIXED, not sticky — a sticky element can only travel within
          // its parent, so it unsticks exactly when the visitor reads the panel below.
          // Fixed keeps the canvas on screen for the whole step; content scrolls under it.
          // The panel chrome (header + padding) is desktop-only so --canvas-h stays exact.
          mobileStep3 && "bg-bg-0 fixed inset-x-0 top-16 z-30 gap-2 rounded-none border-0 pb-4 shadow-none",
        )}
      >
        {/* Canvas panel head (P52-2b): LIVE PREVIEW + the current side. */}
        <div className="border-border hidden h-[var(--canvas-head)] items-center justify-between gap-2 border-b px-3 lg:flex">
          <p className="text-neon-cyan flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.2em] uppercase">
            <span aria-hidden="true" className="bg-neon-cyan h-1.5 w-1.5 rounded-full" />
            Live preview
          </p>
          <span className="border-border bg-bg-3 text-text-2 rounded-full border px-2.5 py-0.5 text-[11px]">
            {activeView.label} view
          </span>
        </div>
        <div className={cn("flex flex-col gap-2", mobileStep3 ? "p-0" : "p-2")}>
          <GarmentStage
            ref={stageRef}
            garmentName={garment.name}
            view={activeView}
            printAreaId={activeViewState.printArea}
            colors={design.colors}
            layers={activeViewState.layers}
            selectedLayerId={activeViewState.selectedLayerId}
            images={Object.fromEntries(files.map((f, i) => [i, f.img]))}
            fitContainerHeight={mobileStep3}
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
            views={garment.views}
            onViewChange={setRequestedView}
            canUndo={canUndo}
            canRedo={canRedo}
          />
          <p className={cn("text-text-3 text-xs", mobileStep3 && "sr-only")}>
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
      </div>

      <div
        id="builder-panel"
        className={cn(
          "flex min-w-0 flex-col gap-4",
          // Mobile step 3: goStep's scrollIntoView must land the panel below the sticky
          // canvas + tabs, not at the viewport top (which the sticky canvas covers).
          mobileStep3 && "scroll-mt-[calc(4rem+var(--canvas-h)+1rem)]",
          // Desktop step 1: the panel is exactly as tall as the preview; the garment list
          // scrolls inside it (Logan, 2026-11-26). h-0 + min-h-full = "the row's height".
          step === 1 && !success && "lg:h-0 lg:min-h-full lg:self-stretch",
        )}
      >
        <ViewTransition
          key={step}
          enter={stepDir > 0 ? "slide-in-right" : "slide-in-left"}
          exit={stepDir > 0 ? "slide-out-left" : "slide-out-right"}
          default="none"
        >
          {success ? (
            <div className="border-border bg-bg-1/90 rounded-2xl border p-4 shadow-[var(--glow-panel)] sm:p-6">
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
              <div
                className={cn(
                  "border-border bg-bg-1/90 rounded-2xl border p-4 shadow-[var(--glow-panel)] sm:p-6",
                  step === 1 && "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col",
                )}
              >
                {/* Below lg on step 3 the fixed tool shell replaces this card header. */}
                <header
                  className={cn("border-border mb-5 flex items-start gap-3 border-b pb-4", mobileStep3 && "hidden")}
                >
                  <span
                    aria-hidden="true"
                    className="border-neon-pink/40 bg-neon-pink/10 text-neon-pink flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
                  >
                    {(() => {
                      const StepIcon = STEP_ICONS[step];
                      return <StepIcon className="h-5 w-5" />;
                    })()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-neon-cyan font-mono text-[9px] font-bold tracking-[0.14em] uppercase">
                      Step {String(step).padStart(2, "0")} / {stepInfo.label}
                    </p>
                    <h2 className="font-heading text-text-1 mt-0.5 text-xl tracking-wide uppercase">
                      {stepInfo.headline}
                    </h2>
                    <p className="text-text-2 mt-1 text-sm">{stepInfo.helper}</p>
                  </div>
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
                  isDesktop ? (
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
                      brandInks={brandKit?.inkColors}
                      brandFonts={brandKit?.fonts as TextFontId[] | undefined}
                      logo={brandKit?.logo}
                      onAddLogo={() => void addBrandLogo()}
                      lockRatio={lockRatio}
                      onLockRatioChange={setLockRatio}
                      onUploadClick={() => void attemptUpload()}
                      onDropFile={(file) => void attemptUpload(file)}
                      onAddText={addText}
                      onViewChange={setRequestedView}
                      onSetPrintArea={(viewId, areaId) =>
                        dispatch({ type: "setPrintArea", view: viewId, printAreaId: areaId })
                      }
                      method={printMethod.method}
                      methodOptions={methodOptions}
                      onSetPrintMethod={(viewId, method) => dispatch({ type: "setPrintMethod", view: viewId, method })}
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
                  ) : (
                    <ToolTabs
                      top={
                        mobileStep3 ? (
                          <>
                            {notices}
                            {stepProgress}
                          </>
                        ) : undefined
                      }
                      view={activeView}
                      views={garment.views}
                      viewState={activeViewState}
                      artByView={artByView}
                      files={chooserFiles}
                      selectedFileReady={selectedLayer?.type !== "image" || !!files[selectedLayer.fileIndex]}
                      fileError={fileError}
                      capReached={activeViewState.layers.length >= MAX_LAYERS_PER_VIEW}
                      accountEmail={account?.verified ? account.email : null}
                      brandInks={brandKit?.inkColors}
                      brandFonts={brandKit?.fonts as TextFontId[] | undefined}
                      logo={brandKit?.logo}
                      onAddLogo={() => void addBrandLogo()}
                      lockRatio={lockRatio}
                      onLockRatioChange={setLockRatio}
                      onUploadClick={() => void attemptUpload()}
                      onDropFile={(file) => void attemptUpload(file)}
                      onAddText={addText}
                      onViewChange={setRequestedView}
                      onSetPrintArea={(viewId, areaId) =>
                        dispatch({ type: "setPrintArea", view: viewId, printAreaId: areaId })
                      }
                      method={printMethod.method}
                      methodOptions={methodOptions}
                      onSetPrintMethod={(viewId, method) => dispatch({ type: "setPrintMethod", view: viewId, method })}
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
                  )
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
                    onAddToCart={() => void addToCart()}
                    cartEditing={!!cartEditingId}
                    cartState={cartState}
                    onDesignAnother={designAnother}
                  />
                ) : null}

                {/* Below lg on step 3 these live in the fixed action bar instead (P51-1);
                  conditionally rendered — never two copies in the DOM. Step 1 has its own
                  Continue under the garment list and nothing to go back to, so no footer. */}
                {!mobileStep3 && step > 1 ? (
                  <div className="border-border bg-bg-0/40 -mx-4 mt-6 border-t px-2 py-2 sm:-mx-6">
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-11"
                        onClick={() => goStep((step - 1) as BuilderStep)}
                      >
                        ← Back
                      </Button>
                      <span className="ml-auto flex flex-wrap items-center gap-1">
                        {step === 3 ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-11 w-11 px-0"
                              onClick={undo}
                              disabled={!canUndo}
                              data-testid="undo"
                              aria-label="Undo"
                            >
                              <UndoIcon className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-11 w-11 px-0"
                              onClick={redo}
                              disabled={!canRedo}
                              data-testid="redo"
                              aria-label="Redo"
                            >
                              <RedoIcon className="h-4 w-4" />
                            </Button>
                          </>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-11"
                          onClick={startSaveDraft}
                          data-testid="save-draft"
                        >
                          <SaveIcon className="h-4 w-4" />
                          Save draft
                        </Button>
                        {step < 4 ? (
                          <Button size="sm" className="min-h-11" onClick={() => goStep((step + 1) as BuilderStep)}>
                            Continue →
                          </Button>
                        ) : null}
                      </span>
                      <StartOverButton onConfirm={designAnother} />
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </ViewTransition>
      </div>

      {mobileStep3 ? (
        <MobileActionBar
          canGoBack={step > 1}
          canUndo={canUndo}
          canRedo={canRedo}
          onBack={() => goStep((step - 1) as BuilderStep)}
          onContinue={() => goStep(4)}
          onSaveDraft={startSaveDraft}
          onUndo={undo}
          onRedo={redo}
          onStartOver={designAnother}
        />
      ) : null}

      {saveDraftOpen ? (
        <SaveDraftDialog
          initialName={draftName ?? `${garment.name} draft`}
          hasDraft={!!draftId}
          capError={draftError}
          onClose={() => setSaveDraftOpen(false)}
          onSave={saveDraft}
        />
      ) : null}

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
          if (dialogPurposeRef.current === "draft") {
            setSaveDraftOpen(true); // back to saving the draft, now signed in
            return;
          }
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
