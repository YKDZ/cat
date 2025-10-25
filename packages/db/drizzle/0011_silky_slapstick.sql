CREATE TABLE "TranslatableString" (
	"id" serial PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"language_id" text NOT NULL,
	"embedding_id" integer NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD COLUMN "translable_string_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "TranslatableString" ADD CONSTRAINT "TranslatableString_embedding_id_Vector_id_fk" FOREIGN KEY ("embedding_id") REFERENCES "public"."Vector"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslatableString" ADD CONSTRAINT "TranslatableString_project_id_Project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_translable_string_id_TranslatableString_id_fk" FOREIGN KEY ("translable_string_id") REFERENCES "public"."TranslatableString"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Vector" ADD CONSTRAINT "Vector_vectorizer_id_PluginService_id_fk" FOREIGN KEY ("vectorizer_id") REFERENCES "public"."PluginService"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslatableElement" DROP COLUMN "value";