ALTER TABLE "mockups" ALTER COLUMN "artwork_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mockups" ALTER COLUMN "artwork_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mockups" ALTER COLUMN "artwork_content_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mockups" ALTER COLUMN "artwork_size_bytes" DROP NOT NULL;