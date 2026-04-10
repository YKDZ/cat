ALTER TABLE "TranslatableString" RENAME TO "VectorizedString";--> statement-breakpoint
ALTER TABLE "TranslatableElement" RENAME COLUMN "translatable_string_id" TO "vectorized_string_id";--> statement-breakpoint
ALTER INDEX "idx_translatable_string_value_trgm" RENAME TO "idx_vectorized_string_value_trgm";--> statement-breakpoint
ALTER INDEX "idx_translatable_string_language" RENAME TO "idx_vectorized_string_language";--> statement-breakpoint
ALTER TABLE "VectorizedString" ADD COLUMN "status" text DEFAULT 'PENDING_VECTORIZE' NOT NULL;--> statement-breakpoint
ALTER TABLE "VectorizedString" ALTER COLUMN "chunk_set_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_vectorized_string_status" ON "VectorizedString" ("status");