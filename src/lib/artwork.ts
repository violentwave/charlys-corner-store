/**
 * Artwork upload rules. The old site took PNG/JPEG up to 20 MB; docs/01 adds PDF, SVG, AI/EPS.
 * Never trust the browser's MIME type or file extension: detect the type from the file's bytes.
 */
export const ARTWORK_MAX_BYTES = 20 * 1024 * 1024;

export const ARTWORK_TYPES = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
  svg: "image/svg+xml",
  eps: "application/postscript",
} as const;

export type ArtworkKind = keyof typeof ARTWORK_TYPES;

/** For <input accept>. Informational only; the server re-checks bytes. */
export const ARTWORK_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.pdf,.svg,.ai,.eps,image/png,image/jpeg,image/webp,application/pdf,image/svg+xml";

export const ARTWORK_HELP = "PNG, JPG, WEBP, PDF, SVG, AI, or EPS up to 20 MB. Transparent PNGs look best.";

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

/** Returns the detected kind, or null if the bytes aren't an allowed artwork format. AI files are PDF or EPS inside. */
export function detectArtworkKind(bytes: Uint8Array): ArtworkKind | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF (also modern .ai)
  if (startsWith(bytes, [0x25, 0x21, 0x50, 0x53])) return "eps"; // %!PS (also legacy .ai)
  if (startsWith(bytes, [0xc5, 0xd0, 0xd3, 0xc6])) return "eps"; // DOS EPS binary header
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).replace(/^﻿/, "").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "svg";
  return null;
}

export type ArtworkCheck = { ok: true; kind: ArtworkKind; contentType: string } | { ok: false; error: string };

export function checkArtwork(bytes: Uint8Array): ArtworkCheck {
  if (bytes.byteLength === 0) return { ok: false, error: "That file is empty." };
  if (bytes.byteLength > ARTWORK_MAX_BYTES) return { ok: false, error: "Files must be 20 MB or smaller." };
  const kind = detectArtworkKind(bytes);
  if (!kind) return { ok: false, error: `Unsupported file. ${ARTWORK_HELP}` };
  return { ok: true, kind, contentType: ARTWORK_TYPES[kind] };
}
