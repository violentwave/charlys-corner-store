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

export const nameField = z.string().trim().min(1, "Please enter your name").max(100);
export const emailField = z.email("Please enter a valid email").trim().max(254);
export const phoneField = z
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
    name: nameField,
    email: emailField,
    phone: phoneField,
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
  name: nameField,
  email: emailField,
  phone: phoneField,
  company: z.string().trim().max(120).optional(),
  items: z.string().trim().min(1, "Tell us what you'd like made").max(2000),
  quantity: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().positive("Quantity must be at least 1").max(100000).optional(),
  ),
  /** HTML date input value (YYYY-MM-DD) or empty. Stored in a Postgres date column. */
  neededBy: z.iso.date("Please pick a valid date").optional().or(z.literal("")),
  notes: z.string().trim().max(5000).optional(),
});

/** Existing-order artwork uploader (old /custom-image-uploader.html parity). */
export const uploadSchema = z.object({
  firstName: z.string().trim().min(1, "Please enter your first name").max(100),
  lastName: z.string().trim().min(1, "Please enter your last name").max(100),
  email: emailField,
  orderNumber: z.string().trim().min(1, "Please enter your order number").max(40),
  notes: z.string().trim().max(2000).optional(),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;
export type ReferralInput = z.infer<typeof referralSchema>;
/** Order form (home #upload): new or existing order, with optional artwork. */
export const orderFormSchema = z
  .object({
    orderType: z.enum(["new", "existing"]),
    firstName: z.string().trim().min(1, "Please enter your first name").max(100),
    lastName: z.string().trim().max(100).optional().or(z.literal("")),
    email: emailField,
    phone: phoneField,
    company: z.string().trim().max(120).optional().or(z.literal("")),
    orderNumber: z.string().trim().max(40).optional().or(z.literal("")),
    fulfillment: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.enum(["pickup", "ship"]).optional()),
    street: z.string().trim().max(200).optional().or(z.literal("")),
    unit: z.string().trim().max(60).optional().or(z.literal("")),
    city: z.string().trim().max(100).optional().or(z.literal("")),
    state: z.string().trim().max(2).optional().or(z.literal("")),
    zip: z
      .string()
      .trim()
      .regex(/^(\d{5}|\d{5}-\d{4})$/, "ZIP must be 5 or 9 digits")
      .optional()
      .or(z.literal("")),
    items: z.array(z.string()),
    otherItem: z.preprocess((v) => v === "true" || v === true, z.boolean().optional()),
    colors: z.string().trim().max(200).optional().or(z.literal("")),
    printMethod: z.string().trim().max(60).optional().or(z.literal("")),
    printLocations: z.array(z.string()),
    sizes: z.record(z.string(), z.number().int().min(0).max(10000)),
    neededBy: z.iso.date("Please pick a valid date").optional().or(z.literal("")),
    files: z.array(z.any()).optional(),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    referralSource: z.preprocess((v) => (v === "" ? undefined : v), z.enum(REFERRAL_SOURCES).optional()),
    referralOther: z.string().trim().max(200).optional(),
    marketingOptIn: z.preprocess((v) => v === "true" || v === true, z.boolean().optional()),
    turnstileToken: z.string().optional(),
    website: z.string().optional(),
  })
  .refine((v) => v.referralSource !== "other" || !!v.referralOther, {
    message: "Please tell us how you heard about us",
    path: ["referralOther"],
  });

export type OrderFormInput = z.infer<typeof orderFormSchema>;
