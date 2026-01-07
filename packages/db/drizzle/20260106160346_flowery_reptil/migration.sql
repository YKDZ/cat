ALTER TYPE "PluginServiceType" ADD VALUE 'TOKENIZER';--> statement-breakpoint
CREATE TABLE "QaResult" (
	"id" serial PRIMARY KEY,
	"translation_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "QaResultItem" (
	"id" serial PRIMARY KEY,
	"meta" jsonb,
	"result_id" integer NOT NULL,
	"checker_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "QaResult" ADD CONSTRAINT "QaResult_translation_id_Translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "Translation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "QaResultItem" ADD CONSTRAINT "QaResultItem_result_id_QaResult_id_fkey" FOREIGN KEY ("result_id") REFERENCES "QaResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "QaResultItem" ADD CONSTRAINT "QaResultItem_checker_id_PluginService_id_fkey" FOREIGN KEY ("checker_id") REFERENCES "PluginService"("id") ON DELETE CASCADE ON UPDATE CASCADE;