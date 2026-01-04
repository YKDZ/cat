DROP TABLE "TranslationApprovement";--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD COLUMN "approved_translation_id" integer;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_approved_translation_id_Translation_id_fkey" FOREIGN KEY ("approved_translation_id") REFERENCES "Translation"("id") ON DELETE SET NULL ON UPDATE CASCADE;