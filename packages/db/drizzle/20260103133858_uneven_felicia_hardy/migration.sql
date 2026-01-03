ALTER TABLE "TranslatableElement" DROP CONSTRAINT "TranslatableElement_document_version_id_DocumentVersion_id_fkey";--> statement-breakpoint
DROP TABLE "DocumentVersion";--> statement-breakpoint
ALTER TABLE "TranslatableElement" DROP COLUMN "document_version_id";