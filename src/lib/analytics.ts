/**
 * Tiny analytics hook (docs/04 non-functional list). No vendor script yet — events
 * are recorded as a no-op in production and logged to the console in development,
 * so wiring a real provider later means touching only this file.
 */
export type AnalyticsEvent =
  | "builder_start"
  | "garment_selected"
  | "artwork_uploaded"
  | "text_added"
  | "gate_viewed"
  | "gate_submitted"
  | "quote_requested"
  | "mockup_downloaded";

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[analytics] ${event}`, props);
  }
}
