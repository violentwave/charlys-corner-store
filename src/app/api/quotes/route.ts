import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { QuoteCustomerEmail } from "@/emails/quote-customer";
import { QuoteOwnerEmail } from "@/emails/quote-owner";
import { zodFieldErrors } from "@/lib/action-result";
import { ARTWORK_MAX_BYTES, checkArtwork } from "@/lib/artwork";
import { getDb, schema } from "@/lib/db";
import { BodyTooLargeError, clip, fileParts, readFormDataLimited } from "@/lib/http";
import { upsertLead } from "@/lib/leads";
import { confirmCustomer, notifyOwner } from "@/lib/notify";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { quoteSchema } from "@/lib/schemas";
import { buildObjectKey, getStorage } from "@/lib/storage";
import { verifyTurnstile } from "@/lib/turnstile";

const MAX_FILES = 3;
const MAX_TOTAL_BYTES = ARTWORK_MAX_BYTES * 2;
const MAX_REQUEST_BYTES = MAX_TOTAL_BYTES + 1024 * 1024;

const fail = (error: string, status: number, fieldErrors?: Record<string, string>) =>
  NextResponse.json({ ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) }, { status });

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await readFormDataLimited(request, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return fail("Artwork must be 40 MB or less in total.", 413);
    return fail("Invalid request.", 400);
  }

  const raw: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") raw[key] = value;

  if (typeof raw.website === "string" && raw.website.trim() !== "") {
    return NextResponse.json({ ok: true, message: "Thanks! We'll be in touch." });
  }

  const parsed = quoteSchema.safeParse(raw);
  if (!parsed.success) return fail("Please fix the highlighted fields.", 400, zodFieldErrors(parsed.error));
  const data = parsed.data;

  const files = fileParts(form, "files");
  if (files.length > MAX_FILES) return fail(`Please attach at most ${MAX_FILES} files.`, 400);

  const ip = clientIp(await headers());
  const token = await verifyTurnstile(typeof raw.turnstileToken === "string" ? raw.turnstileToken : null, ip);
  if (!token.ok) return fail(token.error, 400);

  const db = getDb();
  const rl = await rateLimit(db, { key: `quote:${ip}`, ...LIMITS.quote });
  if (!rl.ok) return fail("Too many quote requests — please try again in a bit or email us.", 429);

  // Validate EVERY file before storing ANY, so a bad file never leaves orphans behind.
  const checked: { name: string; bytes: Uint8Array; contentType: string }[] = [];
  let total = 0;
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    total += bytes.byteLength;
    if (total > MAX_TOTAL_BYTES) return fail("Artwork must be 40 MB or less in total.", 400);
    const check = checkArtwork(bytes);
    if (!check.ok) return fail(`${clip(file.name, 60)}: ${check.error}`, 400, { files: check.error });
    checked.push({ name: file.name, bytes, contentType: check.contentType });
  }

  const storage = getStorage();
  const stored: { key: string; name: string; contentType: string; size: number }[] = [];
  const cleanup = () => Promise.all(stored.map((f) => storage.delete(f.key).catch(() => {})));
  try {
    for (const f of checked) {
      const key = buildObjectKey("quotes", f.name);
      await storage.put(key, f.bytes, f.contentType);
      stored.push({ key, name: clip(f.name, 120), contentType: f.contentType, size: f.bytes.byteLength });
    }
  } catch {
    await cleanup();
    return fail("We couldn't store your artwork. Please email it to us instead.", 502);
  }

  let quoteId: string;
  let leadId: string;
  try {
    leadId = await upsertLead(db, { email: data.email, name: data.name, phone: data.phone });
    const [row] = await db
      .insert(schema.quotes)
      .values({
        leadId,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        company: data.company || null,
        items: data.items,
        quantity: data.quantity ?? null,
        neededBy: data.neededBy || null,
        notes: data.notes || null,
        artworkKeys: stored.map((f) => f.key),
      })
      .returning({ id: schema.quotes.id });
    quoteId = row!.id;
  } catch {
    await cleanup();
    console.error("quote insert failed");
    return fail("Something went wrong on our end. Please try again or email us.", 500);
  }

  const filesForOwner = await Promise.all(
    stored.map(async (f) => ({
      ...f,
      signedUrl: await storage.signedUrl(f.key).catch(() => `(link unavailable; storage key ${f.key})`),
    })),
  );
  await notifyOwner(`Quote request from ${data.name}`, QuoteOwnerEmail({ ...data, files: filesForOwner }), data.email, {
    quoteId,
    leadId,
  });
  await confirmCustomer(
    db,
    data.email,
    "We got your quote request 🐾",
    QuoteCustomerEmail({ name: clip(data.name, 40) }),
    {
      quoteId,
      leadId,
    },
  );

  return NextResponse.json({ ok: true, message: `Thanks, ${clip(data.name, 40)}! We'll reply to ${data.email}.` });
}
