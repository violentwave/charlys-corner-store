import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

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
    if (process.env.NODE_ENV === "development") saveDevPreview(message);
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

/**
 * `pnpm dev` with EMAIL_DRIVER=console: write each email to tmp/emails/*.html (gitignored)
 * and print its links, so you can open owner links ("Set the price", stage links) locally.
 * Never runs in production builds or tests (NODE_ENV is only "development" under next dev).
 */
function saveDevPreview(message: EmailMessage) {
  try {
    const dir = path.join(process.cwd(), "tmp", "emails");
    mkdirSync(dir, { recursive: true });
    const slug = message.subject
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
    const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${slug}.html`);
    writeFileSync(file, message.html);
    console.info(`[email:console]   saved: file://${file}`);
    const links = [...new Set([...message.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&")))];
    for (const link of links.filter((l) => l.startsWith("http"))) console.info(`[email:console]   link: ${link}`);
  } catch (err) {
    console.warn("[email:console] couldn't save the dev preview", err);
  }
}
