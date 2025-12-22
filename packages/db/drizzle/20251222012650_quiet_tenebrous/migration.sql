CREATE TABLE "PluginComponent" (
	"id" serial PRIMARY KEY,
	"component_id" text NOT NULL,
	"slot" text NOT NULL,
	"url" text NOT NULL,
	"plugin_installation_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "PluginComponent" ADD CONSTRAINT "PluginComponent_eAfVTu1efahR_fkey" FOREIGN KEY ("plugin_installation_id") REFERENCES "PluginInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;