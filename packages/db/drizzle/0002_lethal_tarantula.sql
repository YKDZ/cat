ALTER TABLE "TranslatableElement" DROP CONSTRAINT "TranslatableElement_project_id_Project_id_fk";
--> statement-breakpoint
ALTER TABLE "TranslatableElement" ALTER COLUMN "document_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "TranslatableElement" DROP COLUMN "project_id";