ALTER TABLE "TranslatableElement" DROP CONSTRAINT "TranslatableElement_embedding_id_Vector_id_fk";
--> statement-breakpoint
ALTER TABLE "TranslatableElement" DROP CONSTRAINT "TranslatableElement_language_id_Language_id_fk";
--> statement-breakpoint
ALTER TABLE "TranslatableElement" DROP COLUMN "embedding_id";--> statement-breakpoint
ALTER TABLE "TranslatableElement" DROP COLUMN "language_id";