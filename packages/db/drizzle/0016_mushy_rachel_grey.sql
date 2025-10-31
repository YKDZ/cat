ALTER TABLE "ChunkSet" DROP CONSTRAINT "ChunkSet_vectorizer_id_PluginService_id_fk";
--> statement-breakpoint
ALTER TABLE "Chunk" ADD COLUMN "vectorizer_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_vectorizer_id_PluginService_id_fk" FOREIGN KEY ("vectorizer_id") REFERENCES "public"."PluginService"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ChunkSet" DROP COLUMN "vectorizer_id";