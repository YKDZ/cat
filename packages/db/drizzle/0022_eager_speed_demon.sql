ALTER TABLE "Term" DROP CONSTRAINT "Term_language_id_Language_id_fk";
--> statement-breakpoint
ALTER TABLE "MemoryItem" DROP CONSTRAINT "MemoryItem_source_language_id_Language_id_fk";
--> statement-breakpoint
ALTER TABLE "MemoryItem" DROP CONSTRAINT "MemoryItem_translation_language_id_Language_id_fk";
--> statement-breakpoint
ALTER TABLE "Translation" DROP CONSTRAINT "Translation_language_id_Language_id_fk";
--> statement-breakpoint
DROP INDEX "Term_language_id_index";--> statement-breakpoint
DROP INDEX "Translation_translator_id_language_id_translatable_element_id_string_id_index";--> statement-breakpoint
ALTER TABLE "Term" ADD COLUMN "string_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "Term" ADD CONSTRAINT "Term_string_id_TranslatableString_id_fk" FOREIGN KEY ("string_id") REFERENCES "public"."TranslatableString"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "Translation_translator_id_translatable_element_id_string_id_index" ON "Translation" USING btree ("translator_id","translatable_element_id" int4_ops,"string_id" int4_ops);--> statement-breakpoint
ALTER TABLE "Term" DROP COLUMN "value";--> statement-breakpoint
ALTER TABLE "Term" DROP COLUMN "language_id";--> statement-breakpoint
ALTER TABLE "MemoryItem" DROP COLUMN "source_language_id";--> statement-breakpoint
ALTER TABLE "MemoryItem" DROP COLUMN "translation_language_id";--> statement-breakpoint
ALTER TABLE "Translation" DROP COLUMN "language_id";