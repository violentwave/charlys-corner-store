/**
 * Database schema (Drizzle, plain Postgres). Phase 3 tables only; mockups/coupons/orders
 * arrive with Phases 4–5 as their own migrations. See docs/02 → Data model.
 *
 * Change this file, then `pnpm db:generate` to write a SQL migration into db/migrations.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { REFERRAL_SOURCES } from "../src/lib/schemas";

export const referralSource = pgEnum("referral_source", REFERRAL_SOURCES);
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
