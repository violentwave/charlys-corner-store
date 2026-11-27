ALTER TABLE "order_payments" DROP CONSTRAINT "order_payments_mockup_id_mockups_id_fk";
--> statement-breakpoint
DROP INDEX "order_payments_mockup_idx";--> statement-breakpoint
DROP INDEX "order_payments_one_card_in_flight";--> statement-breakpoint
ALTER TABLE "order_payments" ALTER COLUMN "order_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "order_payments_order_idx" ON "order_payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_payments_one_card_in_flight" ON "order_payments" USING btree ("order_id") WHERE "order_payments"."method" = 'card_on_file' and "order_payments"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "mockups" DROP COLUMN "order_stage";--> statement-breakpoint
ALTER TABLE "mockups" DROP COLUMN "order_stage_at";--> statement-breakpoint
ALTER TABLE "mockups" DROP COLUMN "quote_cents";--> statement-breakpoint
ALTER TABLE "mockups" DROP COLUMN "quote_note";--> statement-breakpoint
ALTER TABLE "mockups" DROP COLUMN "quoted_at";--> statement-breakpoint
ALTER TABLE "mockups" DROP COLUMN "paid_at";--> statement-breakpoint
ALTER TABLE "order_payments" DROP COLUMN "mockup_id";