ALTER TYPE "PluginServiceType" ADD VALUE 'AUTH_FACTOR' BEFORE 'MFA_PROVIDER';--> statement-breakpoint
CREATE TABLE "AuthFlowLog" (
	"id" serial PRIMARY KEY,
	"flow_id" text NOT NULL,
	"flow_def_id" text NOT NULL,
	"user_id" uuid,
	"status" text NOT NULL,
	"final_node" text,
	"aal" integer,
	"ip" text,
	"user_agent" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idx_auth_flow_log_user" ON "AuthFlowLog" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_auth_flow_log_flow" ON "AuthFlowLog" ("flow_id");--> statement-breakpoint
CREATE INDEX "idx_auth_flow_log_created" ON "AuthFlowLog" ("created_at");--> statement-breakpoint
ALTER TABLE "AuthFlowLog" ADD CONSTRAINT "AuthFlowLog_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL;