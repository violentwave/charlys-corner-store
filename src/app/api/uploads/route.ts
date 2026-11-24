import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { ArtworkCustomerEmail } from "@/emails/artwork-customer";
import { ArtworkOwnerEmail } from "@/emails/artwork-owner";
import { zodFieldErrors } from "@/lib/action-result";
import { ARTWORK_MAX_BYTES, checkArtwork } from "@/lib/artwork";
import { getDb, schema } from "@/lib/db";
import { BodyTooLargeError, clip, fileParts, readFormDataLimited } from "@/lib/http";
import { upsertLead } from "@/lib/leads";
import { confirmCustomer, notifyOwner } from "@/lib/notify";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { uploadSchema } from "@/lib/schemas";
import { buildObjectKey, getStorage } from "@/lib/storage";
import { verifyTurnstile } from "@/lib/turnstile";

const MAX_REQUEST_BYTES = ARTWORK_MAX_BYTES + 1024 * 1024;

const fail = (error: string, status: number, fieldErrors?: Record<string, string>) =>
  NextResponse.json({ ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) }, { status });

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await readFormDataLimited(request, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return fail("Files must be 20 MB or smaller.", 413);
    return fail("Invalid upload.", 400);
  }

  const raw: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") raw[key] = value;

  // Honeypot: pretend success, store nothing.
  if (typeof raw.website === "string" && raw.website.trim() !== "") {
    return NextResponse.json({ ok: true, message: "Thanks! We attached your file." });
  }

  const parsed = uploadSchema.safeParse(raw);
  if (!parsed.success) return fail("Please fix the highlighted fields.", 400, zodFieldErrors(parsed.error));
  const data = parsed.data;

  const [file, ...extra] = fileParts(form, "file");
  if (!file) return fail("Please choose a file.", 400, { file: "Please choose a file." });
  if (extra.length) return fail("Please upload one file at a time.", 400);

  const ip = clientIp(await headers());
  const token = await verifyTurnstile(typeof raw.turnstileToken === "string" ? raw.turnstileToken : null, ip);
  if (!token.ok) return fail(token.error, 400);

  const db = getDb();
  const rl = await rateLimit(db, { key: `upload:${ip}`, ...LIMITS.upload });
  if (!rl.ok) return fail("Too many uploads — please try again in a bit or email us.", 429);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkArtwork(bytes);
  if (!check.ok) return fail(check.error, 400, { file: check.error });

  const fileName = clip(file.name, 120);
  const storage = getStorage();
  const key = buildObjectKey("uploads", file.name);
  try {
    await storage.put(key, bytes, check.contentType);
  } catch {
    return fail("We couldn't store your file. Please email it to us instead.", 502);
  }

  let uploadId: string;
  let leadId: string;
  try {
    leadId = await upsertLead(db, { email: data.email, name: `${data.firstName} ${data.lastName}` });
    const [row] = await db
      .insert(schema.uploads)
      .values({
        leadId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        orderNumber: data.orderNumber,
        fileKey: key,
        fileName,
        contentType: check.contentType,
        sizeBytes: bytes.byteLength,
        notes: data.notes || null,
      })
      .returning({ id: schema.uploads.id });
    uploadId = row!.id;
  } catch {
    await storage.delete(key).catch(() => {}); // don't leave an orphaned file
    console.error("upload insert failed");
    return fail("Something went wrong on our end. Please try again or email us your file.", 500);
  }

  const signedUrl = await storage.signedUrl(key).catch(() => null);
  await notifyOwner(
    `Artwork for order ${data.orderNumber} from ${data.firstName} ${data.lastName}`,
    ArtworkOwnerEmail({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      orderNumber: data.orderNumber,
      notes: data.notes ?? null,
      fileName,
      sizeBytes: bytes.byteLength,
      contentType: check.contentType,
      signedUrl: signedUrl ?? `(link unavailable; storage key ${key})`,
    }),
    data.email,
    { uploadId, leadId },
  );
  await confirmCustomer(
    db,
    data.email,
    "We got your artwork 🐾",
    ArtworkCustomerEmail({ firstName: clip(data.firstName, 40), fileName: clip(fileName, 60), orderNumber: clip(data.orderNumber, 40) }),
    { uploadId, leadId },
  );

  return NextResponse.json({
    ok: true,
    message: `Got it! We attached ${clip(fileName, 60)} to order ${data.orderNumber}.`,
  });
}
