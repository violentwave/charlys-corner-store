import { describe, expect, it } from "vitest";

import { sanitizeNext } from "./safe-next";

describe("sanitizeNext", () => {
  it("accepts same-site paths", () => {
    expect(sanitizeNext("/account")).toBe("/account");
    expect(sanitizeNext("/design")).toBe("/design");
    expect(sanitizeNext("/design?mockup=abc&step=2")).toBe("/design?mockup=abc&step=2");
    expect(sanitizeNext("/deep/nested/path/")).toBe("/deep/nested/path/");
  });

  it("accepts arrays by taking the first value", () => {
    expect(sanitizeNext(["/account", "/other"])).toBe("/account");
  });

  it("rejects off-site and scheme-relative values", () => {
    const fallback = "/account";
    expect(sanitizeNext("https://evil.com", fallback)).toBe(fallback);
    expect(sanitizeNext("http://evil.com", fallback)).toBe(fallback);
    expect(sanitizeNext("//evil.com", fallback)).toBe(fallback);
    expect(sanitizeNext("/\\evil.com", fallback)).toBe(fallback);
    expect(sanitizeNext("javascript:alert(1)", fallback)).toBe(fallback);
  });

  it("rejects control characters, whitespace and escapes", () => {
    const fallback = "/account";
    expect(sanitizeNext("/acc ount", fallback)).toBe(fallback);
    expect(sanitizeNext("/acc%0Dount", fallback)).toBe(fallback);
    expect(sanitizeNext("/acc\nount", fallback)).toBe(fallback);
    expect(sanitizeNext("/acc\\ount", fallback)).toBe(fallback);
    expect(sanitizeNext('/acc"ount', fallback)).toBe(fallback);
  });

  it("falls back on empty or missing values", () => {
    const fallback = "/login";
    expect(sanitizeNext(null, fallback)).toBe(fallback);
    expect(sanitizeNext(undefined, fallback)).toBe(fallback);
    expect(sanitizeNext("", fallback)).toBe(fallback);
    expect(sanitizeNext([], fallback)).toBe(fallback);
  });

  it("defaults the fallback to /account", () => {
    expect(sanitizeNext("//evil.com")).toBe("/account");
  });
});
