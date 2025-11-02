ALTER TABLE "Blob" RENAME COLUMN "stored_path" TO "key";--> statement-breakpoint
ALTER TABLE "Blob" DROP CONSTRAINT "Blob_storageProviderId_storedPath_unique";--> statement-breakpoint
ALTER TABLE "Blob" ADD CONSTRAINT "Blob_storageProviderId_key_unique" UNIQUE("storage_provider_id","key");