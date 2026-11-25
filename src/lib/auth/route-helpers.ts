import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";

import { zodFieldErrors } from "../action-result";
import { isSameOrigin } from "./origin";

export const fail = (error: string, status: number, fieldErrors?: Record<string, string>) =>
  NextResponse.json({ ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) }, { status });

/** Origin check + JSON body parsed with `schema`. Returns the data or a ready error response. */
export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ data: z.infer<S> } | { response: NextResponse }> {
  if (!isSameOrigin(request)) return { response: fail("Invalid request.", 403) };
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: fail("Invalid request.", 400) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { response: fail("Please fix the highlighted fields.", 400, zodFieldErrors(parsed.error)) };
  }
  return { data: parsed.data };
}
