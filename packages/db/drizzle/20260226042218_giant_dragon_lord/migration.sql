ALTER TABLE "TermConceptSubject" ADD COLUMN "default_definition" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "PluginService" ALTER COLUMN "service_type" SET DATA TYPE text;--> statement-breakpoint
