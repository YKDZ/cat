ALTER TABLE "TranslatableElement" ADD COLUMN "source_start_line" integer;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD COLUMN "source_end_line" integer;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD COLUMN "source_location_meta" jsonb;