/**
 * Shared (client-safe) schemas for member features (2026-11-26): settings, password change,
 * drafts, brand kit, saved sizes / rosters, order again. Routes re-validate with these.
 */
import { z } from "zod";

import { passwordField, twoFactorCodeField } from "./auth-schema";
import { GARMENT_IDS, type GarmentId } from "./garments";
import { mockupViewSchema } from "./mockup-schema";
import { TEXT_FONT_IDS } from "./text-fonts";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color");
const sizesRecord = z.record(z.string().max(8), z.number().int().min(0).max(10000));

export const settingsSchema = z.object({
  name: z.string().trim().max(100).optional(),
  marketingOptIn: z.boolean().optional(),
});

/**
 * Change password from Account settings: the current password (if the account has one; a
 * Google-only account sets its first one here) and a 2FA code when 2FA is on. Afterwards every
 * session ends, so the next sign-in asks for 2FA again (Logan, 2026-11-26).
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  code: twoFactorCodeField.optional(),
  newPassword: passwordField,
});

export const MAX_DRAFTS = 10;
export const DRAFT_NAME_MAX = 60;

/** An unfinished design. Like the mockup payload but nothing is required beyond the garment. */
export const draftDesignSchema = z.object({
  garment: z.enum(GARMENT_IDS as [GarmentId, ...GarmentId[]]),
  colors: z.record(z.string().max(20), hex),
  views: z.array(mockupViewSchema).max(4).default([]),
  sizes: sizesRecord.default({}),
  notes: z.string().trim().max(2000).optional(),
});

export const draftPayloadSchema = z.object({
  /** Present when updating an existing draft. */
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Name your draft").max(DRAFT_NAME_MAX),
  design: draftDesignSchema,
});

export const BRAND_INK_MAX = 8;
export const BRAND_FONTS_MAX = 4;

export const brandKitSchema = z.object({
  inkColors: z.array(hex).max(BRAND_INK_MAX).default([]),
  fonts: z.array(z.enum(TEXT_FONT_IDS)).max(BRAND_FONTS_MAX).default([]),
  /** Drop the saved logo (when no new one is attached). */
  removeLogo: z.boolean().default(false),
});

export const MAX_SIZE_SETS = 20;
export const ROSTER_MAX = 200;

export const sizeSetSchema = z.object({
  name: z.string().trim().min(1, "Name this size set").max(60),
  sizes: sizesRecord.default({}),
  roster: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        size: z.string().trim().min(1).max(8),
        number: z.string().trim().max(4).optional(),
      }),
    )
    .max(ROSTER_MAX)
    .default([]),
});

/** Order again: the same design with new sizes (and an optional note). */
export const reorderSchema = z.object({
  sizes: sizesRecord,
  notes: z.string().trim().max(2000).optional(),
});

export const sizesTotal = (sizes: Record<string, number>) => Object.values(sizes).reduce((a, b) => a + b, 0);
