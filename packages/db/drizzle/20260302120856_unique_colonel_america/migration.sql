CREATE TYPE "AgentMessageRole" AS ENUM('SYSTEM', 'USER', 'ASSISTANT', 'TOOL');--> statement-breakpoint
CREATE TYPE "AgentSessionStatus" AS ENUM('ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "PluginServiceType" ADD VALUE 'LLM_PROVIDER';--> statement-breakpoint
CREATE TABLE "AgentDefinition" (
	"id" serial PRIMARY KEY,
	"external_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
	"scope_type" "ScopeType" DEFAULT 'GLOBAL'::"ScopeType" NOT NULL,
	"scope_id" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"definition" jsonb NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AgentMessage" (
	"id" serial PRIMARY KEY,
	"session_id" integer NOT NULL,
	"role" "AgentMessageRole" NOT NULL,
	"content" text,
	"tool_call_id" text,
	"step_index" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AgentSession" (
	"id" serial PRIMARY KEY,
	"external_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
	"agent_definition_id" integer NOT NULL,
	"user_id" uuid,
	"status" "AgentSessionStatus" DEFAULT 'ACTIVE'::"AgentSessionStatus" NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AgentToolCall" (
	"id" serial PRIMARY KEY,
	"message_id" integer NOT NULL,
	"tool_call_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"arguments" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "AgentMessage_session_id_index" ON "AgentMessage" ("session_id");--> statement-breakpoint
CREATE INDEX "AgentMessage_step_index_index" ON "AgentMessage" ("step_index");--> statement-breakpoint
CREATE INDEX "AgentSession_agent_definition_id_index" ON "AgentSession" ("agent_definition_id");--> statement-breakpoint
CREATE INDEX "AgentSession_user_id_index" ON "AgentSession" ("user_id");--> statement-breakpoint
CREATE INDEX "AgentToolCall_message_id_index" ON "AgentToolCall" ("message_id");--> statement-breakpoint
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_session_id_AgentSession_id_fkey" FOREIGN KEY ("session_id") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_agent_definition_id_AgentDefinition_id_fkey" FOREIGN KEY ("agent_definition_id") REFERENCES "AgentDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_message_id_AgentMessage_id_fkey" FOREIGN KEY ("message_id") REFERENCES "AgentMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;