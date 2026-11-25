/**
 * Sanitize a `?next=` redirect target. Only same-site paths are allowed: the value
 * must start with a single "/" (never "//" or "/\", which browsers treat as
 * scheme-relative), and must not smuggle control characters or whitespace.
 * Anything else falls back to the caller's default.
 */
export function sanitizeNext(raw: string | string[] | null | undefined, fallback = "/account"): string {
  const value = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\s\[\]{}<>"'`\\^\u0000-\u001f\u007f]/.test(value)) return fallback;
  if (/%0a|%0d/i.test(value)) return fallback;
  return value;
}
