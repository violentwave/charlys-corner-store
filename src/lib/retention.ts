/**
 * How long stored files live (Logan, 2026-11-26: 3 days, then 30 days the same night;
 * R2 rule "delete-mockups-30-days"). The deleting itself is an R2 bucket
 * lifecycle rule (Cloudflare dashboard → R2 → bucket → Settings → Object lifecycle rules):
 * objects under `mockups/` are deleted after MOCKUP_FILES_RETENTION_DAYS. Keep that rule and
 * this constant in step. Order requests (`orders/`), existing-order uploads (`uploads/`) and
 * quote files (`quotes/`) are kept; the owner cleans those up.
 */
export const MOCKUP_FILES_RETENTION_DAYS = 30;

/** Storage folder for a builder submission's files (originals + rendered mockups). */
export function mockupStoragePrefix(kind: "mockup" | "order"): "mockups" | "orders" {
  return kind === "order" ? "orders" : "mockups";
}

/**
 * True once an emailed mockup's files may be gone. Rows from before 2026-11-26 stored order
 * files under `mockups/` too, so kind alone isn't proof for those; treat them by kind anyway
 * (dev data only at the time of the change).
 */
export function mockupFilesExpired(kind: "mockup" | "order", createdAt: Date, now = new Date()): boolean {
  if (kind === "order") return false;
  return now.getTime() - createdAt.getTime() >= MOCKUP_FILES_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}
