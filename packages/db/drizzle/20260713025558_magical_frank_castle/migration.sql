ALTER TABLE "PluginConfig" ADD COLUMN "schema_version" text DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "PluginConfig" ADD COLUMN "schema_digest" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "PluginConfigInstance" ADD COLUMN "applied_version" text DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "PluginConfigInstance" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "PluginConfigInstance" DROP CONSTRAINT "PluginConfigInstance_creator_id_User_id_fkey", ADD CONSTRAINT "PluginConfigInstance_creator_id_User_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;