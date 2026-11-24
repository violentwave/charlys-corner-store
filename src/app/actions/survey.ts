"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit, clientIp, LIMITS } from "@/lib/rate-limit";
import { zodFieldErrors } from "@/lib/action-result";
import { REFERRAL_SOURCES } from "@/lib/schemas";
import type { ActionResult } from "@/lib/action-result";

const surveySchema = z
  .object({
    referralSource: z.enum(REFERRAL_SOURCES),
    referralOther: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.referralSource !== "other" || !!v.referralOther, {
    message: "Please tell us how you heard about us",
    path: ["referralOther"],
  });

export async function submitSurvey(input: unknown, turnstileToken?: string | null): Promise<ActionResult> {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  if (typeof raw.website === "string" && raw.website.trim() !== "") {
    return { ok: true, message: "Thanks!" };
  }

  const parsed = surveySchema.safeParse(raw);
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
  const rl = await rateLimit(db, { key: `survey:${ip}`, ...LIMITS.survey });
  if (!rl.ok) {
    return { ok: false, error: "Too many submissions — please try again in a bit." };
  }

  await db.insert(schema.surveyResponses).values({
    referralSource: data.referralSource,
    referralOther: data.referralOther ?? null,
    page: "home",
  });

  return { ok: true, message: "Thanks for letting us know!" };
}
