CREATE TYPE "AgentDefinitionType" AS ENUM('GENERAL', 'GHOST_TEXT', 'WORKFLOW');--> statement-breakpoint
CREATE TYPE "AgentSessionStatus" AS ENUM('ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "AgentSessionTrustPolicy" AS ENUM('CONFIRM_ALL', 'TRUST_SESSION');--> statement-breakpoint
CREATE TYPE "AgentToolConfirmationStatus" AS ENUM('AUTO_ALLOWED', 'USER_APPROVED', 'USER_DENIED');--> statement-breakpoint
CREATE TYPE "AgentToolTarget" AS ENUM('SERVER', 'CLIENT');--> statement-breakpoint
CREATE TYPE "AsyncStatus" AS ENUM('READY', 'PENDING', 'FAILED');--> statement-breakpoint
CREATE TYPE "ChangeAction" AS ENUM('CREATE', 'UPDATE', 'DELETE');--> statement-breakpoint
CREATE TYPE "ChangesetEntryAsyncStatus" AS ENUM('ALL_READY', 'HAS_PENDING', 'HAS_FAILED');--> statement-breakpoint
CREATE TYPE "ChangeSetStatus" AS ENUM('PENDING', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'APPLIED', 'CONFLICT');--> statement-breakpoint
CREATE TYPE "CommentReactionType" AS ENUM('+1', '-1', 'LAUGH', 'HOORAY', 'CONFUSED', 'HEART', 'ROCKET', 'EYES');--> statement-breakpoint
CREATE TYPE "CommentTargetType" AS ENUM('TRANSLATION', 'ELEMENT');--> statement-breakpoint
CREATE TYPE "CrossReferenceSourceType" AS ENUM('issue', 'pr', 'issue_comment');--> statement-breakpoint
CREATE TYPE "CrossReferenceTargetType" AS ENUM('issue', 'pr');--> statement-breakpoint
CREATE TYPE "EntityBranchStatus" AS ENUM('ACTIVE', 'MERGED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "EntityType" AS ENUM('translation', 'auto_translation', 'element', 'document', 'document_tree', 'comment', 'comment_reaction', 'term', 'term_concept', 'memory_item', 'project_settings', 'project_member', 'project_attributes', 'context', 'project', 'issue');--> statement-breakpoint
CREATE TYPE "IssueCommentTargetType" AS ENUM('issue', 'pr');--> statement-breakpoint
CREATE TYPE "IssueStatus" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "MessageCategory" AS ENUM('SYSTEM', 'COMMENT_REPLY', 'TRANSLATION', 'PROJECT', 'QA');--> statement-breakpoint
CREATE TYPE "MessageChannel" AS ENUM('IN_APP', 'EMAIL');--> statement-breakpoint
CREATE TYPE "NotificationStatus" AS ENUM('UNREAD', 'READ', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "ObjectType" AS ENUM('system', 'project', 'document', 'element', 'glossary', 'memory', 'term', 'translation', 'comment', 'plugin', 'setting', 'task', 'agent_definition', 'user');--> statement-breakpoint
CREATE TYPE "PermissionAction" AS ENUM('check', 'grant', 'revoke');--> statement-breakpoint
CREATE TYPE "PluginServiceType" AS ENUM('AUTH_FACTOR', 'STORAGE_PROVIDER', 'FILE_IMPORTER', 'FILE_EXPORTER', 'TRANSLATION_ADVISOR', 'TEXT_VECTORIZER', 'VECTOR_STORAGE', 'QA_CHECKER', 'TOKENIZER', 'LLM_PROVIDER', 'RERANK_PROVIDER', 'AGENT_TOOL_PROVIDER', 'AGENT_CONTEXT_PROVIDER', 'NLP_WORD_SEGMENTER', 'EMAIL_PROVIDER');--> statement-breakpoint
CREATE TYPE "PullRequestStatus" AS ENUM('DRAFT', 'OPEN', 'REVIEW', 'CHANGES_REQUESTED', 'MERGED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "PullRequestType" AS ENUM('MANUAL', 'AUTO_TRANSLATE');--> statement-breakpoint
CREATE TYPE "RecallQuerySide" AS ENUM('SOURCE', 'TRANSLATION');--> statement-breakpoint
CREATE TYPE "RecallVariantType" AS ENUM('SURFACE', 'CASE_FOLDED', 'LEMMA', 'TOKEN_TEMPLATE', 'FRAGMENT');--> statement-breakpoint
CREATE TYPE "Relation" AS ENUM('superadmin', 'admin', 'owner', 'editor', 'viewer', 'member', 'direct_editor', 'isolation_forced');--> statement-breakpoint
CREATE TYPE "ResourceType" AS ENUM('PROJECT', 'DOCUMENT', 'ELEMENT', 'COMMENT', 'TERM', 'PLUGIN', 'GLOSSARY', 'MEMORY', 'SETTING', 'TASK', 'TRANSLATION', 'USER');--> statement-breakpoint
CREATE TYPE "ReviewStatus" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CONFLICT');--> statement-breakpoint
CREATE TYPE "RiskLevel" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "ScopeType" AS ENUM('GLOBAL', 'PROJECT', 'USER');--> statement-breakpoint
CREATE TYPE "SubjectType" AS ENUM('user', 'role', 'agent');--> statement-breakpoint
CREATE TYPE "TaskStatus" AS ENUM('COMPLETED', 'PENDING', 'FAILED');--> statement-breakpoint
CREATE TYPE "TermStatus" AS ENUM('NOT_SPECIFIED', 'PREFERRED', 'ADMITTED', 'NOT_RECOMMENDED', 'OBSOLETE');--> statement-breakpoint
CREATE TYPE "TermType" AS ENUM('NOT_SPECIFIED', 'FULL_FORM', 'ACRONYM', 'ABBREVIATION', 'SHORT_FORM', 'VARIANT', 'PHRASE');--> statement-breakpoint
CREATE TYPE "TranslatableElementContextType" AS ENUM('TEXT', 'JSON', 'FILE', 'MARKDOWN', 'URL', 'IMAGE');--> statement-breakpoint
CREATE TABLE "Account" (
	"id" serial PRIMARY KEY,
	"provider_issuer" text NOT NULL,
	"provided_account_id" text NOT NULL,
	"meta" jsonb,
	"user_id" uuid NOT NULL,
	"auth_provider_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "Account_provider_issuer_provided_account_id_unique" UNIQUE("provider_issuer","provided_account_id")
);
--> statement-breakpoint
CREATE TABLE "AgentDefinition" (
	"id" serial PRIMARY KEY,
	"external_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
	"scope_type" "ScopeType" DEFAULT 'GLOBAL'::"ScopeType" NOT NULL,
	"scope_id" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" "AgentDefinitionType" DEFAULT 'GENERAL'::"AgentDefinitionType" NOT NULL,
	"definition_id" text DEFAULT '' NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"icon" text,
	"llm_config" jsonb,
	"tools" jsonb DEFAULT '[]' NOT NULL,
	"prompt_config" jsonb,
	"constraints" jsonb,
	"security_policy" jsonb,
	"orchestration" jsonb,
	"content" text DEFAULT '' NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"deduplication_key" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "AgentSession" (
	"id" serial PRIMARY KEY,
	"external_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
	"agent_definition_id" integer NOT NULL,
	"user_id" uuid,
	"project_id" uuid,
	"status" "AgentSessionStatus" DEFAULT 'ACTIVE'::"AgentSessionStatus" NOT NULL,
	"current_run_id" integer,
	"issue_id" integer,
	"pull_request_id" integer,
	"max_turns" integer DEFAULT 50 NOT NULL,
	"current_turn" integer DEFAULT 0 NOT NULL,
	"trust_policy" "AgentSessionTrustPolicy" DEFAULT 'CONFIRM_ALL'::"AgentSessionTrustPolicy" NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "AuthAuditLog" (
	"id" serial PRIMARY KEY,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"subject_type" "SubjectType" NOT NULL,
	"subject_id" text NOT NULL,
	"action" "PermissionAction" NOT NULL,
	"object_type" "ObjectType" NOT NULL,
	"object_id" text NOT NULL,
	"relation" "Relation" NOT NULL,
	"result" boolean NOT NULL,
	"trace_id" text,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
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
CREATE TABLE "Blob" (
	"id" serial PRIMARY KEY,
	"key" text NOT NULL,
	"storage_provider_id" integer NOT NULL,
	"reference_count" integer DEFAULT 1 NOT NULL,
	"hash" bytea UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "Blob_storage_provider_id_key_unique" UNIQUE("storage_provider_id","key"),
	CONSTRAINT "hash_check" CHECK (octet_length("hash") = 32),
	CONSTRAINT "referenceCount_check" CHECK ("reference_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "Changeset" (
	"id" serial PRIMARY KEY,
	"external_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
	"project_id" uuid NOT NULL,
	"agent_run_id" integer,
	"pull_request_id" integer,
	"branch_id" integer,
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
CREATE TABLE "Chunk" (
	"id" serial PRIMARY KEY,
	"meta" jsonb,
	"chunk_set_id" integer NOT NULL,
	"vectorizer_id" integer NOT NULL,
	"vector_storage_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ChunkSet" (
	"id" serial PRIMARY KEY,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Comment" (
	"id" serial PRIMARY KEY,
	"target_type" "CommentTargetType" NOT NULL,
	"target_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"parent_comment_id" integer,
	"root_comment_id" integer,
	"language_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "CommentReaction" (
	"id" serial PRIMARY KEY,
	"comment_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "CommentReactionType" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "CommentReaction_comment_id_user_id_unique" UNIQUE("comment_id","user_id")
);
--> statement-breakpoint
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
CREATE TABLE "Document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text,
	"project_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"file_handler_id" integer,
	"file_id" integer,
	"is_directory" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "DocumentClosure" (
	"ancestor" uuid,
	"descendant" uuid,
	"depth" integer NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "DocumentClosure_pkey" PRIMARY KEY("ancestor","descendant")
);
--> statement-breakpoint
CREATE TABLE "DocumentToTask" (
	"document_id" uuid,
	"task_id" uuid,
	CONSTRAINT "DocumentToTask_pkey" PRIMARY KEY("document_id","task_id")
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
CREATE TABLE "File" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blob_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Glossary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "GlossaryToProject" (
	"glossary_id" uuid,
	"project_id" uuid,
	CONSTRAINT "GlossaryToProject_pkey" PRIMARY KEY("glossary_id","project_id")
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
CREATE TABLE "Language" (
	"id" text PRIMARY KEY
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
CREATE TABLE "Memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MemoryItem" (
	"id" serial PRIMARY KEY,
	"creator_id" uuid,
	"memory_id" uuid NOT NULL,
	"source_element_id" integer,
	"translation_id" integer,
	"source_string_id" integer NOT NULL,
	"translation_string_id" integer NOT NULL,
	"source_template" text,
	"translation_template" text,
	"slot_mapping" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MemoryRecallVariant" (
	"id" serial PRIMARY KEY,
	"memory_item_id" integer NOT NULL,
	"memory_id" uuid NOT NULL,
	"language_id" text NOT NULL,
	"query_side" "RecallQuerySide" NOT NULL,
	"text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"variant_type" "RecallVariantType" NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MemoryToProject" (
	"memory_id" uuid,
	"project_id" uuid,
	CONSTRAINT "MemoryToProject_pkey" PRIMARY KEY("memory_id","project_id")
);
--> statement-breakpoint
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
CREATE TABLE "PermissionTuple" (
	"id" serial PRIMARY KEY,
	"subject_type" "SubjectType" NOT NULL,
	"subject_id" text NOT NULL,
	"relation" "Relation" NOT NULL,
	"object_type" "ObjectType" NOT NULL,
	"object_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "PermissionTuple_subject_type_subject_id_relation_object_type_object_id_unique" UNIQUE("subject_type","subject_id","relation","object_type","object_id")
);
--> statement-breakpoint
CREATE TABLE "Plugin" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"overview" text,
	"is_external" boolean DEFAULT false NOT NULL,
	"entry" text NOT NULL,
	"icon_url" text,
	"version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PluginComponent" (
	"id" serial PRIMARY KEY,
	"component_id" text NOT NULL,
	"slot" text NOT NULL,
	"url" text NOT NULL,
	"plugin_installation_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PluginConfig" (
	"id" serial PRIMARY KEY,
	"plugin_id" text NOT NULL,
	"schema" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PluginConfigInstance" (
	"id" serial PRIMARY KEY,
	"value" jsonb NOT NULL,
	"creator_id" uuid,
	"config_id" integer NOT NULL,
	"plugin_installation_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PluginInstallation" (
	"id" serial PRIMARY KEY,
	"scope_id" text NOT NULL,
	"plugin_id" text NOT NULL,
	"scope_meta" jsonb,
	"scope_type" "ScopeType" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PluginService" (
	"id" serial PRIMARY KEY,
	"service_id" text NOT NULL,
	"plugin_installation_id" integer NOT NULL,
	"service_type" "PluginServiceType" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text,
	"creator_id" uuid NOT NULL,
	"features" jsonb DEFAULT '{"issues":false,"pullRequests":false}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ProjectSequence" (
	"id" serial PRIMARY KEY,
	"project_id" uuid NOT NULL UNIQUE,
	"next_value" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ProjectSetting" (
	"id" serial PRIMARY KEY,
	"project_id" uuid NOT NULL UNIQUE,
	"settings" jsonb DEFAULT '{"enableAutoTranslation":false,"autoTranslationLanguages":[]}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ProjectTargetLanguage" (
	"language_id" text,
	"project_id" uuid,
	CONSTRAINT "ProjectTargetLanguage_pkey" PRIMARY KEY("language_id","project_id")
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
	"type" "PullRequestType" DEFAULT 'MANUAL'::"PullRequestType" NOT NULL,
	"target_language_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "QaResult" (
	"id" serial PRIMARY KEY,
	"translation_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "QaResultItem" (
	"id" serial PRIMARY KEY,
	"meta" jsonb,
	"is_passed" boolean NOT NULL,
	"result_id" integer NOT NULL,
	"checker_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Role" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL UNIQUE,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "Setting" (
	"id" serial PRIMARY KEY,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"status" "TaskStatus" DEFAULT 'PENDING'::"TaskStatus" NOT NULL,
	"type" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Term" (
	"id" serial PRIMARY KEY,
	"type" "TermType" DEFAULT 'NOT_SPECIFIED'::"TermType" NOT NULL,
	"status" "TermStatus" DEFAULT 'NOT_SPECIFIED'::"TermStatus" NOT NULL,
	"creator_id" uuid,
	"text" text NOT NULL,
	"language_id" text NOT NULL,
	"term_concept_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "Term_language_id_text_term_concept_id_unique" UNIQUE("language_id","text","term_concept_id")
);
--> statement-breakpoint
CREATE TABLE "TermConcept" (
	"id" serial PRIMARY KEY,
	"definition" text,
	"string_id" integer,
	"creator_id" uuid,
	"glossary_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TermConceptSubject" (
	"id" serial PRIMARY KEY,
	"subject" text NOT NULL,
	"default_definition" text,
	"creator_id" uuid,
	"glossary_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TermConceptToSubject" (
	"term_concept_id" integer,
	"subject_id" integer,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "TermConceptToSubject_pkey" PRIMARY KEY("term_concept_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "TermRecallVariant" (
	"id" serial PRIMARY KEY,
	"concept_id" integer NOT NULL,
	"language_id" text NOT NULL,
	"text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"variant_type" "RecallVariantType" NOT NULL,
	"meta" jsonb,
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
CREATE TABLE "TranslatableElement" (
	"id" serial PRIMARY KEY,
	"meta" jsonb,
	"document_id" uuid NOT NULL,
	"sort_index" integer,
	"source_start_line" integer,
	"source_end_line" integer,
	"source_location_meta" jsonb,
	"creator_id" uuid,
	"vectorized_string_id" integer NOT NULL,
	"approved_translation_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TranslatableElementContext" (
	"id" serial PRIMARY KEY,
	"type" "TranslatableElementContextType" NOT NULL,
	"json_data" jsonb,
	"file_id" integer,
	"storage_provider_id" integer,
	"text_data" text,
	"translatable_element_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Translation" (
	"id" serial PRIMARY KEY,
	"translator_id" uuid,
	"translatable_element_id" integer NOT NULL,
	"meta" jsonb,
	"string_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TranslationSnapshot" (
	"id" serial PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"creator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TranslationSnapshotItem" (
	"id" serial PRIMARY KEY,
	"snapshot_id" integer NOT NULL,
	"translation_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TranslationVote" (
	"id" serial PRIMARY KEY,
	"value" integer DEFAULT 0 NOT NULL,
	"voter_id" uuid NOT NULL,
	"translation_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"avatar_file_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "User_email_name_unique" UNIQUE("email","name")
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
CREATE TABLE "UserRole" (
	"id" serial PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"role_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "UserRole_user_id_role_id_unique" UNIQUE("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "VectorizedString" (
	"id" serial PRIMARY KEY,
	"value" text NOT NULL,
	"language_id" text NOT NULL,
	"chunk_set_id" integer,
	"status" text DEFAULT 'PENDING_VECTORIZE' NOT NULL,
	CONSTRAINT "VectorizedString_language_id_value_unique" UNIQUE("language_id","value")
);
--> statement-breakpoint
CREATE INDEX "AgentEvent_run_id_index" ON "AgentEvent" ("run_id");--> statement-breakpoint
CREATE INDEX "AgentEvent_type_index" ON "AgentEvent" ("type");--> statement-breakpoint
CREATE INDEX "AgentExternalOutput_run_id_index" ON "AgentExternalOutput" ("run_id");--> statement-breakpoint
CREATE INDEX "AgentExternalOutput_node_id_index" ON "AgentExternalOutput" ("node_id");--> statement-breakpoint
CREATE INDEX "AgentRun_session_id_index" ON "AgentRun" ("session_id");--> statement-breakpoint
CREATE INDEX "AgentRun_status_index" ON "AgentRun" ("status");--> statement-breakpoint
CREATE INDEX "AgentRun_deduplication_key_index" ON "AgentRun" ("deduplication_key");--> statement-breakpoint
CREATE INDEX "AgentSession_agent_definition_id_index" ON "AgentSession" ("agent_definition_id");--> statement-breakpoint
CREATE INDEX "AgentSession_user_id_index" ON "AgentSession" ("user_id");--> statement-breakpoint
CREATE INDEX "AgentSession_project_id_index" ON "AgentSession" ("project_id");--> statement-breakpoint
CREATE INDEX "ApiKey_user_id_index" ON "ApiKey" ("user_id");--> statement-breakpoint
CREATE INDEX "ApiKey_key_hash_index" ON "ApiKey" ("key_hash");--> statement-breakpoint
CREATE INDEX "ApiKey_key_prefix_index" ON "ApiKey" ("key_prefix");--> statement-breakpoint
CREATE INDEX "AuthFlowLog_user_id_index" ON "AuthFlowLog" ("user_id");--> statement-breakpoint
CREATE INDEX "AuthFlowLog_flow_id_index" ON "AuthFlowLog" ("flow_id");--> statement-breakpoint
CREATE INDEX "AuthFlowLog_created_at_index" ON "AuthFlowLog" ("created_at");--> statement-breakpoint
CREATE INDEX "ChangesetEntry_changeset_id_index" ON "ChangesetEntry" ("changeset_id");--> statement-breakpoint
CREATE INDEX "ChangesetEntry_entity_type_entity_id_index" ON "ChangesetEntry" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "Chunk_chunk_set_id_index" ON "Chunk" ("chunk_set_id");--> statement-breakpoint
CREATE INDEX "Comment_parent_comment_id_index" ON "Comment" ("parent_comment_id");--> statement-breakpoint
CREATE INDEX "Comment_root_comment_id_index" ON "Comment" ("root_comment_id");--> statement-breakpoint
CREATE INDEX "Comment_user_id_index" ON "Comment" ("user_id");--> statement-breakpoint
CREATE INDEX "Comment_target_type_target_id_index" ON "Comment" ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "CommentReaction_comment_id_index" ON "CommentReaction" ("comment_id");--> statement-breakpoint
CREATE INDEX "CommentReaction_user_id_index" ON "CommentReaction" ("user_id");--> statement-breakpoint
CREATE INDEX "CrossReference_target_type_target_id_index" ON "CrossReference" ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "CrossReference_source_type_source_id_index" ON "CrossReference" ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "Document_project_id_index" ON "Document" ("project_id");--> statement-breakpoint
CREATE INDEX "DocumentClosure_ancestor_index" ON "DocumentClosure" ("ancestor");--> statement-breakpoint
CREATE INDEX "DocumentClosure_descendant_index" ON "DocumentClosure" ("descendant");--> statement-breakpoint
CREATE INDEX "DocumentToTask_task_id_index" ON "DocumentToTask" ("task_id");--> statement-breakpoint
CREATE INDEX "EntityBranch_project_id_index" ON "EntityBranch" ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "EntityBranch_project_id_name_index" ON "EntityBranch" ("project_id","name");--> statement-breakpoint
CREATE INDEX "EntityBranch_status_index" ON "EntityBranch" ("status");--> statement-breakpoint
CREATE INDEX "GlossaryToProject_project_id_index" ON "GlossaryToProject" ("project_id");--> statement-breakpoint
CREATE INDEX "Issue_project_id_index" ON "Issue" ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "Issue_project_id_number_index" ON "Issue" ("project_id","number");--> statement-breakpoint
CREATE INDEX "Issue_project_id_status_index" ON "Issue" ("project_id","status");--> statement-breakpoint
CREATE INDEX "Issue_parent_issue_id_index" ON "Issue" ("parent_issue_id");--> statement-breakpoint
CREATE INDEX "IssueComment_thread_id_created_at_index" ON "IssueComment" ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "IssueCommentThread_target_type_target_id_index" ON "IssueCommentThread" ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "IssueCommentThread_target_type_target_id_is_review_thread_index" ON "IssueCommentThread" ("target_type","target_id","is_review_thread");--> statement-breakpoint
CREATE INDEX "IssueLabel_label_index" ON "IssueLabel" ("label");--> statement-breakpoint
CREATE INDEX "LoginAttempt_ip_index" ON "LoginAttempt" ("ip");--> statement-breakpoint
CREATE INDEX "LoginAttempt_identifier_index" ON "LoginAttempt" ("identifier");--> statement-breakpoint
CREATE INDEX "LoginAttempt_created_at_index" ON "LoginAttempt" ("created_at");--> statement-breakpoint
CREATE INDEX "MemoryRecallVariant_memory_item_id_index" ON "MemoryRecallVariant" ("memory_item_id");--> statement-breakpoint
CREATE INDEX "MemoryRecallVariant_memory_id_index" ON "MemoryRecallVariant" ("memory_id");--> statement-breakpoint
CREATE INDEX "MemoryRecallVariant_language_id_index" ON "MemoryRecallVariant" ("language_id");--> statement-breakpoint
CREATE INDEX "idx_memory_recall_variant_text_trgm" ON "MemoryRecallVariant" USING gin ("normalized_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "MemoryToProject_project_id_index" ON "MemoryToProject" ("project_id");--> statement-breakpoint
CREATE INDEX "Notification_recipient_id_index" ON "Notification" ("recipient_id");--> statement-breakpoint
CREATE INDEX "Notification_status_index" ON "Notification" ("status");--> statement-breakpoint
CREATE INDEX "Notification_recipient_id_status_index" ON "Notification" ("recipient_id","status");--> statement-breakpoint
CREATE INDEX "Notification_recipient_id_created_at_index" ON "Notification" ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "PermissionTuple_subject_type_subject_id_index" ON "PermissionTuple" ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "PermissionTuple_object_type_object_id_index" ON "PermissionTuple" ("object_type","object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "PluginConfig_plugin_id_index" ON "PluginConfig" ("plugin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "PluginConfigInstance_plugin_installation_id_config_id_index" ON "PluginConfigInstance" ("plugin_installation_id","config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "PluginInstallation_scope_type_scope_id_plugin_id_index" ON "PluginInstallation" ("scope_type","scope_id","plugin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "PluginService_service_type_service_id_plugin_installation_id_index" ON "PluginService" ("service_type","service_id","plugin_installation_id");--> statement-breakpoint
CREATE INDEX "Project_creator_id_index" ON "Project" ("creator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ProjectSequence_project_id_index" ON "ProjectSequence" ("project_id");--> statement-breakpoint
CREATE INDEX "ProjectSetting_project_id_index" ON "ProjectSetting" ("project_id");--> statement-breakpoint
CREATE INDEX "ProjectTargetLanguage_project_id_index" ON "ProjectTargetLanguage" ("project_id");--> statement-breakpoint
CREATE INDEX "PullRequest_project_id_index" ON "PullRequest" ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "PullRequest_project_id_number_index" ON "PullRequest" ("project_id","number");--> statement-breakpoint
CREATE INDEX "PullRequest_branch_id_index" ON "PullRequest" ("branch_id");--> statement-breakpoint
CREATE INDEX "PullRequest_issue_id_index" ON "PullRequest" ("issue_id");--> statement-breakpoint
CREATE INDEX "PullRequest_project_id_status_index" ON "PullRequest" ("project_id","status");--> statement-breakpoint
CREATE INDEX "PullRequest_project_id_type_target_language_id_index" ON "PullRequest" ("project_id","type","target_language_id");--> statement-breakpoint
CREATE UNIQUE INDEX "PullRequest_project_id_target_language_id_index" ON "PullRequest" ("project_id","target_language_id") WHERE "type" = 'AUTO_TRANSLATE' AND "status" NOT IN ('MERGED', 'CLOSED');--> statement-breakpoint
CREATE INDEX "SessionRecord_user_id_index" ON "SessionRecord" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "Setting_key_index" ON "Setting" ("key");--> statement-breakpoint
CREATE INDEX "Task_meta_index" ON "Task" ("meta");--> statement-breakpoint
CREATE INDEX "idx_term_text_trgm" ON "Term" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "TermRecallVariant_concept_id_index" ON "TermRecallVariant" ("concept_id");--> statement-breakpoint
CREATE INDEX "TermRecallVariant_language_id_index" ON "TermRecallVariant" ("language_id");--> statement-breakpoint
CREATE INDEX "idx_term_recall_variant_text_trgm" ON "TermRecallVariant" USING gin ("normalized_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "ToolCallLog_session_id_index" ON "ToolCallLog" ("session_id");--> statement-breakpoint
CREATE INDEX "ToolCallLog_run_id_index" ON "ToolCallLog" ("run_id");--> statement-breakpoint
CREATE INDEX "TranslatableElement_document_id_sort_index_index" ON "TranslatableElement" ("document_id","sort_index");--> statement-breakpoint
CREATE INDEX "TranslatableElementContext_translatable_element_id_index" ON "TranslatableElementContext" ("translatable_element_id");--> statement-breakpoint
CREATE UNIQUE INDEX "Translation_translator_id_translatable_element_id_string_id_index" ON "Translation" ("translator_id","translatable_element_id","string_id");--> statement-breakpoint
CREATE INDEX "Translation_translatable_element_id_index" ON "Translation" ("translatable_element_id");--> statement-breakpoint
CREATE INDEX "TranslationVote_translation_id_index" ON "TranslationVote" ("translation_id");--> statement-breakpoint
CREATE INDEX "TranslationVote_voter_id_index" ON "TranslationVote" ("voter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "TranslationVote_voter_id_translation_id_index" ON "TranslationVote" ("voter_id","translation_id");--> statement-breakpoint
CREATE INDEX "UserMessagePreference_user_id_index" ON "UserMessagePreference" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_vectorized_string_value_trgm" ON "VectorizedString" USING gin ("value" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_vectorized_string_value_en_bm25_rum" ON "VectorizedString" USING rum (to_tsvector('english', "value") rum_tsvector_ops) WHERE "language_id" = 'en';--> statement-breakpoint
CREATE INDEX "idx_vectorized_string_value_zh_hans_bm25_rum" ON "VectorizedString" USING rum (to_tsvector('cat_zh_hans', "value") rum_tsvector_ops) WHERE "language_id" = 'zh-Hans';--> statement-breakpoint
CREATE INDEX "VectorizedString_language_id_index" ON "VectorizedString" ("language_id");--> statement-breakpoint
CREATE INDEX "VectorizedString_status_index" ON "VectorizedString" ("status");--> statement-breakpoint
ALTER TABLE "Account" ADD CONSTRAINT "Account_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Account" ADD CONSTRAINT "Account_auth_provider_id_PluginService_id_fkey" FOREIGN KEY ("auth_provider_id") REFERENCES "PluginService"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_run_id_AgentRun_id_fkey" FOREIGN KEY ("run_id") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AgentExternalOutput" ADD CONSTRAINT "AgentExternalOutput_run_id_AgentRun_id_fkey" FOREIGN KEY ("run_id") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_session_id_AgentSession_id_fkey" FOREIGN KEY ("session_id") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_agent_definition_id_AgentDefinition_id_fkey" FOREIGN KEY ("agent_definition_id") REFERENCES "AgentDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_issue_id_Issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "Issue"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_pull_request_id_PullRequest_id_fkey" FOREIGN KEY ("pull_request_id") REFERENCES "PullRequest"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "AuthFlowLog" ADD CONSTRAINT "AuthFlowLog_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "Blob" ADD CONSTRAINT "Blob_storage_provider_id_PluginService_id_fkey" FOREIGN KEY ("storage_provider_id") REFERENCES "PluginService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Changeset" ADD CONSTRAINT "Changeset_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "Changeset" ADD CONSTRAINT "Changeset_agent_run_id_AgentRun_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "AgentRun"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "Changeset" ADD CONSTRAINT "Changeset_pull_request_id_PullRequest_id_fkey" FOREIGN KEY ("pull_request_id") REFERENCES "PullRequest"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "Changeset" ADD CONSTRAINT "Changeset_branch_id_EntityBranch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "EntityBranch"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "Changeset" ADD CONSTRAINT "Changeset_created_by_User_id_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "Changeset" ADD CONSTRAINT "Changeset_reviewed_by_User_id_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ChangesetEntry" ADD CONSTRAINT "ChangesetEntry_changeset_id_Changeset_id_fkey" FOREIGN KEY ("changeset_id") REFERENCES "Changeset"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_chunk_set_id_ChunkSet_id_fkey" FOREIGN KEY ("chunk_set_id") REFERENCES "ChunkSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_vectorizer_id_PluginService_id_fkey" FOREIGN KEY ("vectorizer_id") REFERENCES "PluginService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_language_id_Language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parent_comment_id_Comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_root_comment_id_Comment_id_fkey" FOREIGN KEY ("root_comment_id") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_comment_id_Comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "CrossReference" ADD CONSTRAINT "CrossReference_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_creator_id_User_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_file_handler_id_PluginService_id_fkey" FOREIGN KEY ("file_handler_id") REFERENCES "PluginService"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_file_id_File_id_fkey" FOREIGN KEY ("file_id") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DocumentClosure" ADD CONSTRAINT "DocumentClosure_ancestor_Document_id_fkey" FOREIGN KEY ("ancestor") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DocumentClosure" ADD CONSTRAINT "DocumentClosure_descendant_Document_id_fkey" FOREIGN KEY ("descendant") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DocumentClosure" ADD CONSTRAINT "DocumentClosure_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DocumentToTask" ADD CONSTRAINT "DocumentToTask_document_id_Document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DocumentToTask" ADD CONSTRAINT "DocumentToTask_task_id_Task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "EntityBranch" ADD CONSTRAINT "EntityBranch_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "EntityBranch" ADD CONSTRAINT "EntityBranch_created_by_User_id_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "EntityBranch" ADD CONSTRAINT "EntityBranch_created_by_agent_id_AgentDefinition_id_fkey" FOREIGN KEY ("created_by_agent_id") REFERENCES "AgentDefinition"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "EntitySnapshot" ADD CONSTRAINT "EntitySnapshot_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "EntitySnapshot" ADD CONSTRAINT "EntitySnapshot_created_by_User_id_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "File" ADD CONSTRAINT "File_blob_id_Blob_id_fkey" FOREIGN KEY ("blob_id") REFERENCES "Blob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Glossary" ADD CONSTRAINT "Glossary_creator_id_User_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "GlossaryToProject" ADD CONSTRAINT "GlossaryToProject_glossary_id_Glossary_id_fkey" FOREIGN KEY ("glossary_id") REFERENCES "Glossary"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "GlossaryToProject" ADD CONSTRAINT "GlossaryToProject_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_author_id_User_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_author_agent_id_AgentDefinition_id_fkey" FOREIGN KEY ("author_agent_id") REFERENCES "AgentDefinition"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_parent_issue_id_Issue_id_fkey" FOREIGN KEY ("parent_issue_id") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_thread_id_IssueCommentThread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "IssueCommentThread"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_author_id_User_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_author_agent_id_AgentDefinition_id_fkey" FOREIGN KEY ("author_agent_id") REFERENCES "AgentDefinition"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "IssueLabel" ADD CONSTRAINT "IssueLabel_issue_id_Issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "Issue"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_creator_id_User_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_creator_id_User_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_memory_id_Memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_source_element_id_TranslatableElement_id_fkey" FOREIGN KEY ("source_element_id") REFERENCES "TranslatableElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_translation_id_Translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "Translation"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_source_string_id_VectorizedString_id_fkey" FOREIGN KEY ("source_string_id") REFERENCES "VectorizedString"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_translation_string_id_VectorizedString_id_fkey" FOREIGN KEY ("translation_string_id") REFERENCES "VectorizedString"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryRecallVariant" ADD CONSTRAINT "MemoryRecallVariant_memory_item_id_MemoryItem_id_fkey" FOREIGN KEY ("memory_item_id") REFERENCES "MemoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryRecallVariant" ADD CONSTRAINT "MemoryRecallVariant_memory_id_Memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryRecallVariant" ADD CONSTRAINT "MemoryRecallVariant_language_id_Language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryToProject" ADD CONSTRAINT "MemoryToProject_memory_id_Memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryToProject" ADD CONSTRAINT "MemoryToProject_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MFAProvider" ADD CONSTRAINT "MFAProvider_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MFAProvider" ADD CONSTRAINT "MFAProvider_mfa_service_id_PluginService_id_fkey" FOREIGN KEY ("mfa_service_id") REFERENCES "PluginService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipient_id_User_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PluginComponent" ADD CONSTRAINT "PluginComponent_eAfVTu1efahR_fkey" FOREIGN KEY ("plugin_installation_id") REFERENCES "PluginInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PluginConfig" ADD CONSTRAINT "PluginConfig_plugin_id_Plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "Plugin"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PluginConfigInstance" ADD CONSTRAINT "PluginConfigInstance_creator_id_User_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PluginConfigInstance" ADD CONSTRAINT "PluginConfigInstance_config_id_PluginConfig_id_fkey" FOREIGN KEY ("config_id") REFERENCES "PluginConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PluginConfigInstance" ADD CONSTRAINT "PluginConfigInstance_tUFft8obCY8T_fkey" FOREIGN KEY ("plugin_installation_id") REFERENCES "PluginInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PluginInstallation" ADD CONSTRAINT "PluginInstallation_plugin_id_Plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "Plugin"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PluginService" ADD CONSTRAINT "PluginService_plugin_installation_id_PluginInstallation_id_fkey" FOREIGN KEY ("plugin_installation_id") REFERENCES "PluginInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Project" ADD CONSTRAINT "Project_creator_id_User_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ProjectSequence" ADD CONSTRAINT "ProjectSequence_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ProjectSetting" ADD CONSTRAINT "ProjectSetting_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ProjectTargetLanguage" ADD CONSTRAINT "ProjectTargetLanguage_language_id_Language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ProjectTargetLanguage" ADD CONSTRAINT "ProjectTargetLanguage_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_author_id_User_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_author_agent_id_AgentDefinition_id_fkey" FOREIGN KEY ("author_agent_id") REFERENCES "AgentDefinition"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_branch_id_EntityBranch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "EntityBranch"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_issue_id_Issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "Issue"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "QaResult" ADD CONSTRAINT "QaResult_translation_id_Translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "Translation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "QaResultItem" ADD CONSTRAINT "QaResultItem_result_id_QaResult_id_fkey" FOREIGN KEY ("result_id") REFERENCES "QaResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "QaResultItem" ADD CONSTRAINT "QaResultItem_checker_id_PluginService_id_fkey" FOREIGN KEY ("checker_id") REFERENCES "PluginService"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SessionRecord" ADD CONSTRAINT "SessionRecord_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "Term" ADD CONSTRAINT "Term_creator_id_User_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Term" ADD CONSTRAINT "Term_language_id_Language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Term" ADD CONSTRAINT "Term_term_concept_id_TermConcept_id_fkey" FOREIGN KEY ("term_concept_id") REFERENCES "TermConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermConcept" ADD CONSTRAINT "TermConcept_string_id_VectorizedString_id_fkey" FOREIGN KEY ("string_id") REFERENCES "VectorizedString"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermConcept" ADD CONSTRAINT "TermConcept_creator_id_User_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermConcept" ADD CONSTRAINT "TermConcept_glossary_id_Glossary_id_fkey" FOREIGN KEY ("glossary_id") REFERENCES "Glossary"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermConceptSubject" ADD CONSTRAINT "TermConceptSubject_creator_id_User_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermConceptSubject" ADD CONSTRAINT "TermConceptSubject_glossary_id_Glossary_id_fkey" FOREIGN KEY ("glossary_id") REFERENCES "Glossary"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermConceptToSubject" ADD CONSTRAINT "TermConceptToSubject_term_concept_id_TermConcept_id_fkey" FOREIGN KEY ("term_concept_id") REFERENCES "TermConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermConceptToSubject" ADD CONSTRAINT "TermConceptToSubject_subject_id_TermConceptSubject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "TermConceptSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermRecallVariant" ADD CONSTRAINT "TermRecallVariant_concept_id_TermConcept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "TermConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermRecallVariant" ADD CONSTRAINT "TermRecallVariant_language_id_Language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ToolCallLog" ADD CONSTRAINT "ToolCallLog_session_id_AgentSession_id_fkey" FOREIGN KEY ("session_id") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ToolCallLog" ADD CONSTRAINT "ToolCallLog_run_id_AgentRun_id_fkey" FOREIGN KEY ("run_id") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_document_id_Document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_creator_id_User_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_Lh1AAXOO5tiq_fkey" FOREIGN KEY ("vectorized_string_id") REFERENCES "VectorizedString"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_approved_translation_id_Translation_id_fkey" FOREIGN KEY ("approved_translation_id") REFERENCES "Translation"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElementContext" ADD CONSTRAINT "TranslatableElementContext_file_id_File_id_fkey" FOREIGN KEY ("file_id") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElementContext" ADD CONSTRAINT "TranslatableElementContext_ocSqg69uUW3x_fkey" FOREIGN KEY ("storage_provider_id") REFERENCES "PluginService"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElementContext" ADD CONSTRAINT "TranslatableElementContext_1bh40XM18KpL_fkey" FOREIGN KEY ("translatable_element_id") REFERENCES "TranslatableElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_translator_id_User_id_fkey" FOREIGN KEY ("translator_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_translatable_element_id_TranslatableElement_id_fkey" FOREIGN KEY ("translatable_element_id") REFERENCES "TranslatableElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_string_id_VectorizedString_id_fkey" FOREIGN KEY ("string_id") REFERENCES "VectorizedString"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslationSnapshot" ADD CONSTRAINT "TranslationSnapshot_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslationSnapshot" ADD CONSTRAINT "TranslationSnapshot_creator_id_User_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslationSnapshotItem" ADD CONSTRAINT "TranslationSnapshotItem_snapshot_id_TranslationSnapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "TranslationSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslationSnapshotItem" ADD CONSTRAINT "TranslationSnapshotItem_translation_id_Translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "Translation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslationVote" ADD CONSTRAINT "TranslationVote_voter_id_User_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslationVote" ADD CONSTRAINT "TranslationVote_translation_id_Translation_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "Translation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_avatar_file_id_File_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "UserMessagePreference" ADD CONSTRAINT "UserMessagePreference_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_user_id_User_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_role_id_Role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "VectorizedString" ADD CONSTRAINT "VectorizedString_language_id_Language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "VectorizedString" ADD CONSTRAINT "VectorizedString_chunk_set_id_ChunkSet_id_fkey" FOREIGN KEY ("chunk_set_id") REFERENCES "ChunkSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;