ALTER TABLE "PluginService" ALTER COLUMN "service_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "PluginServiceType";--> statement-breakpoint
CREATE TYPE "PluginServiceType" AS ENUM('AUTH_PROVIDER', 'STORAGE_PROVIDER', 'TERM_EXTRACTOR', 'TRANSLATABLE_FILE_HANDLER', 'TRANSLATION_ADVISOR', 'TEXT_VECTORIZER', 'VECTOR_STORAGE');--> statement-breakpoint
ALTER TABLE "PluginService" ALTER COLUMN "service_type" SET DATA TYPE "PluginServiceType" USING "service_type"::"PluginServiceType";