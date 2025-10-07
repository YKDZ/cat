ALTER TABLE "Translation" DROP CONSTRAINT "Translation_vectorizer_id_PluginService_id_fk";
--> statement-breakpoint
ALTER TABLE "Translation" DROP COLUMN "vectorizer_id";