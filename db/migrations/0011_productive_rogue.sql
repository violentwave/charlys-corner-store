ALTER TABLE "uploads" ALTER COLUMN "last_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ALTER COLUMN "order_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ALTER COLUMN "file_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ALTER COLUMN "file_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ALTER COLUMN "content_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ALTER COLUMN "size_bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "order_type" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "company" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "fulfillment" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "address" jsonb;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "items" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "colors" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "print_method" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "print_locations" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "sizes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "needed_by" date;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "files" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "referral_source" "referral_source";--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "referral_other" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "marketing_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uploads_user_idx" ON "uploads" USING btree ("user_id");--> statement-breakpoint
UPDATE "uploads" SET "files" = jsonb_build_array(jsonb_build_object('key', "file_key", 'name', "file_name", 'contentType', "content_type", 'size', "size_bytes")) WHERE "file_key" IS NOT NULL;