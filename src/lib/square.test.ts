import { describe, expect, it } from "vitest";

import { createHmac } from "node:crypto";

import { verifySquareSignature } from "./square";

describe("verifySquareSignature", () => {
  const key = "test-signature-key";
  const url = "https://example.com/api/webhooks/square";
  const body = '{"type":"payment.updated"}';

  it("accepts a valid signature", () => {
    const sig = createHmac("sha256", key)
      .update(url + body)
      .digest("base64");
    expect(verifySquareSignature(body, sig, url, key)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = createHmac("sha256", key)
      .update(url + body)
      .digest("base64");
    expect(verifySquareSignature(body + "x", sig, url, key)).toBe(false);
  });

  it("rejects a wrong URL", () => {
    const sig = createHmac("sha256", key)
      .update(url + body)
      .digest("base64");
    expect(verifySquareSignature(body, sig, url + "/x", key)).toBe(false);
  });

  it("rejects a wrong key", () => {
    const sig = createHmac("sha256", key)
      .update(url + body)
      .digest("base64");
    expect(verifySquareSignature(body, sig, url, "other")).toBe(false);
  });

  it("rejects a missing/empty header or key", () => {
    expect(verifySquareSignature(body, null, url, key)).toBe(false);
    expect(verifySquareSignature(body, "abc", url, "")).toBe(false);
  });
});
