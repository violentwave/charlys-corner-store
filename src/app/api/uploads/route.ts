import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { render } from "@react-email/components";

import { getDb, schema } from "@/lib/db";
import { upsertLead } from "@/lib/leads";
import { sendEmail, ownerInbox } from "@/lib/email";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit, clientIp, LIMITS } from "@/lib/rate-limit";
import { zodFieldErrors } from "@/lib/action-result";
import { uploadSchema } from "@/lib/schemas";
import { checkArtwork, ARTWORK_MAX_BYTES } from "@/lib/artwork";
import { getStorage, buildObjectKey } from "@/lib/storage";
import { ArtworkOwnerEmail } from "@/emails/artwork-owner";
import { ArtworkCustomerEmail } from "@/emails/artwork-customer";

const MAX_REQUEST_BYTES = ARTWORK_MAX_BYTES + 1024 * 1024;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ ok: false, error: "Files must be 20 MB or smaller." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid upload." }, { status: 400 });
  }

  const raw: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") raw[key] = value;
  }

  if (typeof raw.website === "string" && raw.website.trim() !== "") {
    return NextResponse.json({ ok: true, message: "Thanks! We attached your file." });
  }

  const parsed = uploadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Please fix the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Please choose a file." }, { status: 400 });
  }

  const headerList = await headers();
  const ip = clientIp(headerList);

  const tokenCheck = await verifyTurnstile(typeof raw.turnstileToken === "string" ? raw.turnstileToken : null, ip);
  if (!tokenCheck.ok) {
    return NextResponse.json({ ok: false, error: tokenCheck.error }, { status: 400 });
  }

  const db = getDb();
  const rl = await rateLimit(db, { key: `upload:${ip}`, ...LIMITS.upload });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many uploads — please try again in a bit or email us." },
      { status: 429 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkArtwork(bytes);
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
  }

  const key = buildObjectKey("uploads", file.name);
  let signedUrl: string;
  try {
    const storage = getStorage();
    await storage.put(key, bytes, check.contentType);
    signedUrl = await storage.signedUrl(key);
  } catch {
    return NextResponse.json(
      { ok: false, error: "We couldn't store your file. Please email it to us instead." },
      { status: 502 },
    );
  }

  const leadId = await upsertLead(db, { email: data.email, name: `${data.firstName} ${data.lastName}` });
  const [row] = await db
    .insert(schema.uploads)
    .values({
      leadId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      orderNumber: data.orderNumber,
      fileKey: key,
      fileName: file.name,
      contentType: check.contentType,
      sizeBytes: bytes.byteLength,
      notes: data.notes ?? null,
    })
    .returning({ id: schema.uploads.id });

  try {
    const ownerProps = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      orderNumber: data.orderNumber,
      notes: data.notes ?? null,
      fileName: file.name,
      sizeBytes: bytes.byteLength,
      contentType: check.contentType,
      signedUrl,
    };
    await sendEmail({
      to: ownerInbox(),
      subject: `Artwork for order ${data.orderNumber} from ${data.firstName} ${data.lastName}`,
      html: await render(ArtworkOwnerEmail(ownerProps), { plainText: false }),
      text: await render(ArtworkOwnerEmail(ownerProps), { plainText: true }),
      replyTo: data.email,
    });
    const customerProps = { firstName: data.firstName, fileName: file.name, orderNumber: data.orderNumber };
    await sendEmail({
      to: data.email,
      subject: "We got your artwork 🐾",
      html: await render(ArtworkCustomerEmail(customerProps), { plainText: false }),
      text: await render(ArtworkCustomerEmail(customerProps), { plainText: true }),
    });
  } catch {
    console.error("upload email failed", { uploadId: row.id, leadId });
  }

  return NextResponse.json({
    ok: true,
    message: `Got it! We attached ${file.name} to order ${data.orderNumber}.`,
  });
}
