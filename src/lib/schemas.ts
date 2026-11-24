/**
 * Shared Zod schemas for public forms. Used client-side (React Hook Form) in Phase 2
 * and re-validated server-side in Phase 3 (AGENTS.md: server is the source of truth).
 */
import { z } from "zod";

export const REFERRAL_SOURCES = ["search", "ad", "friend", "other"] as const;
export const referralLabels: Record<(typeof REFERRAL_SOURCES)[number], string> = {
  search: "Internet Search",
  ad: "Advertisement",
  friend: "Friend",
  other: "Other",
};

const name = z.string().trim().min(1, "Please enter your name").max(100);
const email = z.email("Please enter a valid email").trim().max(254);
const phone = z
  .string()
  .trim()
  .max(30)
  .regex(/^[0-9+().\-\s]*$/, "Please enter a valid phone number")
  .optional()
  .or(z.literal(""));

/** "How did you hear about us?" (old site Home survey). Optional on every form. */
export const referralSchema = z
  .object({
    referralSource: z.enum(REFERRAL_SOURCES).optional(),
    referralOther: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.referralSource !== "other" || !!v.referralOther, {
    message: "Please tell us how you heard about us",
    path: ["referralOther"],
  });

/** About + Contact pages (old About page form: name, email, comment). */
export const contactSchema = z
  .object({
    name,
    email,
    phone,
    message: z.string().trim().min(1, "Please enter a message").max(5000),
    referralSource: z.enum(REFERRAL_SOURCES).optional(),
    referralOther: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.referralSource !== "other" || !!v.referralOther, {
    message: "Please tell us how you heard about us",
    path: ["referralOther"],
  });

/** Business & Promo quote request. Artwork upload is added in Phase 3 (storage). */
export const quoteSchema = z.object({
  name,
  email,
  phone,
  company: z.string().trim().max(120).optional(),
  items: z.string().trim().min(1, "Tell us what you'd like made").max(2000),
  quantity: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().positive("Quantity must be at least 1").max(100000).optional(),
  ),
  neededBy: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(5000).optional(),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;
export type ReferralInput = z.infer<typeof referralSchema>;
