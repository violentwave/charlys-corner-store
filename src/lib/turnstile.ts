import "server-only";

/**
 * Cloudflare Turnstile server-side check (every public form, docs/02).
 * Local dev + CI use Cloudflare's published test keys (see .env.example), which always pass
 * when the secret is the test secret.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = { ok: true } | { ok: false; error: string };

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new Error("TURNSTILE_SECRET_KEY is not set");
  if (!token) return { ok: false, error: "Please complete the anti-spam check." };

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetchImpl(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as { success?: boolean };
    return data.success ? { ok: true } : { ok: false, error: "Anti-spam check failed. Please try again." };
  } catch {
    return { ok: false, error: "We couldn't verify the anti-spam check. Please try again." };
  }
}
