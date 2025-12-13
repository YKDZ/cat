CREATE TYPE "public"."ResourceType" AS ENUM('PROJECT', 'DOCUMENT', 'PLUGIN', 'GLOSSARY', 'MEMORY');--> statement-breakpoint
ALTER TABLE "Role" ALTER COLUMN "scope_type" SET DATA TYPE "public"."ScopeType" USING "scope_type"::text::"public"."ScopeType";--> statement-breakpoint
ALTER TABLE "Permission" ADD COLUMN "resource_type" "ResourceType" NOT NULL;--> statement-breakpoint
ALTER TABLE "Permission" ADD COLUMN "resource_id" text NOT NULL;--> statement-breakpoint
DROP TYPE "public"."ResourceScopeType";