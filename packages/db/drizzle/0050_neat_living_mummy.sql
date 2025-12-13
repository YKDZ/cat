CREATE TYPE "public"."ResourceScopeType" AS ENUM('PROJECT', 'TRANSLATABLE_ELEMENT', 'DOCUMENT', 'PLUGIN', 'GLOSSARY', 'MEMORY');--> statement-breakpoint
ALTER TABLE "Role" ALTER COLUMN "scope_type" SET DATA TYPE "public"."ResourceScopeType" USING "scope_type"::text::"public"."ResourceScopeType";--> statement-breakpoint
ALTER TABLE "Role" ALTER COLUMN "scope_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "Role" ALTER COLUMN "scope_id" SET NOT NULL;