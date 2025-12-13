ALTER TABLE "Role" ALTER COLUMN "scope_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."ResourceScopeType";--> statement-breakpoint
CREATE TYPE "public"."ResourceScopeType" AS ENUM('PROJECT', 'DOCUMENT', 'PLUGIN', 'GLOSSARY', 'MEMORY');--> statement-breakpoint
ALTER TABLE "Role" ALTER COLUMN "scope_type" SET DATA TYPE "public"."ResourceScopeType" USING "scope_type"::"public"."ResourceScopeType";