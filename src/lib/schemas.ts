/**
 * Shared Zod schemas for public forms. Used client-side (React Hook Form) in Phase 2
 * and re-validated server-side in Phase 3 (AGENTS.md: server is the source of truth).
 */
import { z } from "zod";

import { PRINT_METHOD_CHOICES } from "./print-methods";

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
/** Order-form choice lists, shared by the form and the server (no free-form values). */
export const ORDER_FORM_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "OSFA"] as const;
export const ORDER_FORM_LOCATIONS = [
  "Front",
  "Back",
  "Left sleeve",
  "Right sleeve",
  "Left chest",
  "Hat front",
  "Other",
] as const;

export const orderFormSchema = z
  .object({
    orderType: z.enum(["new", "existing"]).default("new"),
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
    state: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, "Pick a state")
      .transform((s) => s.toUpperCase())
      .optional()
      .or(z.literal("")),
    zip: z
      .string()
      .trim()
      .regex(/^(\d{5}|\d{5}-\d{4})$/, "ZIP must be 5 or 9 digits")
      .optional()
      .or(z.literal("")),
    // Garment names from GARMENTS (checked in the route against the live list), max 20.
    items: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    otherItem: z.preprocess((v) => v === "true" || v === true, z.boolean().optional()),
    colors: z.string().trim().max(200).optional().or(z.literal("")),
    printMethod: z.enum(PRINT_METHOD_CHOICES).default("recommend"),
    printLocations: z.array(z.enum(ORDER_FORM_LOCATIONS)).max(ORDER_FORM_LOCATIONS.length).default([]),
    sizes: z.partialRecord(z.enum(ORDER_FORM_SIZES), z.number().int().min(0).max(10000)).default({}),
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
