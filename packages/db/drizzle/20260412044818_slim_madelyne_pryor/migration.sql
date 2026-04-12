CREATE TYPE "RecallQuerySide" AS ENUM('SOURCE', 'TRANSLATION');--> statement-breakpoint
CREATE TYPE "RecallVariantType" AS ENUM('SURFACE', 'CASE_FOLDED', 'LEMMA', 'TOKEN_TEMPLATE', 'FRAGMENT');--> statement-breakpoint
CREATE TABLE "MemoryRecallVariant" (
	"id" serial PRIMARY KEY,
	"memory_item_id" integer NOT NULL,
	"memory_id" uuid NOT NULL,
	"language_id" text NOT NULL,
	"query_side" "RecallQuerySide" NOT NULL,
	"text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"variant_type" "RecallVariantType" NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TermRecallVariant" (
	"id" serial PRIMARY KEY,
	"concept_id" integer NOT NULL,
	"language_id" text NOT NULL,
	"text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"variant_type" "RecallVariantType" NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "MemoryRecallVariant_memory_item_id_index" ON "MemoryRecallVariant" ("memory_item_id");--> statement-breakpoint
CREATE INDEX "MemoryRecallVariant_memory_id_index" ON "MemoryRecallVariant" ("memory_id");--> statement-breakpoint
CREATE INDEX "MemoryRecallVariant_language_id_index" ON "MemoryRecallVariant" ("language_id");--> statement-breakpoint
CREATE INDEX "idx_memory_recall_variant_text_trgm" ON "MemoryRecallVariant" USING gin ("normalized_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "TermRecallVariant_concept_id_index" ON "TermRecallVariant" ("concept_id");--> statement-breakpoint
CREATE INDEX "TermRecallVariant_language_id_index" ON "TermRecallVariant" ("language_id");--> statement-breakpoint
CREATE INDEX "idx_term_recall_variant_text_trgm" ON "TermRecallVariant" USING gin ("normalized_text" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "MemoryRecallVariant" ADD CONSTRAINT "MemoryRecallVariant_memory_item_id_MemoryItem_id_fkey" FOREIGN KEY ("memory_item_id") REFERENCES "MemoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryRecallVariant" ADD CONSTRAINT "MemoryRecallVariant_memory_id_Memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryRecallVariant" ADD CONSTRAINT "MemoryRecallVariant_language_id_Language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermRecallVariant" ADD CONSTRAINT "TermRecallVariant_concept_id_TermConcept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "TermConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermRecallVariant" ADD CONSTRAINT "TermRecallVariant_language_id_Language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;