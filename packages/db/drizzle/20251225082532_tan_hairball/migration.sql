CREATE TABLE "MFAProvider" (
	"id" serial PRIMARY KEY,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"user_id" uuid NOT NULL,
	"mfa_service_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "MFAProvider" ADD CONSTRAINT "MFAProvider_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MFAProvider" ADD CONSTRAINT "MFAProvider_mfa_service_id_PluginService_id_fkey" FOREIGN KEY ("mfa_service_id") REFERENCES "PluginService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;