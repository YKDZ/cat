ALTER TABLE "TranslatableElement" RENAME COLUMN "source_language_id" TO "language_id";--> statement-breakpoint
ALTER TABLE "TranslatableElement" DROP CONSTRAINT "TranslatableElement_source_language_id_Language_id_fk";
--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_language_id_Language_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."Language"("id") ON DELETE restrict ON UPDATE cascade;