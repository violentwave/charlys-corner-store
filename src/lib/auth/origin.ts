import "server-only";

/**
 * CSRF guard for cookie-authenticated POSTs: browsers always send Origin on cross-site
 * POSTs, so a present Origin must match this host. (SameSite=Lax already blocks most
 * cross-site cookie use; this closes the rest.) Requests without Origin (curl, tests)
 * carry no browser cookies by accident, so they're allowed.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}
