CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"garment" text NOT NULL,
	"colors" jsonb NOT NULL,
	"views" jsonb NOT NULL,
	"artworks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sizes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"user_id" uuid,
	"notes" text,
	"stage" "order_stage" DEFAULT 'received' NOT NULL,
	"stage_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quote_cents" integer,
	"quote_note" text,
	"quoted_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"hidden_by_user_at" timestamp with time zone,
	"reorder_of" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mockups" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cart_items_user_idx" ON "cart_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "mockups" ADD CONSTRAINT "mockups_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill (hand-written): every existing order request becomes an order with the SAME id, so the
-- owner's stage/price links and the customer's /pay links already sent keep working.
INSERT INTO "orders" ("id", "lead_id", "user_id", "stage", "stage_at", "quote_cents", "quote_note", "quoted_at", "paid_at", "hidden_by_user_at", "reorder_of", "created_at")
SELECT "id", "lead_id", "user_id", COALESCE("order_stage", 'received'), COALESCE("order_stage_at", "created_at"), "quote_cents", "quote_note", "quoted_at", "paid_at", "hidden_by_user_at", "reorder_of", "created_at"
FROM "mockups" WHERE "kind" = 'order';--> statement-breakpoint
UPDATE "mockups" SET "order_id" = "id" WHERE "kind" = 'order';--> statement-breakpoint
UPDATE "order_payments" SET "order_id" = "mockup_id";
