CREATE TABLE "Chunk" (
	"id" serial PRIMARY KEY NOT NULL,
	"meta" jsonb,
	"chunk_set_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ChunkSet" (
	"id" serial PRIMARY KEY NOT NULL,
	"meta" jsonb,
	"vectorizer_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "TranslatableString" DROP CONSTRAINT "TranslatableString_embedding_id_Vector_id_fk";
--> statement-breakpoint
ALTER TABLE "MemoryItem" DROP CONSTRAINT "MemoryItem_source_embedding_id_Vector_id_fk";
--> statement-breakpoint
ALTER TABLE "MemoryItem" DROP CONSTRAINT "MemoryItem_translation_embedding_id_Vector_id_fk";
--> statement-breakpoint
ALTER TABLE "Translation" DROP CONSTRAINT "Translation_embedding_id_Vector_id_fk";
--> statement-breakpoint
ALTER TABLE "Vector" DROP CONSTRAINT "Vector_vectorizer_id_PluginService_id_fk";
--> statement-breakpoint
ALTER TABLE "TranslatableString" ADD COLUMN "chunk_set_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD COLUMN "source_chunk_set_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD COLUMN "translation_chunk_set_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "Translation" ADD COLUMN "chunk_set_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "Vector" ADD COLUMN "chunk_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_chunk_set_id_ChunkSet_id_fk" FOREIGN KEY ("chunk_set_id") REFERENCES "public"."ChunkSet"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ChunkSet" ADD CONSTRAINT "ChunkSet_vectorizer_id_PluginService_id_fk" FOREIGN KEY ("vectorizer_id") REFERENCES "public"."PluginService"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslatableString" ADD CONSTRAINT "TranslatableString_chunk_set_id_ChunkSet_id_fk" FOREIGN KEY ("chunk_set_id") REFERENCES "public"."ChunkSet"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_source_chunk_set_id_ChunkSet_id_fk" FOREIGN KEY ("source_chunk_set_id") REFERENCES "public"."ChunkSet"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_translation_chunk_set_id_ChunkSet_id_fk" FOREIGN KEY ("translation_chunk_set_id") REFERENCES "public"."ChunkSet"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_chunk_set_id_ChunkSet_id_fk" FOREIGN KEY ("chunk_set_id") REFERENCES "public"."ChunkSet"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Vector" ADD CONSTRAINT "Vector_chunk_id_Chunk_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."Chunk"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "Vector_vector_index" ON "Vector" USING hnsw ("vector" vector_cosine_ops);--> statement-breakpoint
ALTER TABLE "TranslatableString" DROP COLUMN "embedding_id";--> statement-breakpoint
ALTER TABLE "MemoryItem" DROP COLUMN "source_embedding_id";--> statement-breakpoint
ALTER TABLE "MemoryItem" DROP COLUMN "translation_embedding_id";--> statement-breakpoint
ALTER TABLE "Translation" DROP COLUMN "embedding_id";--> statement-breakpoint
ALTER TABLE "Vector" DROP COLUMN "meta";--> statement-breakpoint
ALTER TABLE "Vector" DROP COLUMN "vectorizer_id";