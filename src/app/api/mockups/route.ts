import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { MockupCustomerEmail } from "@/emails/mockup-customer";
import { MockupOwnerEmail } from "@/emails/mockup-owner";
import { OrderRequestCustomerEmail } from "@/emails/order-request-customer";
import { isSameOrigin } from "@/lib/auth/origin";
import { verifiedUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { clip } from "@/lib/http";
import { upsertLead } from "@/lib/leads";
import { describeLayers, mockupSummary } from "@/lib/mockup-summary";
import { ownerStageLinks, ownerQuoteUrl } from "@/lib/order-stage";
import { MOCKUP_FILES_RETENTION_DAYS, mockupStoragePrefix } from "@/lib/retention";
import { VIEW_LABELS } from "@/lib/garments";
import type { MockupArtworkRecord } from "@/lib/mockup-schema";
import { parseMockupUpload } from "@/lib/mockup-upload";
import { notifyOwner, sendAccountEmail } from "@/lib/notify";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { buildObjectKey, getStorage } from "@/lib/storage";

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

  const upload = await parseMockupUpload(request);
  if (!upload.ok) return upload.response;
  const { data, artworks, renders } = upload;

  const ip = clientIp(await headers());
  const ipLimit = await rateLimit(db, { key: `mockup:${ip}`, ...LIMITS.mockup });
  const userLimit = await rateLimit(db, { key: `mockup-user:${user.id}`, ...LIMITS.mockupEmail });
  if (!ipLimit.ok || !userLimit.ok) {
    return fail("Too many mockup requests — please try again in a bit or email us.", 429);
  }

  const storage = getStorage();
  const stored: { key: string; name: string; contentType: string; size: number }[] = [];
  const cleanup = () => Promise.all(stored.map((f) => storage.delete(f.key).catch(() => {})));
  const artworkRecords: MockupArtworkRecord[] = [];
  const keysByView = new Map<string, string>();
  try {
    for (const art of artworks) {
      const key = buildObjectKey(mockupStoragePrefix(data.intent === "order" ? "order" : "mockup"), art.file.name);
      await storage.put(key, art.bytes, art.contentType);
      const record = { key, name: clip(art.file.name, 120), contentType: art.contentType, size: art.bytes.byteLength };
      stored.push(record);
      artworkRecords.push(record);
    }
    for (const render of renders) {
      const key = buildObjectKey(
        mockupStoragePrefix(data.intent === "order" ? "order" : "mockup"),
        `mockup-${render.view}.png`,
      );
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
    // No coupon here (Logan, 2026-11-26): the 15% code is created and emailed when the
    // customer's first order is paid (src/lib/payments.ts markOrderPaid).
    // An order request from the builder is a one-design order; both rows share one id so the
    // "order #" in every email and link is the same.
    const id = randomUUID();
    const row = await db.transaction(async (tx) => {
      if (data.intent === "order") {
        await tx.insert(schema.orders).values({ id, leadId, userId: user.id, notes: data.notes || null });
      }
      const [inserted] = await tx
        .insert(schema.mockups)
        .values({
          id,
          orderId: data.intent === "order" ? id : null,
          userId: user.id,
          leadId,
          garment: data.garment,
          colors: data.colors,
          views: data.views.map((entry) => ({ ...entry, mockupKey: keysByView.get(entry.view)! })),
          sizes: data.sizes,
          notes: data.notes || null,
          kind: data.intent === "order" ? "order" : "mockup",
          artworks: artworkRecords,
          artworkKey: artworkRecords[0]?.key ?? null,
          artworkName: artworkRecords[0]?.name ?? null,
          artworkContentType: artworkRecords[0]?.contentType ?? null,
          artworkSizeBytes: artworkRecords[0]?.size ?? null,
        })
        .returning({ id: schema.mockups.id });
      return inserted;
    });
    mockupId = row!.id;
  } catch {
    await cleanup();
    console.error("mockup insert failed");
    return fail("Something went wrong on our end. Please try again or email us.", 500);
  }

  // Row is stored; emails are best-effort from here (row first, email second).
  const artworkLinks = await Promise.all(
    artworkRecords.map(async (a) => ({
      ...a,
      signedUrl: await storage.signedUrl(a.key).catch(() => `(link unavailable; storage key ${a.key})`),
      usedOn: data.views
        .filter((v) => v.layers.some((l) => l.type === "image" && artworkRecords[l.artwork] === a))
        .map((v) => VIEW_LABELS[v.view]),
    })),
  );
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
      layers: data.views.map((v) => ({ view: VIEW_LABELS[v.view], items: describeLayers(v.layers) })),
      sizes: sizeRows,
      notes: data.notes ? clip(data.notes, 2000) : undefined,
      kind: data.intent === "order" ? "order" : "mockup",
      artworks: artworkLinks,
      mockups: mockupUrls,
      filesKeptDays: data.intent === "order" ? undefined : MOCKUP_FILES_RETENTION_DAYS,
      stageLinks: data.intent === "order" ? ownerStageLinks(mockupId) : undefined,
      quoteUrl: data.intent === "order" ? ownerQuoteUrl(mockupId) : undefined,
    }),
    user.email,
    { mockupId, leadId },
  );

  if (data.intent === "order") {
    // Order request: the price comes later, so the confirmation says so.
    await sendAccountEmail(
      user.email,
      "We got your order request 🐾",
      OrderRequestCustomerEmail({
        name: user.name ? clip(user.name, 40) : "there",
        garmentName: garment.name,
        colors: colorRows,
        views: viewRows,
        sizes: sizeRows,
        mockupId,
      }),
    );
  } else {
    await sendAccountEmail(
      user.email,
      "Your Charly's mockup is ready 🐾",
      MockupCustomerEmail({
        name: user.name ? clip(user.name, 40) : "there",
        garmentName: garment.name,
        colors: colorRows,
        views: viewRows,
        mockups: mockupUrls,
        mockupId,
      }),
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
    mockups,
  });
}
