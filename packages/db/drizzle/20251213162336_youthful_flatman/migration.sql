-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE SCHEMA "drizzle";
--> statement-breakpoint
CREATE TYPE "TaskStatus" AS ENUM('COMPLETED', 'PENDING', 'FAILED');--> statement-breakpoint
CREATE TYPE "PluginServiceType" AS ENUM('AUTH_PROVIDER', 'STORAGE_PROVIDER', 'TERM_SERVICE', 'TRANSLATABLE_FILE_HANDLER', 'TRANSLATION_ADVISOR', 'TEXT_VECTORIZER', 'VECTOR_STORAGE');--> statement-breakpoint
CREATE TYPE "ScopeType" AS ENUM('GLOBAL', 'PROJECT', 'USER');--> statement-breakpoint
CREATE TYPE "TranslatableElementContextType" AS ENUM('TEXT', 'JSON', 'FILE', 'MARKDOWN', 'URL');--> statement-breakpoint
CREATE TYPE "TranslatableElementCommentReactionType" AS ENUM('+1', '-1', 'LAUGH', 'HOORAY', 'CONFUSED', 'HEART', 'ROCKET', 'EYES');--> statement-breakpoint
CREATE TYPE "ResourceType" AS ENUM('PROJECT', 'DOCUMENT', 'PLUGIN', 'GLOSSARY', 'MEMORY');--> statement-breakpoint
CREATE TABLE "drizzle"."__drizzle_migrations" (
	"id" serial PRIMARY KEY,
	"hash" text NOT NULL,
	"created_at" bigint
);
--> statement-breakpoint
CREATE TABLE "Account" (
	"type" text NOT NULL,
	"provider" text,
	"provided_account_id" text,
	"user_id" uuid NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "Account_provider_provided_account_id_pk" PRIMARY KEY("provider","provided_account_id")
);
--> statement-breakpoint
CREATE TABLE "Blob" (
	"id" serial PRIMARY KEY,
	"key" text NOT NULL,
	"storage_provider_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference_count" integer DEFAULT 1 NOT NULL,
	"hash" bytea CONSTRAINT "Blob_hash_unique" UNIQUE,
	CONSTRAINT "Blob_storageProviderId_key_unique" UNIQUE("storage_provider_id","key"),
	CONSTRAINT "hash_check1" CHECK (CHECK ((octet_length(hash) = 32))),
	CONSTRAINT "referenceCount_check1" CHECK (CHECK ((reference_count >= 0)))
);
--> statement-breakpoint
CREATE TABLE "Chunk" (
	"id" serial PRIMARY KEY,
	"meta" jsonb,
	"chunk_set_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vectorizer_id" integer NOT NULL,
	"vector_storage_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ChunkSet" (
	"id" serial PRIMARY KEY,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Document" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text,
	"project_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"file_handler_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_id" integer,
	"is_directory" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "DocumentClosure" (
	"ancestor" uuid,
	"descendant" uuid,
	"depth" integer NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "DocumentClosure_ancestor_descendant_pk" PRIMARY KEY("ancestor","descendant")
);
--> statement-breakpoint
CREATE TABLE "DocumentToTask" (
	"document_id" uuid,
	"task_id" uuid,
	CONSTRAINT "DocumentToTask_document_id_task_id_pk" PRIMARY KEY("document_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "DocumentVersion" (
	"id" serial PRIMARY KEY,
	"document_id" uuid NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
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
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
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
	CONSTRAINT "GlossaryToProject_glossary_id_project_id_pk" PRIMARY KEY("glossary_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "Language" (
	"id" text PRIMARY KEY
);
--> statement-breakpoint
CREATE TABLE "Memory" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text NOT NULL,
	"description" text,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MemoryItem" (
	"id" serial PRIMARY KEY,
	"creator_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"source_element_id" integer,
	"translation_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_string_id" integer NOT NULL,
	"translation_string_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MemoryToProject" (
	"memory_id" uuid,
	"project_id" uuid,
	CONSTRAINT "MemoryToProject_memory_id_project_id_pk" PRIMARY KEY("memory_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "Permission" (
	"id" serial PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"template_id" integer NOT NULL,
	"resource_id" text
);
--> statement-breakpoint
CREATE TABLE "PermissionTemplate" (
	"id" serial PRIMARY KEY,
	"content" text NOT NULL,
	"resource_type" "ResourceType" NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "PermissionTemplate_content_resourceType_unique" UNIQUE("content","resource_type")
);
--> statement-breakpoint
CREATE TABLE "Plugin" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"overview" text,
	"is_external" boolean DEFAULT false NOT NULL,
	"entry" text NOT NULL,
	"icon_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" text NOT NULL
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
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text NOT NULL,
	"description" text,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ProjectTargetLanguage" (
	"language_id" text,
	"project_id" uuid,
	CONSTRAINT "ProjectTargetLanguage_language_id_project_id_pk" PRIMARY KEY("language_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "Role" (
	"id" serial PRIMARY KEY,
	"scope_type" "ScopeType" NOT NULL,
	"scope_id" text NOT NULL,
	"name" text NOT NULL,
	"creator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "Role_name_scopeType_scopeId_unique" UNIQUE("name","scope_type","scope_id")
);
--> statement-breakpoint
CREATE TABLE "RolePermission" (
	"role_id" serial,
	"permission_id" serial,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_allowed" boolean DEFAULT true NOT NULL,
	CONSTRAINT "RolePermission_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
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
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"status" "TaskStatus" DEFAULT 'PENDING'::"TaskStatus" NOT NULL,
	"type" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Term" (
	"id" serial PRIMARY KEY,
	"creator_id" uuid NOT NULL,
	"glossary_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"string_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TermRelation" (
	"id" serial PRIMARY KEY,
	"term_id" integer NOT NULL,
	"translation_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TranslatableElement" (
	"id" serial PRIMARY KEY,
	"meta" jsonb,
	"document_id" uuid NOT NULL,
	"document_version_id" integer,
	"sort_index" integer NOT NULL,
	"creator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"translatable_string_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TranslatableElementComment" (
	"id" serial PRIMARY KEY,
	"translatable_element_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"parent_comment_id" integer,
	"root_comment_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"language_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TranslatableElementCommentReaction" (
	"id" serial PRIMARY KEY,
	"translatable_element_comment_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "TranslatableElementCommentReactionType" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "TranslatableElementCommentReaction_translatableElementCommentId" UNIQUE("translatable_element_comment_id","user_id")
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
CREATE TABLE "TranslatableString" (
	"id" serial PRIMARY KEY,
	"value" text NOT NULL,
	"language_id" text NOT NULL,
	"chunk_set_id" integer NOT NULL,
	CONSTRAINT "TranslatableString_languageId_value_unique" UNIQUE("language_id","value")
);
--> statement-breakpoint
CREATE TABLE "Translation" (
	"id" serial PRIMARY KEY,
	"translator_id" uuid NOT NULL,
	"translatable_element_id" integer NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"string_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TranslationApprovement" (
	"id" serial PRIMARY KEY,
	"is_active" boolean DEFAULT false NOT NULL,
	"translation_id" integer NOT NULL,
	"creator_id" uuid NOT NULL,
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
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"avatar_file_id" integer,
	CONSTRAINT "User_email_name_unique" UNIQUE("email","name")
);
--> statement-breakpoint
CREATE TABLE "UserRole" (
	"user_id" uuid,
	"role_id" integer,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "UserRole_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "Vector" (
	"id" serial PRIMARY KEY,
	"vector" vector(1024) NOT NULL,
	"chunk_id" integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "Account_user_id_provider_index" ON "Account" ("user_id","provider");--> statement-breakpoint
CREATE INDEX "Chunk_chunk_set_id_index" ON "Chunk" ("chunk_set_id");--> statement-breakpoint
CREATE INDEX "Document_project_id_index" ON "Document" ("project_id");--> statement-breakpoint
CREATE INDEX "DocumentClosure_ancestor_index" ON "DocumentClosure" ("ancestor");--> statement-breakpoint
CREATE INDEX "DocumentClosure_descendant_index" ON "DocumentClosure" ("descendant");--> statement-breakpoint
CREATE INDEX "DocumentToTask_task_id_index" ON "DocumentToTask" ("task_id");--> statement-breakpoint
CREATE INDEX "GlossaryToProject_project_id_index" ON "GlossaryToProject" ("project_id");--> statement-breakpoint
CREATE INDEX "MemoryToProject_project_id_index" ON "MemoryToProject" ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "PluginConfig_plugin_id_index" ON "PluginConfig" ("plugin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "PluginConfigInstance_plugin_installation_id_config_id_index" ON "PluginConfigInstance" ("plugin_installation_id","config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "PluginInstallation_scope_type_scope_id_plugin_id_index" ON "PluginInstallation" ("scope_type","scope_id","plugin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "PluginService_service_type_service_id_plugin_installation_id_in" ON "PluginService" ("service_type","service_id","plugin_installation_id");--> statement-breakpoint
CREATE INDEX "Project_creator_id_index" ON "Project" ("creator_id");--> statement-breakpoint
CREATE INDEX "ProjectTargetLanguage_project_id_index" ON "ProjectTargetLanguage" ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "Setting_key_index" ON "Setting" ("key");--> statement-breakpoint
CREATE INDEX "Task_meta_index" ON "Task" ("meta");--> statement-breakpoint
CREATE INDEX "TermRelation_translation_id_index" ON "TermRelation" ("translation_id");--> statement-breakpoint
CREATE INDEX "TranslatableElementComment_parent_comment_id_index" ON "TranslatableElementComment" ("parent_comment_id");--> statement-breakpoint
CREATE INDEX "TranslatableElementComment_root_comment_id_index" ON "TranslatableElementComment" ("root_comment_id");--> statement-breakpoint
CREATE INDEX "TranslatableElementComment_translatable_element_id_index" ON "TranslatableElementComment" ("translatable_element_id");--> statement-breakpoint
CREATE INDEX "TranslatableElementComment_user_id_index" ON "TranslatableElementComment" ("user_id");--> statement-breakpoint
CREATE INDEX "TranslatableElementCommentReaction_translatable_element_comment" ON "TranslatableElementCommentReaction" ("translatable_element_comment_id");--> statement-breakpoint
CREATE INDEX "TranslatableElementCommentReaction_user_id_index" ON "TranslatableElementCommentReaction" ("user_id");--> statement-breakpoint
CREATE INDEX "TranslatableElementContext_translatable_element_id_index" ON "TranslatableElementContext" ("translatable_element_id");--> statement-breakpoint
CREATE UNIQUE INDEX "Translation_translator_id_translatable_element_id_string_id_ind" ON "Translation" ("translator_id","translatable_element_id","string_id");--> statement-breakpoint
CREATE INDEX "TranslationVote_translation_id_index" ON "TranslationVote" ("translation_id");--> statement-breakpoint
CREATE INDEX "TranslationVote_voter_id_index" ON "TranslationVote" ("voter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "TranslationVote_voter_id_translation_id_index" ON "TranslationVote" ("voter_id","translation_id");--> statement-breakpoint
CREATE INDEX "Vector_vector_index" ON "Vector" USING hnsw ("vector" hnsw);--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_file_handler_id_PluginService_id_fk" FOREIGN KEY ("file_handler_id") REFERENCES "PluginService"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_file_id_File_id_fk" FOREIGN KEY ("file_id") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_project_id_Project_id_fk" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DocumentToTask" ADD CONSTRAINT "DocumentToTask_document_id_Document_id_fk" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DocumentToTask" ADD CONSTRAINT "DocumentToTask_task_id_Task_id_fk" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_document_id_Document_id_fk" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_document_id_Document_id_fk" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_document_version_id_DocumentVersion_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_translatable_string_id_TranslatableString_i" FOREIGN KEY ("translatable_string_id") REFERENCES "TranslatableString"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "File" ADD CONSTRAINT "File_blob_id_Blob_id_fk" FOREIGN KEY ("blob_id") REFERENCES "Blob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Glossary" ADD CONSTRAINT "Glossary_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "GlossaryToProject" ADD CONSTRAINT "GlossaryToProject_glossary_id_Glossary_id_fk" FOREIGN KEY ("glossary_id") REFERENCES "Glossary"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "GlossaryToProject" ADD CONSTRAINT "GlossaryToProject_project_id_Project_id_fk" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Term" ADD CONSTRAINT "Term_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Term" ADD CONSTRAINT "Term_glossary_id_Glossary_id_fk" FOREIGN KEY ("glossary_id") REFERENCES "Glossary"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Term" ADD CONSTRAINT "Term_string_id_TranslatableString_id_fk" FOREIGN KEY ("string_id") REFERENCES "TranslatableString"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermRelation" ADD CONSTRAINT "TermRelation_term_id_Term_id_fk" FOREIGN KEY ("term_id") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TermRelation" ADD CONSTRAINT "TermRelation_translation_id_Term_id_fk" FOREIGN KEY ("translation_id") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_memory_id_Memory_id_fk" FOREIGN KEY ("memory_id") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_source_element_id_TranslatableElement_id_fk" FOREIGN KEY ("source_element_id") REFERENCES "TranslatableElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_source_string_id_TranslatableString_id_fk" FOREIGN KEY ("source_string_id") REFERENCES "TranslatableString"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_translation_id_Translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "Translation"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_translation_string_id_TranslatableString_id_fk" FOREIGN KEY ("translation_string_id") REFERENCES "TranslatableString"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryToProject" ADD CONSTRAINT "MemoryToProject_memory_id_Memory_id_fk" FOREIGN KEY ("memory_id") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MemoryToProject" ADD CONSTRAINT "MemoryToProject_project_id_Project_id_fk" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PluginConfig" ADD CONSTRAINT "PluginConfig_plugin_id_Plugin_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "Plugin"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PluginConfigInstance" ADD CONSTRAINT "PluginConfigInstance_config_id_PluginConfig_id_fk" FOREIGN KEY ("config_id") REFERENCES "PluginConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PluginConfigInstance" ADD CONSTRAINT "PluginConfigInstance_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PluginConfigInstance" ADD CONSTRAINT "PluginConfigInstance_plugin_installation_id_PluginInstallation_" FOREIGN KEY ("plugin_installation_id") REFERENCES "PluginInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PluginInstallation" ADD CONSTRAINT "PluginInstallation_plugin_id_Plugin_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "Plugin"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PluginService" ADD CONSTRAINT "PluginService_plugin_installation_id_PluginInstallation_id_fk" FOREIGN KEY ("plugin_installation_id") REFERENCES "PluginInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Project" ADD CONSTRAINT "Project_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ProjectTargetLanguage" ADD CONSTRAINT "ProjectTargetLanguage_language_id_Language_id_fk" FOREIGN KEY ("language_id") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ProjectTargetLanguage" ADD CONSTRAINT "ProjectTargetLanguage_project_id_Project_id_fk" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_string_id_TranslatableString_id_fk" FOREIGN KEY ("string_id") REFERENCES "TranslatableString"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_translatable_element_id_TranslatableElement_id_fk" FOREIGN KEY ("translatable_element_id") REFERENCES "TranslatableElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_translator_id_User_id_fk" FOREIGN KEY ("translator_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslationApprovement" ADD CONSTRAINT "TranslationApprovement_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslationApprovement" ADD CONSTRAINT "TranslationApprovement_translation_id_Translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "Translation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslationVote" ADD CONSTRAINT "TranslationVote_translation_id_Translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "Translation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslationVote" ADD CONSTRAINT "TranslationVote_voter_id_User_id_fk" FOREIGN KEY ("voter_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Account" ADD CONSTRAINT "Account_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_avatar_file_id_File_id_fk" FOREIGN KEY ("avatar_file_id") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Vector" ADD CONSTRAINT "Vector_chunk_id_Chunk_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "Chunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableString" ADD CONSTRAINT "TranslatableString_chunk_set_id_ChunkSet_id_fk" FOREIGN KEY ("chunk_set_id") REFERENCES "ChunkSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableString" ADD CONSTRAINT "TranslatableString_language_id_Language_id_fk" FOREIGN KEY ("language_id") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_chunk_set_id_ChunkSet_id_fk" FOREIGN KEY ("chunk_set_id") REFERENCES "ChunkSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_vectorizer_id_PluginService_id_fk" FOREIGN KEY ("vectorizer_id") REFERENCES "PluginService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Blob" ADD CONSTRAINT "Blob_storage_provider_id_PluginService_id_fk" FOREIGN KEY ("storage_provider_id") REFERENCES "PluginService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DocumentClosure" ADD CONSTRAINT "DocumentClosure_ancestor_Document_id_fk" FOREIGN KEY ("ancestor") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DocumentClosure" ADD CONSTRAINT "DocumentClosure_descendant_Document_id_fk" FOREIGN KEY ("descendant") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DocumentClosure" ADD CONSTRAINT "DocumentClosure_project_id_Project_id_fk" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElementContext" ADD CONSTRAINT "TranslatableElementContext_file_id_File_id_fk" FOREIGN KEY ("file_id") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElementContext" ADD CONSTRAINT "TranslatableElementContext_storage_provider_id_PluginService_id" FOREIGN KEY ("storage_provider_id") REFERENCES "PluginService"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElementContext" ADD CONSTRAINT "TranslatableElementContext_translatable_element_id_Translatable" FOREIGN KEY ("translatable_element_id") REFERENCES "TranslatableElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElementComment" ADD CONSTRAINT "TranslatableElementComment_language_id_Language_id_fk" FOREIGN KEY ("language_id") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElementComment" ADD CONSTRAINT "TranslatableElementComment_parent_comment_id_TranslatableElemen" FOREIGN KEY ("parent_comment_id") REFERENCES "TranslatableElementComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElementComment" ADD CONSTRAINT "TranslatableElementComment_root_comment_id_TranslatableElementC" FOREIGN KEY ("root_comment_id") REFERENCES "TranslatableElementComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElementComment" ADD CONSTRAINT "TranslatableElementComment_translatable_element_id_Translatable" FOREIGN KEY ("translatable_element_id") REFERENCES "TranslatableElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElementComment" ADD CONSTRAINT "TranslatableElementComment_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElementCommentReaction" ADD CONSTRAINT "TranslatableElementCommentReaction_translatable_element_comment" FOREIGN KEY ("translatable_element_comment_id") REFERENCES "TranslatableElementComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElementCommentReaction" ADD CONSTRAINT "TranslatableElementCommentReaction_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_template_id_PermissionTemplate_id_fk" FOREIGN KEY ("template_id") REFERENCES "PermissionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Role" ADD CONSTRAINT "Role_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permission_id_Permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_role_id_Role_id_fk" FOREIGN KEY ("role_id") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_role_id_Role_id_fk" FOREIGN KEY ("role_id") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
*/