import "server-only";

import { render } from "@react-email/components";
import type { ReactElement } from "react";

import type { Db } from "./db";
import { ownerInbox, sendEmail, type EmailMessage } from "./email";
import { LIMITS, rateLimit } from "./rate-limit";

async function renderBoth(email: ReactElement) {
  return { html: await render(email), text: await render(email, { plainText: true }) };
}

/** Owner notification. Never throws: the submission is already stored (row first, email second). */
export async function notifyOwner(subject: string, email: ReactElement, replyTo: string, logContext: object) {
  try {
    const res = await sendEmail({ to: ownerInbox(), subject: oneLine(subject), ...(await renderBoth(email)), replyTo });
    if (!res.ok) console.error("owner email failed", logContext);
  } catch {
    console.error("owner email failed", logContext);
  }
}

/**
 * Customer confirmation, capped per recipient (LIMITS.confirmation) so the forms can't be used
 * to send mail to arbitrary addresses. Templates must not echo free text the visitor typed.
 */
export async function confirmCustomer(
  db: Db,
  to: string,
  subject: string,
  email: ReactElement,
  logContext: object,
  attachments?: EmailMessage["attachments"],
) {
  try {
    const cap = await rateLimit(db, { key: `confirm:${to.trim().toLowerCase()}`, ...LIMITS.confirmation });
    if (!cap.ok) return;
    const res = await sendEmail({ to, subject: oneLine(subject), ...(await renderBoth(email)), attachments });
    if (!res.ok) console.error("customer email failed", logContext);
  } catch {
    console.error("customer email failed", logContext);
  }
}

function oneLine(s: string) {
  return s.replace(/[\r\n\t]+/g, " ").slice(0, 200);
}

/**
 * Emails to a signed-in member's own verified address (codes, reset links, their mockups and
 * orders). Rate-limited by the calling route, not by the confirmation cap (that cap stops the
 * public forms from mailing strangers). Returns whether it sent.
 */
export async function sendAccountEmail(
  to: string,
  subject: string,
  email: ReactElement,
  attachments?: EmailMessage["attachments"],
): Promise<boolean> {
  try {
    const res = await sendEmail({ to, subject: oneLine(subject), ...(await renderBoth(email)), attachments });
    if (!res.ok) console.error("account email failed");
    return res.ok;
  } catch {
    console.error("account email failed");
    return false;
  }
}
