ALTER TABLE "MemoryItem" ADD COLUMN "source_template" text;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD COLUMN "translation_template" text;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD COLUMN "slot_mapping" jsonb;