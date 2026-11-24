import "server-only";

export class BodyTooLargeError extends Error {
  constructor(public readonly limit: number) {
    super(`Request body exceeds ${limit} bytes`);
  }
}

/**
 * Parse multipart/urlencoded form data without ever buffering more than `maxBytes`.
 * `request.formData()` alone reads the whole body into memory, and a Content-Length check can
 * be skipped by sending a chunked body with no length, which matters on a 512 MB Render instance.
 */
export async function readFormDataLimited(request: Request, maxBytes: number): Promise<FormData> {
  const declared = Number(request.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError(maxBytes);
  if (!request.body) return new FormData();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLargeError(maxBytes);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(body, {
    headers: { "content-type": request.headers.get("content-type") ?? "application/octet-stream" },
  }).formData();
}

/** Real file parts only: browsers can send an empty, nameless part for an untouched file input. */
export function fileParts(form: FormData, field: string): File[] {
  return form.getAll(field).filter((v): v is File => v instanceof File && (v.size > 0 || v.name !== ""));
}

/** Shorten user-supplied text before echoing it anywhere (emails, messages). */
export function clip(value: string, max = 80): string {
  const oneLine = value.replace(/[\r\n\t]+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}
