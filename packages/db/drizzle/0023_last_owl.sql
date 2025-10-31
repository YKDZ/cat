ALTER TABLE "TranslatableString" DROP CONSTRAINT "TranslatableString_project_id_Project_id_fk";
--> statement-breakpoint
DROP INDEX "TranslatableString_value_language_id_project_id_index";--> statement-breakpoint
CREATE UNIQUE INDEX "TranslatableString_value_language_id_index" ON "TranslatableString" USING btree ("value" text_ops,"language_id" text_ops);--> statement-breakpoint
ALTER TABLE "TranslatableString" DROP COLUMN "project_id";