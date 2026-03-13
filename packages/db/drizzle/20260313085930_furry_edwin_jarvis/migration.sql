CREATE TABLE "AgentEvent" (
	"id" serial PRIMARY KEY,
	"run_id" integer NOT NULL,
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"parent_event_id" uuid,
	"node_id" text,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "AgentEvent_run_id_event_id_unique" UNIQUE("run_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "AgentExternalOutput" (
	"id" serial PRIMARY KEY,
	"run_id" integer NOT NULL,
	"node_id" text NOT NULL,
	"output_type" text NOT NULL,
	"output_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "AgentExternalOutput_run_id_output_key_idempotency_key_unique" UNIQUE("run_id","output_key","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "AgentRun" (
	"id" serial PRIMARY KEY,
	"external_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
	"session_id" integer NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"graph_definition" jsonb NOT NULL,
	"blackboard_snapshot" jsonb,
	"current_node_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "AgentSession" ADD COLUMN "current_run_id" integer;--> statement-breakpoint
CREATE INDEX "AgentEvent_run_id_index" ON "AgentEvent" ("run_id");--> statement-breakpoint
CREATE INDEX "AgentEvent_type_index" ON "AgentEvent" ("type");--> statement-breakpoint
CREATE INDEX "AgentExternalOutput_run_id_index" ON "AgentExternalOutput" ("run_id");--> statement-breakpoint
CREATE INDEX "AgentExternalOutput_node_id_index" ON "AgentExternalOutput" ("node_id");--> statement-breakpoint
CREATE INDEX "AgentRun_session_id_index" ON "AgentRun" ("session_id");--> statement-breakpoint
CREATE INDEX "AgentRun_status_index" ON "AgentRun" ("status");--> statement-breakpoint
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_run_id_AgentRun_id_fkey" FOREIGN KEY ("run_id") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AgentExternalOutput" ADD CONSTRAINT "AgentExternalOutput_run_id_AgentRun_id_fkey" FOREIGN KEY ("run_id") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_session_id_AgentSession_id_fkey" FOREIGN KEY ("session_id") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;