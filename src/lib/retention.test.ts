import { describe, expect, it } from "vitest";

import { MOCKUP_FILES_RETENTION_DAYS, mockupFilesExpired, mockupStoragePrefix } from "./retention";

describe("mockup file retention", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date("2026-11-26T12:00:00Z");
  it("emailed mockups expire after the retention window; orders never do", () => {
    expect(MOCKUP_FILES_RETENTION_DAYS).toBe(30);
    expect(mockupFilesExpired("mockup", new Date(now.getTime() - 29.9 * day), now)).toBe(false);
    expect(mockupFilesExpired("mockup", new Date(now.getTime() - 30 * day), now)).toBe(true);
    expect(mockupFilesExpired("order", new Date(now.getTime() - 300 * day), now)).toBe(false);
  });
  it("orders get their own folder so the lifecycle rule skips them", () => {
    expect(mockupStoragePrefix("order")).toBe("orders");
    expect(mockupStoragePrefix("mockup")).toBe("mockups");
  });
});
