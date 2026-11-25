/**
 * Client-side POST helper for the /api/auth routes. Every endpoint answers with the
 * `fail()` shape ({ ok: false, error, fieldErrors? }) or a 2xx { ok: true, ... } body.
 */
export type AuthFail = { ok: false; error: string; fieldErrors?: Record<string, string> };
export type AuthOk = { ok: true } & Record<string, unknown>;
export type AuthResponse = AuthOk | AuthFail;

export async function postJson(path: string, body?: unknown): Promise<{ status: number; data: AuthResponse | null }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = (await res.json().catch(() => null)) as AuthResponse | null;
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

/** Applies server fieldErrors to RHF fields; returns them so callers can react too. */
export function mapFieldErrors<TField extends string>(
  data: AuthResponse,
  setError: (field: TField, error: { message: string }) => void,
): Record<string, string> {
  if (data && !data.ok && data.fieldErrors) {
    for (const [field, message] of Object.entries(data.fieldErrors)) {
      // Server field names are outside our type control (they mirror the shared schemas, but
      // an old/mismatched server could name anything); RHF only renders registered fields.
      setError(field as TField, { message });
    }
    return data.fieldErrors;
  }
  return {};
}

export const NETWORK_ERROR = "Something went wrong on our end. Please try again.";
