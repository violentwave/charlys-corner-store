ALTER TABLE "users" ADD COLUMN "square_customer_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_square_customer_unique" ON "users" USING btree ("square_customer_id");