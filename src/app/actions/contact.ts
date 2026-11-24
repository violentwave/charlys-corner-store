"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { upsertLead } from "@/lib/leads";
import { clip } from "@/lib/http";
import { confirmCustomer, notifyOwner } from "@/lib/notify";
import { site } from "@/lib/site";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit, clientIp, LIMITS } from "@/lib/rate-limit";
import { zodFieldErrors } from "@/lib/action-result";
import { contactSchema } from "@/lib/schemas";
import { ContactOwnerEmail } from "@/emails/contact-owner";
import { ContactCustomerEmail } from "@/emails/contact-customer";
import type { ActionResult } from "@/lib/action-result";

const SOURCE_PAGES = z.enum(["about", "contact"]);

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

  // Server actions are public endpoints: TypeScript types aren't enforced at runtime.
  const page = SOURCE_PAGES.safeParse(sourcePage);
  if (!page.success) return { ok: false, error: "Invalid form." };

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

  let contactId: string;
  let leadId: string;
  try {
    leadId = await upsertLead(db, {
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
        sourcePage: page.data,
      })
      .returning({ id: schema.contactMessages.id });
    contactId = row!.id;
  } catch {
    console.error("contact insert failed");
    return {
      ok: false,
      error: `Something went wrong on our end. Please try again or email us at ${site.email.toLowerCase()}.`,
    };
  }

  // Row first, email second: email failures never lose the submission.
  await notifyOwner(
    `New message from ${data.name} (${page.data})`,
    ContactOwnerEmail({
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      message: data.message,
      sourcePage: page.data,
      referralSource: data.referralSource ?? null,
      referralOther: data.referralOther ?? null,
    }),
    data.email,
    { contactId, leadId },
  );
  await confirmCustomer(db, data.email, "We got your message 🐾", ContactCustomerEmail({ name: clip(data.name, 40) }), {
    contactId,
    leadId,
  });

  return { ok: true, message: `Thanks, ${clip(data.name, 40)}! We'll reply to ${data.email}.` };
}
