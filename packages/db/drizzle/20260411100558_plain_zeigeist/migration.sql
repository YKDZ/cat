CREATE TYPE "AsyncStatus" AS ENUM('READY', 'PENDING', 'FAILED');--> statement-breakpoint
CREATE TYPE "ChangeAction" AS ENUM('CREATE', 'UPDATE', 'DELETE');--> statement-breakpoint
CREATE TYPE "ChangesetEntryAsyncStatus" AS ENUM('ALL_READY', 'HAS_PENDING', 'HAS_FAILED');--> statement-breakpoint
CREATE TYPE "ChangeSetStatus" AS ENUM('PENDING', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'APPLIED', 'CONFLICT');--> statement-breakpoint
CREATE TYPE "EntityType" AS ENUM('translation', 'element', 'document', 'document_tree', 'comment', 'comment_reaction', 'term', 'term_concept', 'memory_item', 'project_settings', 'project_member', 'project_attributes', 'context');--> statement-breakpoint
CREATE TYPE "ReviewStatus" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CONFLICT');--> statement-breakpoint
CREATE TYPE "RiskLevel" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TABLE "Changeset" (
	"id" serial PRIMARY KEY,
	"external_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
	"project_id" uuid NOT NULL,
	"agent_run_id" integer,
	"linked_card_id" integer,
	"status" "ChangeSetStatus" DEFAULT 'PENDING'::"ChangeSetStatus" NOT NULL,
	"created_by" uuid,
	"reviewed_by" uuid,
	"summary" text,
	"async_status" "ChangesetEntryAsyncStatus",
	"reviewed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ChangesetEntry" (
	"id" serial PRIMARY KEY,
	"changeset_id" integer NOT NULL,
	"entity_type" "EntityType" NOT NULL,
	"entity_id" text NOT NULL,
	"action" "ChangeAction" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"field_path" text,
	"risk_level" "RiskLevel" DEFAULT 'LOW'::"RiskLevel" NOT NULL,
	"review_status" "ReviewStatus" DEFAULT 'PENDING'::"ReviewStatus" NOT NULL,
	"async_status" "AsyncStatus",
	"async_task_ids" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "EntitySnapshot" (
	"id" serial PRIMARY KEY,
	"external_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"level" text DEFAULT 'PROJECT' NOT NULL,
	"scope_filter" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "KanbanCardDep" (
	"card_id" integer,
	"depends_on_card_id" integer,
	"dep_type" text DEFAULT 'FINISH_TO_START' NOT NULL,
	CONSTRAINT "KanbanCardDep_pkey" PRIMARY KEY("card_id","depends_on_card_id")
);
--> statement-breakpoint
ALTER TABLE "KanbanCard" ADD COLUMN "linked_changeset_ids" jsonb;--> statement-breakpoint
CREATE INDEX "ChangesetEntry_changeset_id_index" ON "ChangesetEntry" ("changeset_id");--> statement-breakpoint
CREATE INDEX "ChangesetEntry_entity_type_entity_id_index" ON "ChangesetEntry" ("entity_type","entity_id");--> statement-breakpoint
ALTER TABLE "Changeset" ADD CONSTRAINT "Changeset_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "Changeset" ADD CONSTRAINT "Changeset_agent_run_id_AgentRun_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "AgentRun"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "Changeset" ADD CONSTRAINT "Changeset_linked_card_id_KanbanCard_id_fkey" FOREIGN KEY ("linked_card_id") REFERENCES "KanbanCard"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "Changeset" ADD CONSTRAINT "Changeset_created_by_User_id_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "Changeset" ADD CONSTRAINT "Changeset_reviewed_by_User_id_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ChangesetEntry" ADD CONSTRAINT "ChangesetEntry_changeset_id_Changeset_id_fkey" FOREIGN KEY ("changeset_id") REFERENCES "Changeset"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "EntitySnapshot" ADD CONSTRAINT "EntitySnapshot_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "EntitySnapshot" ADD CONSTRAINT "EntitySnapshot_created_by_User_id_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "KanbanCardDep" ADD CONSTRAINT "KanbanCardDep_card_id_KanbanCard_id_fkey" FOREIGN KEY ("card_id") REFERENCES "KanbanCard"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "KanbanCardDep" ADD CONSTRAINT "KanbanCardDep_depends_on_card_id_KanbanCard_id_fkey" FOREIGN KEY ("depends_on_card_id") REFERENCES "KanbanCard"("id") ON DELETE CASCADE;