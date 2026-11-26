/**
 * Database schema (Drizzle, plain Postgres). Phase 3 forms + Phase 4 mockups/coupons;
 * orders arrive with Phase 5 as its own migration. See docs/02 → Data model.
 *
 * Change this file, then `pnpm db:generate` to write a SQL migration into db/migrations.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { MockupArtworkRecord, MockupColors, MockupSizes, MockupViewRecord } from "../src/lib/mockup-schema";
import { REFERRAL_SOURCES } from "../src/lib/schemas";

export const referralSource = pgEnum("referral_source", REFERRAL_SOURCES);
export const couponStatus = pgEnum("coupon_status", ["issued", "eligible", "redeemed", "expired"]);
export const mockupKind = pgEnum("mockup_kind", ["mockup", "order"]);
export const orderPaymentMethod = pgEnum("order_payment_method", ["payment_link", "card_on_file"]);
export const orderPaymentStatus = pgEnum("order_payment_status", ["pending", "paid", "failed", "canceled"]);
/**
 * Where an order request stands, as the customer sees it in "My designs" (2026-11-26). The
 * owner moves it on with one-click links in his order email (src/lib/order-stage.ts).
 */
export const orderStage = pgEnum("order_stage", [
  "received",
  "quoted",
  "in_production",
  "ready",
  "completed",
  "cancelled",
]);
export const authTokenPurpose = pgEnum("auth_token_purpose", [
  "verify_email",
  "reset_password",
  /** 2026-11-26: a pending sign-in waiting for its second factor (cookie token, hashed). */
  "two_factor_challenge",
  /** 2026-11-26: a 6-digit code emailed for 2FA (sign-in or turning email 2FA on). */
  "two_factor_email",
]);
/** 2FA method (2026-11-26): an authenticator app (TOTP), or a 6-digit code by email (fallback). */
export const twoFactorMethod = pgEnum("two_factor_method", ["totp", "email"]);
export const requestStatus = pgEnum("request_status", ["new", "contacted", "quoted", "ordered", "closed", "spam"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** One row per email address (stored lowercase). Every public form upserts a lead. */
export const leads = pgTable(
  "leads",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name"),
    phone: text("phone"),
    referralSource: referralSource("referral_source"),
    referralOther: text("referral_other"),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("leads_email_unique").on(sql`lower(${t.email})`)],
);

/** About "custom order request" + Contact page messages. */
export const contactMessages = pgTable(
  "contact_messages",
  {
    id: id(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    message: text("message").notNull(),
    referralSource: referralSource("referral_source"),
    referralOther: text("referral_other"),
    /** Page the form was sent from, e.g. "about" | "contact". */
    sourcePage: text("source_page").notNull(),
    status: requestStatus("status").notNull().default("new"),
    createdAt: createdAt(),
  },
  (t) => [index("contact_messages_created_idx").on(t.createdAt)],
);

/** Business & Promo quote requests. */
export const quotes = pgTable(
  "quotes",
  {
    id: id(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    company: text("company"),
    items: text("items").notNull(),
    quantity: integer("quantity"),
    neededBy: date("needed_by"),
    notes: text("notes"),
    /** Storage keys of uploaded artwork (src/lib/storage.ts). */
    artworkKeys: text("artwork_keys")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: requestStatus("status").notNull().default("new"),
    createdAt: createdAt(),
  },
  (t) => [index("quotes_created_idx").on(t.createdAt)],
);

/** Artwork for an existing order (old "Custom Image Uploader" page). */
export const uploads = pgTable(
  "uploads",
  {
    id: id(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    orderNumber: text("order_number").notNull(),
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("uploads_created_idx").on(t.createdAt)],
);

/** Standalone "How did you hear about us?" answers (Home page survey, old-site parity). */
export const surveyResponses = pgTable("survey_responses", {
  id: id(),
  referralSource: referralSource("referral_source").notNull(),
  referralOther: text("referral_other"),
  page: text("page").notNull(),
  createdAt: createdAt(),
});

/** Fixed-window rate limit counters (src/lib/rate-limit.ts). Keys are hashed, never raw IPs. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  count: integer("count").notNull().default(0),
});

/**
 * "15% off your 2nd order" coupons (src/lib/coupons.ts rules). One per lead (= one per email),
 * enforced by the unique lead_id index; issueCoupon() in src/lib/coupon-store.ts is idempotent.
 */
export const coupons = pgTable(
  "coupons",
  {
    id: id(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    code: text("code").notNull(),
    percentOff: integer("percent_off").notNull(),
    minOrderCents: integer("min_order_cents").notNull(),
    status: couponStatus("status").notNull().default("issued"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Payment provider's order id once redeemed (Phase 5). */
    redeemedOrderRef: text("redeemed_order_ref"),
  },
  (t) => [uniqueIndex("coupons_code_unique").on(t.code), uniqueIndex("coupons_lead_unique").on(t.leadId)],
);

/** Build-Your-Own Mockup submissions (email gate on /design). */
export const mockups = pgTable(
  "mockups",
  {
    id: id(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    couponId: uuid("coupon_id").references(() => coupons.id),
    garment: text("garment").notNull(),
    /** zone id → #rrggbb */
    colors: jsonb("colors").$type<MockupColors>().notNull(),
    /** One entry per view that has artwork: print area, artwork transform, rendered mockup key. */
    views: jsonb("views").$type<MockupViewRecord[]>().notNull(),
    sizes: jsonb("sizes").$type<MockupSizes>().notNull().default({}),
    notes: text("notes"),
    wantsQuote: boolean("wants_quote").notNull().default(false),
    /** "mockup" = emailed mockup; "order" = order request (owner confirms price + invoices). */
    kind: mockupKind("kind").notNull().default("mockup"),
    /** Account that made it (null for rows from before accounts existed, or a deleted account's orders). */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /**
     * The member removed this order request from "My designs" (2026-11-26). Orders aren't
     * deleted (the owner still needs them); emailed mockups are deleted outright instead.
     */
    hiddenByUserAt: timestamp("hidden_by_user_at", { withTimezone: true }),
    /** Order requests only: progress shown to the customer (null on rows from before 2026-11-26 = received). */
    orderStage: orderStage("order_stage"),
    orderStageAt: timestamp("order_stage_at", { withTimezone: true }),
    /** Owner-set quote for an order request (P51-3): dollars → cents, optional note. */
    quoteCents: integer("quote_cents"),
    quoteNote: text("quote_note"),
    quotedAt: timestamp("quoted_at", { withTimezone: true }),
    /** Set when the customer pays (Square webhook). */
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** "Order again": the order request this one repeats (same design and files). */
    reorderOf: uuid("reorder_of"),
    /** Every original file, untouched, for production; image layers' `artwork` indexes this list. */
    artworks: jsonb("artworks").$type<MockupArtworkRecord[]>().notNull().default([]),
    /**
     * First original artwork (= artworks[0]); kept for rows from before per-view files.
     * Null for text-only designs (2026-11-25).
     */
    artworkKey: text("artwork_key"),
    artworkName: text("artwork_name"),
    artworkContentType: text("artwork_content_type"),
    artworkSizeBytes: integer("artwork_size_bytes"),
    status: requestStatus("status").notNull().default("new"),
    createdAt: createdAt(),
  },
  (t) => [
    index("mockups_created_idx").on(t.createdAt),
    index("mockups_lead_idx").on(t.leadId),
    index("mockups_user_idx").on(t.userId),
  ],
);

/**
 * Customer accounts (decided 2026-11-25: email + password). Email is stored lowercase.
 * Passwords are scrypt hashes (src/lib/auth/password.ts); the email must be verified with a
 * 6-digit code before the account can upload artwork or send mockups/orders.
 */
export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    /** Null for accounts created with Google that never set a password. */
    passwordHash: text("password_hash"),
    name: text("name"),
    /** Google account id ("sub") once Google sign-in is linked (2026-11-26). */
    googleSub: text("google_sub"),
    /** Square customer id (P51-4): one per member account, created on first saved card. */
    squareCustomerId: text("square_customer_id"),
    /** Null = 2FA off. */
    twoFactorMethod: twoFactorMethod("two_factor_method"),
    /** Authenticator secret, AES-256-GCM encrypted (src/lib/auth/secret-box.ts). */
    totpSecret: text("totp_secret"),
    /** A secret being set up, not yet confirmed with a code (encrypted). */
    totpPendingSecret: text("totp_pending_secret"),
    /** Last accepted TOTP time step: the same code can't be used twice. */
    totpLastStep: integer("totp_last_step"),
    /** SHA-256 hashes of unused one-time backup codes. */
    recoveryCodeHashes: jsonb("recovery_code_hashes").$type<string[]>().notNull().default([]),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /** Set on verification: the lead row for this email (coupons hang off leads). */
    leadId: uuid("lead_id").references(() => leads.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    uniqueIndex("users_google_sub_unique").on(t.googleSub),
    uniqueIndex("users_square_customer_unique").on(t.squareCustomerId),
  ],
);

/** Login sessions. Only a SHA-256 of the cookie token is stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("sessions_token_unique").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

/** Email verification codes and password-reset tokens (hashed, single use, short-lived). */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: authTokenPurpose("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("auth_tokens_user_idx").on(t.userId, t.purpose), index("auth_tokens_hash_idx").on(t.tokenHash)],
);

/**
 * Saved drafts (2026-11-26): an unfinished builder design kept on the account. Uploaded images
 * live under `mockups/drafts/…`, so the 30-day bucket rule deletes them like mockup files.
 */
export const drafts = pgTable(
  "drafts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Builder design: garment, colors, views (layers), sizes, notes (src/lib/member-schemas.ts draftDesignSchema). */
    design: jsonb("design").$type<Record<string, unknown>>().notNull(),
    artworks: jsonb("artworks").$type<MockupArtworkRecord[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("drafts_user_idx").on(t.userId, t.updatedAt)],
);

/** Brand kit (2026-11-26): ink colors, fonts and a logo the builder offers first. One per member. */
export const brandKits = pgTable("brand_kits", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  inkColors: jsonb("ink_colors").$type<string[]>().notNull().default([]),
  fonts: jsonb("fonts").$type<string[]>().notNull().default([]),
  /** Stored under `brand/…` (kept: not covered by the 30-day rule). */
  logo: jsonb("logo").$type<MockupArtworkRecord | null>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Saved sizes / team rosters (2026-11-26) for quick reorders. */
export const sizeSets = pgTable(
  "size_sets",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sizes: jsonb("sizes").$type<MockupSizes>().notNull().default({}),
    /** Optional per-person list (team orders): name, size, and an optional number. */
    roster: jsonb("roster").$type<{ name: string; size: string; number?: string }[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("size_sets_user_idx").on(t.userId)],
);

/** Square payment link for an order request (P51-3): hosted checkout, no card data stored. */
export const orderPayments = pgTable(
  "order_payments",
  {
    id: id(),
    mockupId: uuid("mockup_id")
      .notNull()
      .references(() => mockups.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    amountCents: integer("amount_cents").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    couponId: uuid("coupon_id").references(() => coupons.id),
    method: orderPaymentMethod("method").notNull().default("payment_link"),
    status: orderPaymentStatus("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    squarePaymentLinkId: text("square_payment_link_id"),
    squareOrderId: text("square_order_id"),
    squarePaymentId: text("square_payment_id"),
    url: text("url").notNull(),
    createdAt: createdAt(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [
    index("order_payments_mockup_idx").on(t.mockupId),
    uniqueIndex("order_payments_idempotency_unique").on(t.idempotencyKey),
    uniqueIndex("order_payments_square_order_unique").on(t.squareOrderId),
    uniqueIndex("order_payments_square_payment_unique").on(t.squarePaymentId),
  ],
);

/** Square webhook dedupe (P51-3): event_id is the primary key; retries are no-ops. */
export const webhookEvents = pgTable("webhook_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: createdAt(),
});
