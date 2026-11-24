import "server-only";

import { render } from "@react-email/components";
import type { ReactElement } from "react";

import type { Db } from "./db";
import { ownerInbox, sendEmail } from "./email";
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
export async function confirmCustomer(db: Db, to: string, subject: string, email: ReactElement, logContext: object) {
  try {
    const cap = await rateLimit(db, { key: `confirm:${to.trim().toLowerCase()}`, ...LIMITS.confirmation });
    if (!cap.ok) return;
    const res = await sendEmail({ to, subject: oneLine(subject), ...(await renderBoth(email)) });
    if (!res.ok) console.error("customer email failed", logContext);
  } catch {
    console.error("customer email failed", logContext);
  }
}

function oneLine(s: string) {
  return s.replace(/[\r\n\t]+/g, " ").slice(0, 200);
}
