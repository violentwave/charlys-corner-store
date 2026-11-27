import "server-only";

import { NextResponse } from "next/server";

import { zodFieldErrors } from "@/lib/action-result";
import { checkArtwork } from "@/lib/artwork";
import { BodyTooLargeError, readFormDataLimited } from "@/lib/http";
import {
  artworkCount,
  MOCKUP_ARTWORK_KINDS,
  MOCKUP_ARTWORK_TOTAL_BYTES,
  MOCKUP_RENDER_MAX_BYTES,
  mockupPayloadSchema,
  type MockupPayload,
} from "@/lib/mockup-schema";

/**
 * The builder's multipart upload (payload JSON + artwork-N originals + mockup-<view> PNGs),
 * parsed and fully validated before anything is stored. Shared by POST /api/mockups (email /
 * order request) and POST /api/cart (add to cart) so the two can't drift.
 */

/** Original artwork (≤ 30 MB in total) + up to 4 rendered mockups (≤ 4 MB each) + form overhead. */
export const MAX_MOCKUP_REQUEST_BYTES = MOCKUP_ARTWORK_TOTAL_BYTES + 4 * MOCKUP_RENDER_MAX_BYTES + 1024 * 1024;

/** Rendered mockups are exported at template size; anything far larger is not ours. */
const MAX_RENDER_PX = 4096;

/** Width/height from a PNG's IHDR chunk (bytes 16–23, big-endian). Caller has checked the signature. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.byteLength < 24) return { width: 0, height: 0 };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export type MockupUpload = {
  data: MockupPayload;
  artworks: { file: File; bytes: Uint8Array; contentType: string }[];
  renders: { view: string; bytes: Uint8Array }[];
};

export type MockupUploadResult = ({ ok: true } & MockupUpload) | { ok: false; response: NextResponse };

const fail = (error: string, status: number, fieldErrors?: Record<string, string>): MockupUploadResult => ({
  ok: false,
  response: NextResponse.json({ ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) }, { status }),
});

export async function parseMockupUpload(request: Request): Promise<MockupUploadResult> {
  let form: FormData;
  try {
    form = await readFormDataLimited(request, MAX_MOCKUP_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return fail("That upload is too large — your artwork files must be 30 MB or less in total.", 413);
    }
    return fail("Invalid request.", 400);
  }

  const raw: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") raw[key] = value;

  if (typeof raw.website === "string" && raw.website.trim() !== "") {
    return { ok: false, response: NextResponse.json({ ok: true, message: "Thanks! We'll be in touch." }) };
  }

  let json: unknown;
  if (typeof raw.payload !== "string") return fail("Invalid request.", 400);
  try {
    json = JSON.parse(raw.payload);
  } catch {
    return fail("Invalid request.", 400);
  }
  const parsed = mockupPayloadSchema.safeParse(json);
  if (!parsed.success) return fail("Please fix the highlighted fields.", 400, zodFieldErrors(parsed.error));
  const data = parsed.data;

  // Artwork files: exactly artwork-0 … artwork-(n-1), one per distinct views[].artwork index.
  // (A single legacy "artwork" field counts as artwork-0.)
  const isFile = (value: FormDataEntryValue): value is File =>
    value instanceof File && (value.size > 0 || value.name !== "");
  const artworkEntries = [...form.entries()].filter(
    (e): e is [string, File] => /^artwork(-\d)?$/.test(e[0]) && isFile(e[1]),
  );
  const artworkFiles: File[] = [];
  for (const [key, file] of artworkEntries) {
    const index = key === "artwork" ? 0 : Number(key.slice("artwork-".length));
    if (artworkFiles[index]) return fail("Please attach each artwork file once.", 400);
    artworkFiles[index] = file;
  }
  const needed = artworkCount(data.views);
  const missing = Array.from({ length: needed }, (_, i) => i).some((i) => !artworkFiles[i]);
  if (artworkFiles.length !== needed || missing) {
    return fail(needed === 1 ? "Please attach your artwork file." : "Please attach every artwork file.", 400);
  }

  // Exactly one mockup-<view> per listed view, and no others (field name is the source of truth,
  // never the browser-supplied file name).
  const wanted = new Set(data.views.map((v) => `mockup-${v.view}`));
  const renderParts = [...form.entries()].filter(
    ([key, value]) => key.startsWith("mockup-") && value instanceof File && (value.size > 0 || value.name !== ""),
  ) as [string, File][];
  const counts = new Map<string, number>();
  for (const [key] of renderParts) counts.set(key, (counts.get(key) ?? 0) + 1);
  const badFiles =
    renderParts.length !== wanted.size ||
    [...wanted].some((key) => counts.get(key) !== 1) ||
    [...counts.keys()].some((key) => !wanted.has(key));
  if (badFiles) {
    return fail("We couldn't match your rendered mockups to your design. Please try submitting again.", 400);
  }

  // Validate EVERY file before storing ANY, so a bad file never leaves orphans behind.
  const artworks: { file: File; bytes: Uint8Array; contentType: string }[] = [];
  let artworkTotal = 0;
  for (const file of artworkFiles) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    artworkTotal += bytes.byteLength;
    if (artworkTotal > MOCKUP_ARTWORK_TOTAL_BYTES) {
      return fail("Your artwork files must be 30 MB or less in total.", 400, { artwork: "Files too large" });
    }
    const check = checkArtwork(bytes);
    const kindOk = check.ok && (MOCKUP_ARTWORK_KINDS as readonly string[]).includes(check.kind);
    if (!check.ok || !kindOk) {
      return fail("That artwork type won't render on the mockup. Please use PNG, JPG, WEBP, or SVG.", 400, {
        artwork: check.ok ? "That file type won't render on the mockup." : check.error,
      });
    }
    artworks.push({ file, bytes, contentType: check.contentType });
  }

  const renders: { view: string; bytes: Uint8Array }[] = [];
  for (const [key, file] of renderParts) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MOCKUP_RENDER_MAX_BYTES) {
      return fail("Your rendered mockup came out too large. Please try again.", 400);
    }
    const check = checkArtwork(bytes);
    if (!check.ok || check.kind !== "png") {
      return fail("Something went wrong rendering your mockup. Please try again.", 400);
    }
    // Renders are template-sized (1000 px wide); refuse oversized dimensions so a tiny,
    // highly compressed PNG can't decompress into a huge image in someone's mail client.
    const { width, height } = pngSize(bytes);
    if (width < 1 || height < 1 || width > MAX_RENDER_PX || height > MAX_RENDER_PX) {
      return fail("Something went wrong rendering your mockup. Please try again.", 400);
    }
    renders.push({ view: key.slice("mockup-".length), bytes });
  }

  return { ok: true, data, artworks, renders };
}
