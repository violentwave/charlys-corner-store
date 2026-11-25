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

import type { MockupColors, MockupSizes, MockupViewRecord } from "../src/lib/mockup-schema";
import { REFERRAL_SOURCES } from "../src/lib/schemas";

export const referralSource = pgEnum("referral_source", REFERRAL_SOURCES);
export const couponStatus = pgEnum("coupon_status", ["issued", "eligible", "redeemed", "expired"]);
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
    /** Original artwork, untouched, for production. */
    artworkKey: text("artwork_key").notNull(),
    artworkName: text("artwork_name").notNull(),
    artworkContentType: text("artwork_content_type").notNull(),
    artworkSizeBytes: integer("artwork_size_bytes").notNull(),
    status: requestStatus("status").notNull().default("new"),
    createdAt: createdAt(),
  },
  (t) => [index("mockups_created_idx").on(t.createdAt), index("mockups_lead_idx").on(t.leadId)],
);
