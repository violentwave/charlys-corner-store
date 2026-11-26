ALTER TABLE "mockups" DROP CONSTRAINT "mockups_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "mockups" ADD COLUMN "hidden_by_user_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mockups" ADD CONSTRAINT "mockups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;