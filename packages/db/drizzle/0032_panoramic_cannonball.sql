ALTER TABLE "Blob" ADD COLUMN "hash" "bytea";--> statement-breakpoint
ALTER TABLE "Blob" ADD CONSTRAINT "Blob_hash_unique" UNIQUE("hash");--> statement-breakpoint
ALTER TABLE "Blob" ADD CONSTRAINT "hash_check1" CHECK (octet_length("Blob"."hash") = 32);