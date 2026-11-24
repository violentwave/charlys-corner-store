"use server";

import { headers } from "next/headers";
import { render } from "@react-email/components";

import { getDb, schema } from "@/lib/db";
import { upsertLead } from "@/lib/leads";
import { sendEmail, ownerInbox } from "@/lib/email";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit, clientIp, LIMITS } from "@/lib/rate-limit";
import { zodFieldErrors } from "@/lib/action-result";
import { contactSchema } from "@/lib/schemas";
import { ContactOwnerEmail } from "@/emails/contact-owner";
import { ContactCustomerEmail } from "@/emails/contact-customer";
import type { ActionResult } from "@/lib/action-result";

export async function submitContact(
  input: unknown,
  sourcePage: "about" | "contact",
  turnstileToken?: string | null,
): Promise<ActionResult> {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  // Honeypot: a filled hidden field means a bot. Pretend success, store nothing.
  if (typeof raw.website === "string" && raw.website.trim() !== "") {
    return { ok: true, message: "Thanks! We'll be in touch." };
  }

  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) };
  }
  const data = parsed.data;

  const headerList = await headers();
  const ip = clientIp(headerList);

  const tokenCheck = await verifyTurnstile(turnstileToken, ip);
  if (!tokenCheck.ok) {
    return { ok: false, error: tokenCheck.error };
  }

  const db = getDb();
  const rl = await rateLimit(db, { key: `contact:${ip}`, ...LIMITS.contact });
  if (!rl.ok) {
    return { ok: false, error: "Too many messages — please try again in a bit or email us." };
  }

  const leadId = await upsertLead(db, {
    email: data.email,
    name: data.name,
    phone: data.phone || null,
    referralSource: data.referralSource ?? null,
    referralOther: data.referralOther ?? null,
  });

  const [row] = await db
    .insert(schema.contactMessages)
    .values({
      leadId,
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      message: data.message,
      referralSource: data.referralSource ?? null,
      referralOther: data.referralOther ?? null,
      sourcePage,
    })
    .returning({ id: schema.contactMessages.id });

  // Store row first; email second. Email failures must not lose the submission.
  try {
    const ownerHtml = await render(
      ContactOwnerEmail({
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        message: data.message,
        sourcePage,
        referralSource: data.referralSource ?? null,
        referralOther: data.referralOther ?? null,
      }),
      { plainText: false },
    );
    const ownerText = await render(
      ContactOwnerEmail({
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        message: data.message,
        sourcePage,
        referralSource: data.referralSource ?? null,
        referralOther: data.referralOther ?? null,
      }),
      { plainText: true },
    );
    await sendEmail({
      to: ownerInbox(),
      subject: `New message from ${data.name} (${sourcePage})`,
      html: ownerHtml,
      text: ownerText,
      replyTo: data.email,
    });

    const customerHtml = await render(ContactCustomerEmail({ name: data.name, message: data.message }), {
      plainText: false,
    });
    const customerText = await render(ContactCustomerEmail({ name: data.name, message: data.message }), {
      plainText: true,
    });
    await sendEmail({
      to: data.email,
      subject: "We got your message 🐾",
      html: customerHtml,
      text: customerText,
    });
  } catch {
    console.error("contact email failed", { contactId: row.id, leadId });
  }

  return { ok: true, message: `Thanks, ${data.name}! We'll reply to ${data.email}.` };
}
