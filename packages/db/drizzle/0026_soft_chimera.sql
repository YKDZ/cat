CREATE TABLE "Blob" (
	"id" serial PRIMARY KEY NOT NULL,
	"stored_path" text NOT NULL,
	"hash" text NOT NULL,
	"storage_provider_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "Blob_hash_unique" UNIQUE("hash"),
	CONSTRAINT "Blob_storageProviderId_storedPath_unique" UNIQUE("storage_provider_id","stored_path")
);
--> statement-breakpoint
ALTER TABLE "File" RENAME COLUMN "user_id" TO "creator_id";--> statement-breakpoint
ALTER TABLE "File" DROP CONSTRAINT "File_user_id_User_id_fk";
--> statement-breakpoint
ALTER TABLE "File" DROP CONSTRAINT "File_storage_provider_id_PluginService_id_fk";
--> statement-breakpoint
DROP INDEX "File_document_id_index";--> statement-breakpoint
DROP INDEX "File_user_id_index";--> statement-breakpoint
ALTER TABLE "File" ADD COLUMN "blob_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "Blob" ADD CONSTRAINT "Blob_storage_provider_id_PluginService_id_fk" FOREIGN KEY ("storage_provider_id") REFERENCES "public"."PluginService"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "File" ADD CONSTRAINT "File_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "File" ADD CONSTRAINT "File_blob_id_Blob_id_fk" FOREIGN KEY ("blob_id") REFERENCES "public"."Blob"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "File" DROP COLUMN "stored_path";--> statement-breakpoint
ALTER TABLE "File" DROP COLUMN "storage_provider_id";--> statement-breakpoint
ALTER TABLE "File" DROP COLUMN "updated_at";