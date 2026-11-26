import "server-only";

import { checkArtwork } from "./artwork";
import { MOCKUP_ARTWORK_KINDS, MOCKUP_ARTWORK_TOTAL_BYTES } from "./mockup-schema";

export type CheckedArtwork = { name: string; bytes: Uint8Array; contentType: string };

const isFile = (value: FormDataEntryValue): value is File =>
  value instanceof File && (value.size > 0 || value.name !== "");

/**
 * Reads `artwork-0 … artwork-(n-1)` from a multipart form (drafts, brand kit logo) and checks
 * every file by its bytes before anything is stored. Same rules as /api/mockups.
 */
export async function readArtworkParts(
  form: FormData,
  needed: number,
  field = "artwork",
): Promise<{ ok: true; files: CheckedArtwork[] } | { ok: false; error: string }> {
  const entries = [...form.entries()].filter(
    (e): e is [string, File] => new RegExp(`^${field}-\\d$`).test(e[0]) && isFile(e[1]),
  );
  const files: File[] = [];
  for (const [key, file] of entries) {
    const index = Number(key.slice(field.length + 1));
    if (files[index]) return { ok: false, error: "Please attach each file once." };
    files[index] = file;
  }
  const missing = Array.from({ length: needed }, (_, i) => i).some((i) => !files[i]);
  if (files.length !== needed || missing) {
    return { ok: false, error: needed === 1 ? "Please attach your image." : "Please attach every image." };
  }
  const out: CheckedArtwork[] = [];
  let total = 0;
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    total += bytes.byteLength;
    if (total > MOCKUP_ARTWORK_TOTAL_BYTES) return { ok: false, error: "Your images must be 30 MB or less in total." };
    const check = checkArtwork(bytes);
    if (!check.ok || !(MOCKUP_ARTWORK_KINDS as readonly string[]).includes(check.kind)) {
      return { ok: false, error: "Please use PNG, JPG, WEBP, or SVG images." };
    }
    out.push({ name: file.name.slice(0, 200) || "image", bytes, contentType: check.contentType });
  }
  return { ok: true, files: out };
}
