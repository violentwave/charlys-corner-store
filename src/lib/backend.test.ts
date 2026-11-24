// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { checkArtwork, detectArtworkKind, ARTWORK_MAX_BYTES } from "./artwork";
import { zodFieldErrors } from "./action-result";
import { _clearOutbox, _outbox, sendEmail } from "./email";
import { clientIp } from "./rate-limit";
import { contactSchema } from "./schemas";
import { _memoryObject, buildObjectKey, getStorage } from "./storage";
import { verifyTurnstile } from "./turnstile";

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);

describe("artwork detection (magic bytes, not file names)", () => {
  it.each([
    ["png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)],
    ["jpeg", bytes(0xff, 0xd8, 0xff, 0xe0)],
    ["webp", text("RIFF\0\0\0\0WEBPVP8 ")],
    ["pdf", text("%PDF-1.7")],
    ["eps", text("%!PS-Adobe-3.0 EPSF-3.0")],
    ["svg", text('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ["svg", text("<svg></svg>")],
  ])("detects %s", (kind, b) => {
    expect(detectArtworkKind(b)).toBe(kind);
  });

  it("rejects disguised or unsupported files", () => {
    expect(detectArtworkKind(text("MZ\x90\0 windows exe"))).toBeNull();
    expect(detectArtworkKind(text("<html><script>alert(1)</script>"))).toBeNull();
    expect(checkArtwork(new Uint8Array())).toMatchObject({ ok: false });
    const big = new Uint8Array(ARTWORK_MAX_BYTES + 1);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(checkArtwork(big)).toEqual({ ok: false, error: "Files must be 20 MB or smaller." });
    expect(checkArtwork(text("%PDF-1.4"))).toEqual({ ok: true, kind: "pdf", contentType: "application/pdf" });
  });
});

describe("storage", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("builds unguessable keys and never trusts the file name for paths", () => {
    const key = buildObjectKey("uploads", "../../etc/My Logo (final).PNG", new Date("2026-11-24T00:00:00Z"));
    expect(key).toMatch(/^uploads\/2026\/11\/[0-9a-f-]{36}-etc-my-logo-final.png$/);
    expect(key).not.toContain("..");
    expect(buildObjectKey("uploads", "...")).toMatch(/-file$/);
  });

  it("memory driver stores bytes", async () => {
    vi.stubEnv("STORAGE_DRIVER", "memory");
    const storage = getStorage();
    await storage.put("t/k.png", bytes(1, 2, 3), "image/png");
    expect(_memoryObject("t/k.png")).toEqual({ body: bytes(1, 2, 3), contentType: "image/png" });
    expect(await storage.signedUrl("t/k.png")).toBe("memory://t/k.png");
  });
});

describe("email console driver", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    _clearOutbox();
  });
  it("records instead of sending", async () => {
    vi.stubEnv("EMAIL_DRIVER", "console");
    const res = await sendEmail({ to: "a@b.co", subject: "Hi", html: "<p>Hi</p>", text: "Hi" });
    expect(res.ok).toBe(true);
    expect(_outbox()).toHaveLength(1);
  });
});

describe("turnstile", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("requires a token and checks Cloudflare's answer", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    expect(await verifyTurnstile("", undefined)).toMatchObject({ ok: false });
    const pass = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));
    expect(await verifyTurnstile("tok", "1.2.3.4", pass)).toEqual({ ok: true });
    const body = pass.mock.calls[0]![1].body as URLSearchParams;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("remoteip")).toBe("1.2.3.4");
    const fail = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false })));
    expect(await verifyTurnstile("tok", undefined, fail)).toMatchObject({ ok: false });
    const down = vi.fn().mockRejectedValue(new Error("network"));
    expect(await verifyTurnstile("tok", undefined, down)).toMatchObject({ ok: false });
  });
});

describe("helpers", () => {
  it("clientIp takes the first forwarded hop", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers())).toBe("unknown");
  });
  it("zodFieldErrors maps the first message per field", () => {
    const r = contactSchema.safeParse({ name: "", email: "x", message: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(zodFieldErrors(r.error))).toEqual(["name", "email", "message"]);
  });
});
