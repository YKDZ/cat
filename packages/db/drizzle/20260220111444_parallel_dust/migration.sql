CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "idx_translatable_string_value_trgm" ON "TranslatableString" USING gin ("value" gin_trgm_ops);