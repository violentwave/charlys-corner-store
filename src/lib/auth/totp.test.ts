// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { base32Decode, base32Encode, totpCode, totpStep, totpUri, verifyTotp } = await import("./totp");

// RFC 6238 Appendix B test secret (ASCII "12345678901234567890"), SHA-1, 8 digits there;
// the 6-digit codes are the last 6 digits of the published values.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it("matches the RFC test vectors", () => {
    expect(totpCode(RFC_SECRET, totpStep(59_000))).toBe("287082");
    expect(totpCode(RFC_SECRET, totpStep(1_111_111_109_000))).toBe("081804");
    expect(totpCode(RFC_SECRET, totpStep(1_234_567_890_000))).toBe("005924");
    expect(totpCode(RFC_SECRET, totpStep(2_000_000_000_000))).toBe("279037");
  });

  it("base32 round-trips", () => {
    const bytes = Buffer.from([0, 1, 2, 250, 255, 7, 9]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it("accepts ±1 step, refuses reuse and older steps", () => {
    const now = 1_800_000_000_000;
    const step = totpStep(now);
    const code = totpCode(RFC_SECRET, step - 1);
    expect(verifyTotp(RFC_SECRET, code, null, now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, code, step - 1, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), null, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", null, now)).toBeNull();
  });

  it("builds an otpauth URI apps understand", () => {
    expect(totpUri("ABC", "fan@example.com", "Charly's Corner Store")).toBe(
      "otpauth://totp/Charly's%20Corner%20Store%3Afan%40example.com?secret=ABC&issuer=Charly%27s+Corner+Store&algorithm=SHA1&digits=6&period=30",
    );
  });
});
