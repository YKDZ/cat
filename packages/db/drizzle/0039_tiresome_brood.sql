ALTER TABLE "TranslatableString" DROP CONSTRAINT "TranslatableString_value_unique";--> statement-breakpoint
ALTER TABLE "Document" ALTER COLUMN "is_directory" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "TranslatableString" ADD CONSTRAINT "TranslatableString_languageId_value_unique" UNIQUE("language_id","value");