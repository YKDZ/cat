CREATE TYPE "CrossReferenceSourceType" AS ENUM('issue', 'pr', 'issue_comment');--> statement-breakpoint
CREATE TYPE "CrossReferenceTargetType" AS ENUM('issue', 'pr');--> statement-breakpoint
CREATE TYPE "EntityBranchStatus" AS ENUM('ACTIVE', 'MERGED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "IssueCommentTargetType" AS ENUM('issue', 'pr');--> statement-breakpoint
CREATE TYPE "IssueStatus" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "PullRequestStatus" AS ENUM('DRAFT', 'OPEN', 'REVIEW', 'CHANGES_REQUESTED', 'MERGED', 'CLOSED');--> statement-breakpoint
ALTER TYPE "Relation" ADD VALUE 'direct_editor';--> statement-breakpoint
ALTER TYPE "Relation" ADD VALUE 'isolation_forced';--> statement-breakpoint
CREATE TABLE "CrossReference" (
	"id" serial PRIMARY KEY,
	"source_type" "CrossReferenceSourceType" NOT NULL,
	"source_id" integer NOT NULL,
	"target_type" "CrossReferenceTargetType" NOT NULL,
	"target_id" integer NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "CrossReference_source_type_source_id_target_type_target_id_unique" UNIQUE("source_type","source_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "EntityBranch" (
	"id" serial PRIMARY KEY,
	"external_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "EntityBranchStatus" DEFAULT 'ACTIVE'::"EntityBranchStatus" NOT NULL,
	"has_conflicts" boolean DEFAULT false NOT NULL,
	"base_changeset_id" integer,
	"created_by" uuid,
	"created_by_agent_id" integer,
	"merged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Issue" (
	"id" serial PRIMARY KEY,
	"external_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" "IssueStatus" DEFAULT 'OPEN'::"IssueStatus" NOT NULL,
	"author_id" uuid,
	"author_agent_id" integer,
	"assignees" jsonb DEFAULT '[]' NOT NULL,
	"claim_policy" jsonb,
	"parent_issue_id" integer,
	"closed_at" timestamp with time zone,
	"closed_by_pr_id" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "IssueComment" (
	"id" serial PRIMARY KEY,
	"external_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
	"thread_id" integer NOT NULL,
	"body" text NOT NULL,
	"author_id" uuid,
	"author_agent_id" integer,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "IssueCommentThread" (
	"id" serial PRIMARY KEY,
	"external_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
	"target_type" "IssueCommentTargetType" NOT NULL,
	"target_id" integer NOT NULL,
	"is_review_thread" boolean DEFAULT false NOT NULL,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"review_context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "IssueLabel" (
	"issue_id" integer,
	"label" text,
	CONSTRAINT "IssueLabel_pkey" PRIMARY KEY("issue_id","label")
);
--> statement-breakpoint
CREATE TABLE "ProjectSequence" (
	"id" serial PRIMARY KEY,
	"project_id" uuid NOT NULL UNIQUE,
	"next_value" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PullRequest" (
	"id" serial PRIMARY KEY,
	"external_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" "PullRequestStatus" DEFAULT 'DRAFT'::"PullRequestStatus" NOT NULL,
	"author_id" uuid,
	"author_agent_id" integer,
	"branch_id" integer NOT NULL,
	"issue_id" integer,
	"reviewers" jsonb DEFAULT '[]' NOT NULL,
	"merged_at" timestamp with time zone,
	"merged_by" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "AgentSession" ADD COLUMN "issue_id" integer;--> statement-breakpoint
ALTER TABLE "AgentSession" ADD COLUMN "pull_request_id" integer;--> statement-breakpoint
ALTER TABLE "Changeset" ADD COLUMN "pull_request_id" integer;--> statement-breakpoint
ALTER TABLE "Changeset" ADD COLUMN "branch_id" integer;--> statement-breakpoint
ALTER TABLE "Project" ADD COLUMN "features" jsonb DEFAULT '{"issues":false,"pullRequests":false}' NOT NULL;--> statement-breakpoint
CREATE INDEX "CrossReference_target_type_target_id_index" ON "CrossReference" ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "CrossReference_source_type_source_id_index" ON "CrossReference" ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "EntityBranch_project_id_index" ON "EntityBranch" ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "EntityBranch_project_id_name_index" ON "EntityBranch" ("project_id","name");--> statement-breakpoint
CREATE INDEX "EntityBranch_status_index" ON "EntityBranch" ("status");--> statement-breakpoint
CREATE INDEX "Issue_project_id_index" ON "Issue" ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "Issue_project_id_number_index" ON "Issue" ("project_id","number");--> statement-breakpoint
CREATE INDEX "Issue_project_id_status_index" ON "Issue" ("project_id","status");--> statement-breakpoint
CREATE INDEX "Issue_parent_issue_id_index" ON "Issue" ("parent_issue_id");--> statement-breakpoint
CREATE INDEX "IssueComment_thread_id_created_at_index" ON "IssueComment" ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "IssueCommentThread_target_type_target_id_index" ON "IssueCommentThread" ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "IssueCommentThread_target_type_target_id_is_review_thread_index" ON "IssueCommentThread" ("target_type","target_id","is_review_thread");--> statement-breakpoint
CREATE INDEX "IssueLabel_label_index" ON "IssueLabel" ("label");--> statement-breakpoint
CREATE UNIQUE INDEX "ProjectSequence_project_id_index" ON "ProjectSequence" ("project_id");--> statement-breakpoint
CREATE INDEX "PullRequest_project_id_index" ON "PullRequest" ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "PullRequest_project_id_number_index" ON "PullRequest" ("project_id","number");--> statement-breakpoint
CREATE INDEX "PullRequest_branch_id_index" ON "PullRequest" ("branch_id");--> statement-breakpoint
CREATE INDEX "PullRequest_issue_id_index" ON "PullRequest" ("issue_id");--> statement-breakpoint
CREATE INDEX "PullRequest_project_id_status_index" ON "PullRequest" ("project_id","status");--> statement-breakpoint
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_issue_id_Issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "Issue"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_pull_request_id_PullRequest_id_fkey" FOREIGN KEY ("pull_request_id") REFERENCES "PullRequest"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "Changeset" ADD CONSTRAINT "Changeset_pull_request_id_PullRequest_id_fkey" FOREIGN KEY ("pull_request_id") REFERENCES "PullRequest"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "Changeset" ADD CONSTRAINT "Changeset_branch_id_EntityBranch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "EntityBranch"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "CrossReference" ADD CONSTRAINT "CrossReference_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "EntityBranch" ADD CONSTRAINT "EntityBranch_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "EntityBranch" ADD CONSTRAINT "EntityBranch_created_by_User_id_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "EntityBranch" ADD CONSTRAINT "EntityBranch_created_by_agent_id_AgentDefinition_id_fkey" FOREIGN KEY ("created_by_agent_id") REFERENCES "AgentDefinition"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_author_id_User_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_author_agent_id_AgentDefinition_id_fkey" FOREIGN KEY ("author_agent_id") REFERENCES "AgentDefinition"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_parent_issue_id_Issue_id_fkey" FOREIGN KEY ("parent_issue_id") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_thread_id_IssueCommentThread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "IssueCommentThread"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_author_id_User_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_author_agent_id_AgentDefinition_id_fkey" FOREIGN KEY ("author_agent_id") REFERENCES "AgentDefinition"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "IssueLabel" ADD CONSTRAINT "IssueLabel_issue_id_Issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "Issue"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ProjectSequence" ADD CONSTRAINT "ProjectSequence_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_author_id_User_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_author_agent_id_AgentDefinition_id_fkey" FOREIGN KEY ("author_agent_id") REFERENCES "AgentDefinition"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_branch_id_EntityBranch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "EntityBranch"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_issue_id_Issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "Issue"("id") ON DELETE SET NULL;