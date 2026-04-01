CREATE TABLE "ApiKey" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"user_id" uuid NOT NULL,
	"scopes" jsonb DEFAULT '[]' NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "LoginAttempt" (
	"id" serial PRIMARY KEY,
	"identifier" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"success" boolean NOT NULL,
	"fail_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SessionRecord" (
	"id" text PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"ip" text,
	"user_agent" text,
	"auth_provider_id" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_api_key_user" ON "ApiKey" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_api_key_hash" ON "ApiKey" ("key_hash");--> statement-breakpoint
CREATE INDEX "idx_api_key_prefix" ON "ApiKey" ("key_prefix");--> statement-breakpoint
CREATE INDEX "idx_login_attempt_ip" ON "LoginAttempt" ("ip");--> statement-breakpoint
CREATE INDEX "idx_login_attempt_identifier" ON "LoginAttempt" ("identifier");--> statement-breakpoint
CREATE INDEX "idx_login_attempt_created" ON "LoginAttempt" ("created_at");--> statement-breakpoint
CREATE INDEX "idx_session_record_user" ON "SessionRecord" ("user_id");--> statement-breakpoint
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "SessionRecord" ADD CONSTRAINT "SessionRecord_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE;