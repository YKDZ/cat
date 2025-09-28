ALTER TABLE "Project" DROP CONSTRAINT "Project_source_language_id_Language_id_fk";
--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD COLUMN "source_language_id" text;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_source_language_id_Language_id_fk" FOREIGN KEY ("source_language_id") REFERENCES "public"."Language"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Project" DROP COLUMN "source_language_id";