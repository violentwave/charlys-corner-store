import "server-only";

import { Resend } from "resend";

/**
 * Outbound email behind one interface.
 * - "resend": production (RESEND_API_KEY, EMAIL_FROM).
 * - "console": dev/CI. Logs a summary and keeps messages in an in-process outbox for tests.
 */
export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: Uint8Array; contentType?: string }[];
};

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

const outbox: EmailMessage[] = [];
/** Test helper: messages "sent" by the console driver. */
export function _outbox(): readonly EmailMessage[] {
  return outbox;
}
export function _clearOutbox() {
  outbox.length = 0;
}

let resend: Resend | undefined;

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const driver = process.env.EMAIL_DRIVER ?? "resend";
  if (driver === "console") {
    outbox.push(message);
    console.info(`[email:console] to=${[message.to].flat().join(",")} subject="${message.subject}"`);
    return { ok: true, id: `console-${outbox.length}` };
  }
  if (driver !== "resend") throw new Error(`Unknown EMAIL_DRIVER "${driver}"`);

  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("RESEND_API_KEY and EMAIL_FROM must be set (EMAIL_DRIVER=resend)");
  resend ??= new Resend(key);

  const { data, error } = await resend.emails.send({
    from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    replyTo: message.replyTo,
    attachments: message.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content),
      contentType: a.contentType,
    })),
  });
  if (error || !data) return { ok: false, error: error?.message ?? "Unknown email error" };
  return { ok: true, id: data.id };
}

/** All owner notifications go to one inbox (Decision Log). */
export function ownerInbox(): string {
  return process.env.OWNER_NOTIFY_EMAIL || "CHARLYSCORNERSTORE@GMAIL.COM";
}
