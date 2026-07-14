CREATE TYPE "MemoryDeletionScope" AS ENUM('PROJECT', 'PERSONAL');--> statement-breakpoint
CREATE TYPE "MemoryPromotionStatus" AS ENUM('PENDING', 'PROMOTED', 'NO_PROJECT_MEMORY_TARGET');--> statement-breakpoint
CREATE TYPE "MemoryScope" AS ENUM('PROJECT', 'PERSONAL');--> statement-breakpoint
CREATE TYPE "QueueTaskStatus" AS ENUM('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TABLE "MemoryItemDeletion" (
	"id" serial PRIMARY KEY,
	"deleted_memory_item_id" integer NOT NULL,
	"memory_id" uuid,
	"project_id" uuid,
	"deleted_by_id" uuid,
	"scope" "MemoryDeletionScope" NOT NULL,
	"reason" text,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MemoryPromotionRecord" (
	"id" serial PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"source_translation_id" integer NOT NULL,
	"source_personal_memory_item_id" integer,
	"target_memory_id" uuid,
	"target_memory_item_id" integer,
	"approved_by_id" uuid,
	"status" "MemoryPromotionStatus" NOT NULL,
	"idempotency_key" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PersonalMemoryBinding" (
	"memory_id" uuid PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "RuntimeCacheEntry" (
	"namespace" text,
	"key" text,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "RuntimeCacheEntry_pkey" PRIMARY KEY("namespace","key")
);
--> statement-breakpoint
CREATE TABLE "RuntimeQueueTask" (
	"queue_name" text,
	"task_id" text,
	"payload" jsonb NOT NULL,
	"status" "QueueTaskStatus" DEFAULT 'PENDING'::"QueueTaskStatus" NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"leased_until" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "RuntimeQueueTask_pkey" PRIMARY KEY("queue_name","task_id")
);
--> statement-breakpoint
CREATE TABLE "RuntimeSessionEntry" (
	"key" text PRIMARY KEY,
	"fields" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Memory" ADD COLUMN "scope" "MemoryScope" DEFAULT 'PROJECT'::"MemoryScope" NOT NULL;--> statement-breakpoint
CREATE INDEX "MemoryItem_memory_id_index" ON "MemoryItem" ("memory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "MemoryItem_memory_id_translation_id_index" ON "MemoryItem" ("memory_id","translation_id");--> statement-breakpoint
CREATE INDEX "MemoryItemDeletion_deleted_memory_item_id_index" ON "MemoryItemDeletion" ("deleted_memory_item_id");--> statement-breakpoint
CREATE INDEX "MemoryItemDeletion_memory_id_index" ON "MemoryItemDeletion" ("memory_id");--> statement-breakpoint
CREATE INDEX "MemoryItemDeletion_project_id_index" ON "MemoryItemDeletion" ("project_id");--> statement-breakpoint
CREATE INDEX "MemoryPromotionRecord_project_id_index" ON "MemoryPromotionRecord" ("project_id");--> statement-breakpoint
CREATE INDEX "MemoryPromotionRecord_source_translation_id_index" ON "MemoryPromotionRecord" ("source_translation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "PersonalMemoryBinding_user_id_project_id_index" ON "PersonalMemoryBinding" ("user_id","project_id");--> statement-breakpoint
CREATE INDEX "PersonalMemoryBinding_project_id_index" ON "PersonalMemoryBinding" ("project_id");--> statement-breakpoint
CREATE INDEX "RuntimeCacheEntry_expires_at_index" ON "RuntimeCacheEntry" ("expires_at");--> statement-breakpoint
CREATE INDEX "RuntimeQueueTask_queue_name_status_enqueued_at_index" ON "RuntimeQueueTask" ("queue_name","status","enqueued_at");--> statement-breakpoint
CREATE INDEX "RuntimeQueueTask_queue_name_status_leased_until_index" ON "RuntimeQueueTask" ("queue_name","status","leased_until");--> statement-breakpoint
CREATE INDEX "RuntimeSessionEntry_expires_at_index" ON "RuntimeSessionEntry" ("expires_at");--> statement-breakpoint
ALTER TABLE "MemoryItemDeletion" ADD CONSTRAINT "MemoryItemDeletion_deleted_by_id_User_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryPromotionRecord" ADD CONSTRAINT "MemoryPromotionRecord_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryPromotionRecord" ADD CONSTRAINT "MemoryPromotionRecord_source_translation_id_Translation_id_fkey" FOREIGN KEY ("source_translation_id") REFERENCES "Translation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryPromotionRecord" ADD CONSTRAINT "MemoryPromotionRecord_WF24dGNt4MYZ_fkey" FOREIGN KEY ("source_personal_memory_item_id") REFERENCES "MemoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryPromotionRecord" ADD CONSTRAINT "MemoryPromotionRecord_target_memory_id_Memory_id_fkey" FOREIGN KEY ("target_memory_id") REFERENCES "Memory"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryPromotionRecord" ADD CONSTRAINT "MemoryPromotionRecord_target_memory_item_id_MemoryItem_id_fkey" FOREIGN KEY ("target_memory_item_id") REFERENCES "MemoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryPromotionRecord" ADD CONSTRAINT "MemoryPromotionRecord_approved_by_id_User_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PersonalMemoryBinding" ADD CONSTRAINT "PersonalMemoryBinding_memory_id_Memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PersonalMemoryBinding" ADD CONSTRAINT "PersonalMemoryBinding_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PersonalMemoryBinding" ADD CONSTRAINT "PersonalMemoryBinding_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;