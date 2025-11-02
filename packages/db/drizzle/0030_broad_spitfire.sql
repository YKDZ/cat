ALTER TABLE "Blob" ADD COLUMN "reference_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "Blob" ADD CONSTRAINT "Blob_hash_unique" UNIQUE("hash");--> statement-breakpoint
ALTER TABLE "Blob" ADD CONSTRAINT "referenceCount_check1" CHECK ("Blob"."reference_count" >= 0);