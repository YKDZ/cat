ALTER TABLE "MemoryItem" DROP CONSTRAINT "MemoryItem_source_chunk_set_id_ChunkSet_id_fk";
--> statement-breakpoint
ALTER TABLE "MemoryItem" DROP CONSTRAINT "MemoryItem_translation_chunk_set_id_ChunkSet_id_fk";
--> statement-breakpoint
DROP INDEX "Translation_translator_id_language_id_translatable_element_id_value_index";--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD COLUMN "source_string_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD COLUMN "translation_string_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "Translation" ADD COLUMN "string_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_source_string_id_TranslatableString_id_fk" FOREIGN KEY ("source_string_id") REFERENCES "public"."TranslatableString"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_translation_string_id_TranslatableString_id_fk" FOREIGN KEY ("translation_string_id") REFERENCES "public"."TranslatableString"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "Translation_translator_id_language_id_translatable_element_id_string_id_index" ON "Translation" USING btree ("translator_id","language_id" text_ops,"translatable_element_id" int4_ops,"string_id" int4_ops);--> statement-breakpoint
ALTER TABLE "MemoryItem" DROP COLUMN "source";--> statement-breakpoint
ALTER TABLE "MemoryItem" DROP COLUMN "translation";--> statement-breakpoint
ALTER TABLE "MemoryItem" DROP COLUMN "source_chunk_set_id";--> statement-breakpoint
ALTER TABLE "MemoryItem" DROP COLUMN "translation_chunk_set_id";--> statement-breakpoint
ALTER TABLE "Translation" DROP COLUMN "value";