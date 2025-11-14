CREATE TYPE "public"."TranslatableElementContextType" AS ENUM('TEXT', 'JSON', 'FILE');--> statement-breakpoint
CREATE TABLE "TranslatableElementContext" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "TranslatableElementContextType" NOT NULL,
	"json_data" jsonb,
	"file_id" integer,
	"storage_provider_id" integer,
	"text_data" text,
	"translatable_element_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "TranslatableElementContext" ADD CONSTRAINT "TranslatableElementContext_translatable_element_id_TranslatableElement_id_fk" FOREIGN KEY ("translatable_element_id") REFERENCES "public"."TranslatableElement"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslatableElementContext" ADD CONSTRAINT "TranslatableElementContext_file_id_File_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."File"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslatableElementContext" ADD CONSTRAINT "TranslatableElementContext_storage_provider_id_PluginService_id_fk" FOREIGN KEY ("storage_provider_id") REFERENCES "public"."PluginService"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "TranslatableElementContext_translatable_element_id_index" ON "TranslatableElementContext" USING btree ("translatable_element_id");