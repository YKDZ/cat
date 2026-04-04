CREATE TYPE "MessageCategory" AS ENUM('SYSTEM', 'COMMENT_REPLY', 'TRANSLATION', 'PROJECT', 'QA');--> statement-breakpoint
CREATE TYPE "MessageChannel" AS ENUM('IN_APP', 'EMAIL');--> statement-breakpoint
CREATE TYPE "NotificationStatus" AS ENUM('UNREAD', 'READ', 'ARCHIVED');--> statement-breakpoint
ALTER TYPE "PluginServiceType" ADD VALUE 'EMAIL_PROVIDER';--> statement-breakpoint
CREATE TABLE "Notification" (
	"id" serial PRIMARY KEY,
	"recipient_id" uuid NOT NULL,
	"category" "MessageCategory" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb,
	"status" "NotificationStatus" DEFAULT 'UNREAD'::"NotificationStatus" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "UserMessagePreference" (
	"id" serial PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"category" "MessageCategory" NOT NULL,
	"channel" "MessageChannel" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "UserMessagePreference_user_id_category_channel_unique" UNIQUE("user_id","category","channel")
);
--> statement-breakpoint
CREATE INDEX "Notification_recipient_id_index" ON "Notification" ("recipient_id");--> statement-breakpoint
CREATE INDEX "Notification_status_index" ON "Notification" ("status");--> statement-breakpoint
CREATE INDEX "Notification_recipient_id_status_index" ON "Notification" ("recipient_id","status");--> statement-breakpoint
CREATE INDEX "UserMessagePreference_user_id_index" ON "UserMessagePreference" ("user_id");--> statement-breakpoint
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipient_id_User_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "UserMessagePreference" ADD CONSTRAINT "UserMessagePreference_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;