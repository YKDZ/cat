DROP INDEX "TranslatableString_value_language_id_index";--> statement-breakpoint
ALTER TABLE "TranslatableString" ADD CONSTRAINT "TranslatableString_value_unique" UNIQUE("value");