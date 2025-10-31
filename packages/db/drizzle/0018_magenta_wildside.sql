ALTER TABLE "TranslatableElement" RENAME COLUMN "translable_string_id" TO "translatable_string_id";--> statement-breakpoint
ALTER TABLE "TranslatableElement" DROP CONSTRAINT "TranslatableElement_translable_string_id_TranslatableString_id_fk";
--> statement-breakpoint
ALTER TABLE "Chunk" ADD COLUMN "vector_storage_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_translatable_string_id_TranslatableString_id_fk" FOREIGN KEY ("translatable_string_id") REFERENCES "public"."TranslatableString"("id") ON DELETE restrict ON UPDATE cascade;