CREATE TYPE "public"."order_payment_method" AS ENUM('payment_link', 'card_on_file');--> statement-breakpoint
CREATE TYPE "public"."order_payment_status" AS ENUM('pending', 'paid', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "order_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mockup_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"coupon_id" uuid,
	"method" "order_payment_method" DEFAULT 'payment_link' NOT NULL,
	"status" "order_payment_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"square_payment_link_id" text,
	"square_order_id" text,
	"square_payment_id" text,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mockups" ADD COLUMN "quote_cents" integer;--> statement-breakpoint
ALTER TABLE "mockups" ADD COLUMN "quote_note" text;--> statement-breakpoint
ALTER TABLE "mockups" ADD COLUMN "quoted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mockups" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_mockup_id_mockups_id_fk" FOREIGN KEY ("mockup_id") REFERENCES "public"."mockups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_payments_mockup_idx" ON "order_payments" USING btree ("mockup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_payments_idempotency_unique" ON "order_payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "order_payments_square_order_unique" ON "order_payments" USING btree ("square_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_payments_square_payment_unique" ON "order_payments" USING btree ("square_payment_id");