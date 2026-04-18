CREATE TYPE "PullRequestType" AS ENUM('MANUAL', 'AUTO_TRANSLATE');--> statement-breakpoint
ALTER TYPE "EntityType" ADD VALUE 'auto_translation' BEFORE 'element';--> statement-breakpoint
CREATE TABLE "ProjectSetting" (
	"id" serial PRIMARY KEY,
	"project_id" uuid NOT NULL UNIQUE,
	"settings" jsonb DEFAULT '{"enableAutoTranslation":false,"autoTranslationLanguages":[],"ghostTextFallback":"none"}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "PullRequest" ADD COLUMN "type" "PullRequestType" DEFAULT 'MANUAL'::"PullRequestType" NOT NULL;--> statement-breakpoint
ALTER TABLE "PullRequest" ADD COLUMN "target_language_id" text;--> statement-breakpoint
CREATE INDEX "ProjectSetting_project_id_index" ON "ProjectSetting" ("project_id");--> statement-breakpoint
CREATE INDEX "PullRequest_project_id_type_target_language_id_index" ON "PullRequest" ("project_id","type","target_language_id");--> statement-breakpoint
CREATE UNIQUE INDEX "PullRequest_project_id_target_language_id_index" ON "PullRequest" ("project_id","target_language_id") WHERE "type" = 'AUTO_TRANSLATE' AND "status" NOT IN ('MERGED', 'CLOSED');--> statement-breakpoint
ALTER TABLE "ProjectSetting" ADD CONSTRAINT "ProjectSetting_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;