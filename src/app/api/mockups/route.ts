import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { MockupCustomerEmail } from "@/emails/mockup-customer";
import { MockupOwnerEmail } from "@/emails/mockup-owner";
import { OrderRequestCustomerEmail } from "@/emails/order-request-customer";
import { zodFieldErrors } from "@/lib/action-result";
import { isSameOrigin } from "@/lib/auth/origin";
import { verifiedUser } from "@/lib/auth/session";
import { ARTWORK_MAX_BYTES, checkArtwork } from "@/lib/artwork";
import { getDb, schema } from "@/lib/db";
import { clip, BodyTooLargeError, readFormDataLimited } from "@/lib/http";
import { issueCoupon } from "@/lib/coupon-store";
import { upsertLead } from "@/lib/leads";
import { mockupSummary } from "@/lib/mockup-summary";
import { MOCKUP_ARTWORK_KINDS, MOCKUP_RENDER_MAX_BYTES, mockupPayloadSchema } from "@/lib/mockup-schema";
import { confirmCustomer, notifyOwner } from "@/lib/notify";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { buildObjectKey, getStorage } from "@/lib/storage";

/** Original artwork (≤ 20 MB) + up to 2 rendered mockups (≤ 8 MB each) + form overhead. */
const MAX_REQUEST_BYTES = ARTWORK_MAX_BYTES + 2 * MOCKUP_RENDER_MAX_BYTES + 1024 * 1024;

/** Rendered mockups are exported at template size; anything far larger is not ours. */
const MAX_RENDER_PX = 4096;

/** Width/height from a PNG's IHDR chunk (bytes 16–23, big-endian). Caller has checked the signature. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.byteLength < 24) return { width: 0, height: 0 };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const fail = (error: string, status: number, fieldErrors?: Record<string, string>) =>
  NextResponse.json({ ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) }, { status });

export async function POST(request: Request) {
  // Cookie-authenticated POST: refuse cross-site requests (CSRF), like the /api/auth routes.
  if (!isSameOrigin(request)) return fail("Invalid request.", 403);
  // v2: an account with a verified email is required before anything is sent (docs/04 Flow).
  const db = getDb();
  const auth = await verifiedUser(db);
  if (!auth.ok) return fail(auth.error, auth.status);
  const user = auth.user;

  let form: FormData;
  try {
    form = await readFormDataLimited(request, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return fail("That upload is too large — artwork and mockups together must be 37 MB or less.", 413);
    }
    return fail("Invalid request.", 400);
  }

  const raw: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") raw[key] = value;

  if (typeof raw.website === "string" && raw.website.trim() !== "") {
    return NextResponse.json({ ok: true, message: "Thanks! We'll be in touch." });
  }

  let json: unknown;
  if (typeof raw.payload !== "string") return fail("Invalid request.", 400);
  try {
    json = JSON.parse(raw.payload);
  } catch {
    return fail("Invalid request.", 400);
  }
  const parsed = mockupPayloadSchema.safeParse(json);
  if (!parsed.success) return fail("Please fix the highlighted fields.", 400, zodFieldErrors(parsed.error));
  const data = parsed.data;

  // Exactly one artwork file.
  const artworkParts = [...form.entries()].filter(
    ([key, value]) => key === "artwork" && value instanceof File && (value.size > 0 || value.name !== ""),
  );
  if (artworkParts.length !== 1) return fail("Please attach your artwork file.", 400);
  const artworkFile = artworkParts[0]![1] as File;

  // Exactly one mockup-<view> per listed view, and no others (field name is the source of truth,
  // never the browser-supplied file name).
  const wanted = new Set(data.views.map((v) => `mockup-${v.view}`));
  const renderParts = [...form.entries()].filter(
    ([key, value]) => key.startsWith("mockup-") && value instanceof File && (value.size > 0 || value.name !== ""),
  ) as [string, File][];
  const counts = new Map<string, number>();
  for (const [key] of renderParts) counts.set(key, (counts.get(key) ?? 0) + 1);
  const badFiles =
    renderParts.length !== wanted.size ||
    [...wanted].some((key) => counts.get(key) !== 1) ||
    [...counts.keys()].some((key) => !wanted.has(key));
  if (badFiles) {
    return fail("We couldn't match your rendered mockups to your design. Please try submitting again.", 400);
  }

  // Validate EVERY file before storing ANY, so a bad file never leaves orphans behind.
  const artworkBytes = new Uint8Array(await artworkFile.arrayBuffer());
  const artworkCheck = checkArtwork(artworkBytes);
  const kindOk = artworkCheck.ok && (MOCKUP_ARTWORK_KINDS as readonly string[]).includes(artworkCheck.kind);
  if (!kindOk) {
    return fail("That artwork type won't render on the mockup. Please use PNG, JPG, WEBP, or SVG.", 400, {
      artwork: artworkCheck.ok ? "That file type won't render on the mockup." : artworkCheck.error,
    });
  }

  const renders: { view: string; bytes: Uint8Array }[] = [];
  for (const [key, file] of renderParts) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MOCKUP_RENDER_MAX_BYTES) {
      return fail("Your rendered mockup came out too large. Please try again.", 400);
    }
    const check = checkArtwork(bytes);
    if (!check.ok || check.kind !== "png") {
      return fail("Something went wrong rendering your mockup. Please try again.", 400);
    }
    // Renders are template-sized (1000 px wide); refuse oversized dimensions so a tiny,
    // highly compressed PNG can't decompress into a huge image in someone's mail client.
    const { width, height } = pngSize(bytes);
    if (width < 1 || height < 1 || width > MAX_RENDER_PX || height > MAX_RENDER_PX) {
      return fail("Something went wrong rendering your mockup. Please try again.", 400);
    }
    renders.push({ view: key.slice("mockup-".length), bytes });
  }

  const ip = clientIp(await headers());
  const ipLimit = await rateLimit(db, { key: `mockup:${ip}`, ...LIMITS.mockup });
  const userLimit = await rateLimit(db, { key: `mockup-user:${user.id}`, ...LIMITS.mockupEmail });
  if (!ipLimit.ok || !userLimit.ok) {
    return fail("Too many mockup requests — please try again in a bit or email us.", 429);
  }

  const storage = getStorage();
  const stored: { key: string; name: string; contentType: string; size: number }[] = [];
  const cleanup = () => Promise.all(stored.map((f) => storage.delete(f.key).catch(() => {})));
  let artworkKey: string;
  const keysByView = new Map<string, string>();
  try {
    artworkKey = buildObjectKey("mockups", artworkFile.name);
    await storage.put(artworkKey, artworkBytes, artworkCheck.contentType);
    stored.push({
      key: artworkKey,
      name: clip(artworkFile.name, 120),
      contentType: artworkCheck.contentType,
      size: artworkBytes.byteLength,
    });
    for (const render of renders) {
      const key = buildObjectKey("mockups", `mockup-${render.view}.png`);
      await storage.put(key, render.bytes, "image/png");
      stored.push({ key, name: `mockup-${render.view}.png`, contentType: "image/png", size: render.bytes.byteLength });
      keysByView.set(render.view, key);
    }
  } catch {
    await cleanup();
    return fail("We couldn't store your files. Please try again or email us.", 502);
  }

  const { garment, colorRows, viewRows, sizeRows } = mockupSummary(data.garment, data.colors, data.views, data.sizes);

  let mockupId: string;
  let leadId: string;
  let coupon: Awaited<ReturnType<typeof issueCoupon>>;
  try {
    // Identity comes from the account; the builder's referral answer + opt-in update the lead
    // (upsertLead never erases existing values with empty ones).
    leadId = await upsertLead(db, {
      email: user.email,
      name: user.name,
      referralSource: data.referralSource ?? null,
      referralOther: data.referralOther || null,
      marketingOptIn: data.marketingOptIn,
    });
    coupon = await issueCoupon(db, leadId);
    const [row] = await db
      .insert(schema.mockups)
      .values({
        userId: user.id,
        leadId,
        couponId: coupon.id,
        garment: data.garment,
        colors: data.colors,
        views: data.views.map((entry) => ({ ...entry, mockupKey: keysByView.get(entry.view)! })),
        sizes: data.sizes,
        notes: data.notes || null,
        kind: data.intent === "order" ? "order" : "mockup",
        artworkKey,
        artworkName: clip(artworkFile.name, 120),
        artworkContentType: artworkCheck.contentType,
        artworkSizeBytes: artworkBytes.byteLength,
      })
      .returning({ id: schema.mockups.id });
    mockupId = row!.id;
  } catch {
    await cleanup();
    console.error("mockup insert failed");
    return fail("Something went wrong on our end. Please try again or email us.", 500);
  }

  // Row is stored; emails are best-effort from here (row first, email second).
  const artworkUrl = await storage.signedUrl(artworkKey).catch(() => `(link unavailable; storage key ${artworkKey})`);
  const mockupUrls = await Promise.all(
    data.views.map(async (entry, i) => ({
      view: viewRows[i]!.view,
      signedUrl: await storage
        .signedUrl(keysByView.get(entry.view)!)
        .catch(() => `(link unavailable; storage key ${keysByView.get(entry.view)})`),
    })),
  );
  const subject =
    data.intent === "order"
      ? `ORDER REQUEST: ${garment.name} · ${user.email}`
      : `New mockup lead: ${garment.name} · ${user.email}`;
  await notifyOwner(
    subject,
    MockupOwnerEmail({
      email: user.email,
      name: user.name ? clip(user.name, 100) : undefined,
      garmentName: garment.name,
      colors: colorRows,
      views: viewRows,
      sizes: sizeRows,
      notes: data.notes ? clip(data.notes, 2000) : undefined,
      couponCode: coupon.code,
      kind: data.intent === "order" ? "order" : "mockup",
      artwork: {
        name: clip(artworkFile.name, 120),
        contentType: artworkCheck.contentType,
        size: artworkBytes.byteLength,
        signedUrl: artworkUrl,
      },
      mockups: mockupUrls,
    }),
    user.email,
    { mockupId, leadId },
  );

  if (data.intent === "order") {
    // Order request: the price comes later, so the confirmation says so — plus the coupon.
    await confirmCustomer(
      db,
      user.email,
      "We got your order request 🐾",
      OrderRequestCustomerEmail({
        name: user.name ? clip(user.name, 40) : "there",
        garmentName: garment.name,
        colors: colorRows,
        views: viewRows,
        sizes: sizeRows,
        coupon: { code: coupon.code, expiresAt: coupon.expiresAt, isNew: coupon.isNew },
        mockupId,
      }),
      { mockupId, leadId },
    );
  } else {
    await confirmCustomer(
      db,
      user.email,
      "Your Charly's mockup is ready 🐾 + 15% off inside",
      MockupCustomerEmail({
        name: user.name ? clip(user.name, 40) : "there",
        garmentName: garment.name,
        colors: colorRows,
        views: viewRows,
        coupon: { code: coupon.code, expiresAt: coupon.expiresAt, isNew: coupon.isNew },
        mockups: mockupUrls,
        mockupId,
      }),
      { mockupId, leadId },
      // Attach the PNGs too: inline images use signed URLs that expire after 7 days.
      renders.map((r) => ({
        filename: `charlys-mockup-${data.garment}-${r.view}.png`,
        content: r.bytes,
        contentType: "image/png",
      })),
    );
  }

  // Fresh short-lived links for the success screen.
  const mockups = await Promise.all(
    data.views.map(async (entry) => ({
      view: entry.view,
      url: await storage
        .signedUrl(keysByView.get(entry.view)!, 60 * 60)
        .catch(() => `(link unavailable; storage key ${keysByView.get(entry.view)})`),
    })),
  );

  return NextResponse.json({
    ok: true,
    mockupId,
    coupon: { code: coupon.code, expiresAt: coupon.expiresAt, isNew: coupon.isNew },
    mockups,
  });
}
