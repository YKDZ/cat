CREATE TYPE "public"."TaskStatus" AS ENUM('COMPLETED', 'PENDING', 'FAILED');--> statement-breakpoint
ALTER TABLE "PluginService" ALTER COLUMN "service_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."PluginServiceType";--> statement-breakpoint
CREATE TYPE "public"."PluginServiceType" AS ENUM('AUTH_PROVIDER', 'STORAGE_PROVIDER', 'TERM_SERVICE', 'TRANSLATABLE_FILE_HANDLER', 'TRANSLATION_ADVISOR', 'TEXT_VECTORIZER', 'VECTOR_STORAGE');--> statement-breakpoint
ALTER TABLE "PluginService" ALTER COLUMN "service_type" SET DATA TYPE "public"."PluginServiceType" USING "service_type"::"public"."PluginServiceType";--> statement-breakpoint
ALTER TABLE "PluginInstallation" ALTER COLUMN "scope_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."ScopeType";--> statement-breakpoint
CREATE TYPE "public"."ScopeType" AS ENUM('GLOBAL', 'PROJECT', 'USER');--> statement-breakpoint
ALTER TABLE "PluginInstallation" ALTER COLUMN "scope_type" SET DATA TYPE "public"."ScopeType" USING "scope_type"::"public"."ScopeType";--> statement-breakpoint
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"public"."TaskStatus";--> statement-breakpoint
ALTER TABLE "Task" ALTER COLUMN "status" SET DATA TYPE "public"."TaskStatus" USING "status"::"public"."TaskStatus";