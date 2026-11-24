import type { ZodError } from "zod";

/** Shape every public-form server action returns, so forms render results the same way. */
export type ActionResult =
  { ok: true; message: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** First message per field path, e.g. { email: "Please enter a valid email" }. */
export function zodFieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (path && !out[path]) out[path] = issue.message;
  }
  return out;
}
