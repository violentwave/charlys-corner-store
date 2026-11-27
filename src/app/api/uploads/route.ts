import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { OrderFormOwnerEmail } from "@/emails/order-form-owner";
import { OrderFormCustomerEmail } from "@/emails/order-form-customer";
import { zodFieldErrors } from "@/lib/action-result";
import { ARTWORK_MAX_BYTES, checkArtwork } from "@/lib/artwork";
import { currentUser } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { BodyTooLargeError, clip, fileParts, readFormDataLimited } from "@/lib/http";
import { upsertLead } from "@/lib/leads";
import { confirmCustomer, notifyOwner } from "@/lib/notify";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { orderFormSchema } from "@/lib/schemas";
import { buildObjectKey, getStorage } from "@/lib/storage";
import { verifyTurnstile } from "@/lib/turnstile";

const MAX_REQUEST_BYTES = 5 * ARTWORK_MAX_BYTES + 1024 * 1024;

const fail = (error: string, status: number, fieldErrors?: Record<string, string>) =>
  NextResponse.json({ ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) }, { status });

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await readFormDataLimited(request, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return fail("Files must be 20 MB or smaller.", 413);
    return fail("Invalid submission.", 400);
  }

  const raw: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") raw[key] = value;
  // arrays arrive as JSON strings
  for (const k of ["items", "printLocations", "sizes"]) {
    if (typeof raw[k] === "string") {
      try {
        raw[k] = JSON.parse(raw[k] as string);
      } catch {
        /* keep as-is */
      }
    }
  }
  if (typeof raw.sizes === "string") {
    try {
      raw.sizes = JSON.parse(raw.sizes);
    } catch {
      raw.sizes = {};
    }
  }

  if (typeof raw.website === "string" && raw.website.trim() !== "") {
    return NextResponse.json({ ok: true, message: "Thanks! We got your order." });
  }

  const parsed = orderFormSchema.safeParse(raw);
  if (!parsed.success) return fail("Please fix the highlighted fields.", 400, zodFieldErrors(parsed.error));
  const data = parsed.data;

  const files = fileParts(form, "files");
  if (files.length > 5) return fail("You can attach at most 5 files.", 400);

  const ip = clientIp(await headers());
  const token = await verifyTurnstile(typeof raw.turnstileToken === "string" ? raw.turnstileToken : null, ip);
  if (!token.ok) return fail(token.error, 400);

  const db = getDb();
  const rl = await rateLimit(db, { key: `upload:${ip}`, ...LIMITS.upload });
  if (!rl.ok) return fail("Too many submissions — please try again in a bit.", 429);

  // Validate every file before storing any.
  const checked: { bytes: Uint8Array; contentType: string; name: string }[] = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const check = checkArtwork(bytes);
    if (!check.ok) return fail(check.error, 400, { files: check.error });
    checked.push({ bytes, contentType: check.contentType, name: clip(f.name, 120) });
  }
  const totalBytes = checked.reduce((s, c) => s + c.bytes.byteLength, 0);
  if (totalBytes > 30 * 1024 * 1024) return fail("Total upload size must be 30 MB or smaller.", 400);

  const storage = getStorage();
  const stored: { key: string; name: string; contentType: string; size: number }[] = [];
  try {
    for (const c of checked) {
      const key = buildObjectKey("uploads", c.name);
      await storage.put(key, c.bytes, c.contentType);
      stored.push({ key, name: c.name, contentType: c.contentType, size: c.bytes.byteLength });
    }
  } catch {
    await Promise.all(stored.map((s) => storage.delete(s.key).catch(() => {})));
    return fail("We couldn't store your files. Please email them to us instead.", 502);
  }

  const user = await currentUser(db).catch(() => null);

  let uploadId: string;
  let leadId: string;
  try {
    const name = `${data.firstName} ${data.lastName ?? ""}`.trim();
    leadId = await upsertLead(db, { email: data.email, name, phone: data.phone || null, referralSource: data.referralSource, referralOther: data.referralOther, marketingOptIn: data.marketingOptIn });
    const address = data.fulfillment === "ship" ? { street: data.street, unit: data.unit, city: data.city, state: data.state, zip: data.zip } : null;
    const [row] = await db
      .insert(schema.uploads)
      .values({
        leadId,
        userId: user?.id ?? null,
        orderType: data.orderType,
        firstName: data.firstName,
        lastName: data.lastName || null,
        email: data.email,
        phone: data.phone || null,
        company: data.company || null,
        orderNumber: data.orderNumber || null,
        fulfillment: data.fulfillment || null,
        address,
        items: data.items ?? [],
        colors: data.colors || null,
        printMethod: data.printMethod || null,
        printLocations: data.printLocations ?? [],
        sizes: data.sizes ?? {},
        neededBy: data.neededBy || null,
        files: stored,
        // legacy single-file columns for the first file (back-compat)
        fileKey: stored[0]?.key ?? null,
        fileName: stored[0]?.name ?? null,
        contentType: stored[0]?.contentType ?? null,
        sizeBytes: stored[0]?.size ?? null,
        notes: data.notes || null,
        referralSource: data.referralSource,
        referralOther: data.referralOther,
        marketingOptIn: data.marketingOptIn ?? false,
      })
      .returning({ id: schema.uploads.id });
    uploadId = row!.id;
  } catch (err) {
    await Promise.all(stored.map((s) => storage.delete(s.key).catch(() => {})));
    console.error("order form insert failed", err);
    return fail("Something went wrong on our end. Please try again or email us your files.", 500);
  }

  const signedFiles = await Promise.all(
    stored.map(async (f) => ({ ...f, signedUrl: (await storage.signedUrl(f.key).catch(() => null)) ?? `(link unavailable; storage key ${f.key})` })),
  );

  await notifyOwner(
    data.orderType === "existing" ? `ARTWORK for order #${data.orderNumber || "—"}: ${data.firstName} · ${data.email}` : `NEW ORDER (form): ${data.firstName} · ${data.email}`,
    OrderFormOwnerEmail({
      orderType: data.orderType,
      firstName: data.firstName,
      lastName: data.lastName || null,
      email: data.email,
      phone: data.phone || null,
      company: data.company || null,
      orderNumber: data.orderNumber || null,
      fulfillment: data.fulfillment || null,
      address: data.fulfillment === "ship" ? { street: data.street, unit: data.unit, city: data.city, state: data.state, zip: data.zip } : null,
      items: data.items ?? [],
      otherItem: data.otherItem ?? false,
      colors: data.colors || null,
      printMethod: data.printMethod || null,
      printLocations: data.printLocations ?? [],
      sizes: (data.sizes ?? {}) as Record<string, number>,
      neededBy: data.neededBy || null,
      notes: data.notes || null,
      files: signedFiles,
      referralSource: data.referralSource,
      referralOther: data.referralOther,
      marketingOptIn: data.marketingOptIn ?? false,
    }),
    data.email,
    { uploadId, leadId },
  );
  await confirmCustomer(
    db,
    data.email,
    "We got your order 🐾",
    OrderFormCustomerEmail({ firstName: clip(data.firstName, 40), fileCount: stored.length, orderType: data.orderType }),
    { uploadId, leadId },
  );

  return NextResponse.json({
    ok: true,
    message: `Got it! We'll be in touch soon.`,
  });
}
