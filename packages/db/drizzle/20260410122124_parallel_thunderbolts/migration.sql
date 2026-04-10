CREATE TYPE "KanbanCardStatus" AS ENUM('OPEN', 'CLAIMED', 'IN_PROGRESS', 'REVIEW', 'DONE', 'FAILED', 'NEEDS_REWORK');--> statement-breakpoint
CREATE TABLE "KanbanBoard" (
	"id" serial PRIMARY KEY,
	"external_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
	"org_id" uuid,
	"name" text NOT NULL,
	"columns" jsonb DEFAULT '[]' NOT NULL,
	"linked_resource_type" text,
	"linked_resource_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "KanbanCard" (
	"id" serial PRIMARY KEY,
	"external_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
	"board_id" integer NOT NULL,
	"column_id" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"assignee_agent_id" integer,
	"assignee_user_id" uuid,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"due_date" timestamp with time zone,
	"labels" jsonb DEFAULT '[]' NOT NULL,
	"linked_resource_type" text,
	"linked_resource_id" text,
	"status" "KanbanCardStatus" DEFAULT 'OPEN'::"KanbanCardStatus" NOT NULL,
	"parent_card_id" integer,
	"batch_size" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ToolCallLog" (
	"id" serial PRIMARY KEY,
	"session_id" integer NOT NULL,
	"run_id" integer NOT NULL,
	"node_id" text,
	"tool_name" text NOT NULL,
	"arguments" jsonb DEFAULT '{}' NOT NULL,
	"result" jsonb,
	"error" text,
	"duration_ms" integer,
	"side_effect_type" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "AgentDefinition" ADD COLUMN "definition_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "AgentDefinition" ADD COLUMN "version" text DEFAULT '1.0.0' NOT NULL;--> statement-breakpoint
ALTER TABLE "AgentDefinition" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "AgentDefinition" ADD COLUMN "llm_config" jsonb;--> statement-breakpoint
ALTER TABLE "AgentDefinition" ADD COLUMN "tools" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "AgentDefinition" ADD COLUMN "prompt_config" jsonb;--> statement-breakpoint
ALTER TABLE "AgentDefinition" ADD COLUMN "constraints" jsonb;--> statement-breakpoint
ALTER TABLE "AgentDefinition" ADD COLUMN "security_policy" jsonb;--> statement-breakpoint
ALTER TABLE "AgentDefinition" ADD COLUMN "orchestration" jsonb;--> statement-breakpoint
ALTER TABLE "AgentDefinition" ADD COLUMN "content" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "AgentSession" ADD COLUMN "kanban_card_id" integer;--> statement-breakpoint
ALTER TABLE "AgentSession" ADD COLUMN "max_turns" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "AgentSession" ADD COLUMN "current_turn" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "AgentDefinition" DROP COLUMN "definition";--> statement-breakpoint
CREATE INDEX "KanbanBoard_org_id_index" ON "KanbanBoard" ("org_id");--> statement-breakpoint
CREATE INDEX "KanbanBoard_linked_resource_type_linked_resource_id_index" ON "KanbanBoard" ("linked_resource_type","linked_resource_id");--> statement-breakpoint
CREATE INDEX "KanbanCard_board_id_index" ON "KanbanCard" ("board_id");--> statement-breakpoint
CREATE INDEX "KanbanCard_status_index" ON "KanbanCard" ("status");--> statement-breakpoint
CREATE INDEX "KanbanCard_assignee_agent_id_index" ON "KanbanCard" ("assignee_agent_id");--> statement-breakpoint
CREATE INDEX "KanbanCard_board_id_status_index" ON "KanbanCard" ("board_id","status");--> statement-breakpoint
CREATE INDEX "ToolCallLog_session_id_index" ON "ToolCallLog" ("session_id");--> statement-breakpoint
CREATE INDEX "ToolCallLog_run_id_index" ON "ToolCallLog" ("run_id");--> statement-breakpoint
ALTER TABLE "KanbanBoard" ADD CONSTRAINT "KanbanBoard_org_id_Project_id_fkey" FOREIGN KEY ("org_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "KanbanCard" ADD CONSTRAINT "KanbanCard_board_id_KanbanBoard_id_fkey" FOREIGN KEY ("board_id") REFERENCES "KanbanBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "KanbanCard" ADD CONSTRAINT "KanbanCard_assignee_agent_id_AgentDefinition_id_fkey" FOREIGN KEY ("assignee_agent_id") REFERENCES "AgentDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "KanbanCard" ADD CONSTRAINT "KanbanCard_assignee_user_id_User_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ToolCallLog" ADD CONSTRAINT "ToolCallLog_session_id_AgentSession_id_fkey" FOREIGN KEY ("session_id") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ToolCallLog" ADD CONSTRAINT "ToolCallLog_run_id_AgentRun_id_fkey" FOREIGN KEY ("run_id") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;