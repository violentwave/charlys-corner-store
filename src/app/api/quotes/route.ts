import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { render } from "@react-email/components";

import { getDb, schema } from "@/lib/db";
import { upsertLead } from "@/lib/leads";
import { sendEmail, ownerInbox } from "@/lib/email";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit, clientIp, LIMITS } from "@/lib/rate-limit";
import { zodFieldErrors } from "@/lib/action-result";
import { quoteSchema } from "@/lib/schemas";
import { checkArtwork, ARTWORK_MAX_BYTES } from "@/lib/artwork";
import { getStorage, buildObjectKey } from "@/lib/storage";
import { QuoteOwnerEmail } from "@/emails/quote-owner";
import { QuoteCustomerEmail } from "@/emails/quote-customer";

const MAX_FILES = 3;
const MAX_TOTAL_BYTES = ARTWORK_MAX_BYTES * 2;
const MAX_REQUEST_BYTES = MAX_TOTAL_BYTES + 1024 * 1024;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ ok: false, error: "Artwork must be 40 MB or less in total." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const raw: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") raw[key] = value;
  }

  if (typeof raw.website === "string" && raw.website.trim() !== "") {
    return NextResponse.json({ ok: true, message: "Thanks! We'll be in touch." });
  }

  const parsed = quoteSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Please fix the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length > MAX_FILES) {
    return NextResponse.json({ ok: false, error: `Please attach at most ${MAX_FILES} files.` }, { status: 400 });
  }

  const headerList = await headers();
  const ip = clientIp(headerList);
  const tokenCheck = await verifyTurnstile(typeof raw.turnstileToken === "string" ? raw.turnstileToken : null, ip);
  if (!tokenCheck.ok) {
    return NextResponse.json({ ok: false, error: tokenCheck.error }, { status: 400 });
  }

  const db = getDb();
  const rl = await rateLimit(db, { key: `quote:${ip}`, ...LIMITS.quote });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many quote requests — please try again in a bit or email us." },
      { status: 429 },
    );
  }

  const prepared: { key: string; name: string; contentType: string; size: number; signedUrl: string }[] = [];
  let total = 0;
  try {
    const storage = getStorage();
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      total += bytes.byteLength;
      if (total > MAX_TOTAL_BYTES) {
        return NextResponse.json({ ok: false, error: "Artwork must be 40 MB or less in total." }, { status: 400 });
      }
      const check = checkArtwork(bytes);
      if (!check.ok) {
        return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
      }
      const key = buildObjectKey("quotes", file.name);
      await storage.put(key, bytes, check.contentType);
      prepared.push({
        key,
        name: file.name,
        contentType: check.contentType,
        size: bytes.byteLength,
        signedUrl: await storage.signedUrl(key),
      });
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "We couldn't store your artwork. Please email it to us instead." },
      { status: 502 },
    );
  }

  const leadId = await upsertLead(db, { email: data.email, name: data.name, phone: data.phone });
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
      artworkKeys: prepared.map((p) => p.key),
    })
    .returning({ id: schema.quotes.id });

  try {
    const ownerProps = { ...data, files: prepared.map(({ signedUrl, ...rest }) => ({ ...rest, signedUrl })) };
    await sendEmail({
      to: ownerInbox(),
      subject: `Quote request from ${data.name}`,
      html: await render(QuoteOwnerEmail(ownerProps), { plainText: false }),
      text: await render(QuoteOwnerEmail(ownerProps), { plainText: true }),
      replyTo: data.email,
    });
    await sendEmail({
      to: data.email,
      subject: "We got your quote request 🐾",
      html: await render(QuoteCustomerEmail({ name: data.name }), { plainText: false }),
      text: await render(QuoteCustomerEmail({ name: data.name }), { plainText: true }),
    });
  } catch {
    console.error("quote email failed", { quoteId: row.id, leadId });
  }

  return NextResponse.json({ ok: true, message: `Thanks, ${data.name}! We'll reply to ${data.email}.` });
}
