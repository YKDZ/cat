CREATE INDEX "idx_translatable_element_document_sort" ON "TranslatableElement" ("document_id","sort_index");--> statement-breakpoint
CREATE INDEX "idx_translatable_string_language" ON "TranslatableString" ("language_id");--> statement-breakpoint
CREATE INDEX "idx_translation_element" ON "Translation" ("translatable_element_id");