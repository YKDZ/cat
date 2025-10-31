ALTER TABLE "Translation" DROP CONSTRAINT "Translation_chunk_set_id_ChunkSet_id_fk";
--> statement-breakpoint
ALTER TABLE "Translation" DROP COLUMN "chunk_set_id";