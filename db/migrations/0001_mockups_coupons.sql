CREATE TYPE "public"."coupon_status" AS ENUM('issued', 'eligible', 'redeemed', 'expired');--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"code" text NOT NULL,
	"percent_off" integer NOT NULL,
	"min_order_cents" integer NOT NULL,
	"status" "coupon_status" DEFAULT 'issued' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_order_ref" text
);
--> statement-breakpoint
CREATE TABLE "mockups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"coupon_id" uuid,
	"garment" text NOT NULL,
	"colors" jsonb NOT NULL,
	"views" jsonb NOT NULL,
	"sizes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"wants_quote" boolean DEFAULT false NOT NULL,
	"artwork_key" text NOT NULL,
	"artwork_name" text NOT NULL,
	"artwork_content_type" text NOT NULL,
	"artwork_size_bytes" integer NOT NULL,
	"status" "request_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mockups" ADD CONSTRAINT "mockups_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mockups" ADD CONSTRAINT "mockups_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_unique" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_lead_unique" ON "coupons" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "mockups_created_idx" ON "mockups" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "mockups_lead_idx" ON "mockups" USING btree ("lead_id");