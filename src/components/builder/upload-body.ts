/**
 * The builder's multipart body (docs/04 v4), shared by step 4's three paths: "Email me this
 * mockup", "Order this design" and "Add to cart". Same payload, same dense artwork numbering,
 * same per-side render loop and side restore — only the destination differs.
 */
import { VIEW_LABELS, type ViewId } from "@/lib/garments";

import { payloadPlan, type BuilderDesign } from "./use-builder-state";

export type BuiltUpload = {
  body: FormData;
  /** The rendered PNG per side (the success screen turns these into object URLs). */
  blobs: Partial<Record<ViewId, Blob>>;
};

export type BuildUploadResult = { ok: true; upload: BuiltUpload } | { ok: false; error: string };

export async function buildMockupUpload({
  design,
  files,
  intent,
  marketingOptIn,
  honeypot,
  renderView,
  restoreView,
  onProgress,
}: {
  design: BuilderDesign;
  files: { file: File }[];
  intent: "email" | "order";
  marketingOptIn: boolean;
  honeypot: string;
  /** Renders one side at template size (the builder's Konva stage). */
  renderView: (view: ViewId) => Promise<Blob | null>;
  /** Puts the canvas back on the side the visitor was looking at. */
  restoreView: () => void;
  onProgress?: (text: string) => void;
}): Promise<BuildUploadResult> {
  const plan = payloadPlan(design);
  if (plan.payload.views.length === 0) {
    return { ok: false, error: "Add something to at least one side — go back to step 3." };
  }
  const missing = plan.payload.views
    .filter((view) => view.layers.some((layer) => layer.type === "image" && !files[plan.filesInUse[layer.artwork]!]))
    .map((view) => VIEW_LABELS[view.view]);
  if (missing.length > 0) {
    return { ok: false, error: `Pick your artwork file again for: ${missing.join(", ")}.` };
  }

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

  onProgress?.("Uploading your mockup…");
  const blobs: Partial<Record<ViewId, Blob>> = {};
  try {
    for (const view of plan.payload.views) {
      const blob = await renderView(view.view);
      if (!blob) return { ok: false, error: "We couldn't render your mockup. Please try again." };
      blobs[view.view] = blob;
      body.append(`mockup-${view.view}`, blob, `mockup-${view.view}.png`);
    }
  } catch {
    return { ok: false, error: "We couldn't render your mockup. Please try again." };
  } finally {
    restoreView();
  }
  return { ok: true, upload: { body, blobs } };
}
