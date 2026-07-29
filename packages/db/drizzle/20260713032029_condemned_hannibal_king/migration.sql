ALTER TABLE "PluginConfig" ADD COLUMN "is_available" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "PluginConfig" ALTER COLUMN "schema_version" SET DEFAULT 'legacy-unverified';--> statement-breakpoint
ALTER TABLE "PluginConfigInstance" ALTER COLUMN "applied_version" SET DEFAULT 'legacy-unverified';