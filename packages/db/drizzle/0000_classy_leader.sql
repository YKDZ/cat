CREATE EXTENSION IF NOT EXISTS "vector"--> statement-breakpoint
CREATE TYPE "public"."PluginServiceType" AS ENUM('TRANSLATION_ADVISOR', 'STORAGE_PROVIDER', 'AUTH_PROVIDER', 'TERM_SERVICE', 'TRANSLATABLE_FILE_HANDLER', 'TEXT_VECTORIZER');--> statement-breakpoint
CREATE TYPE "public"."ScopeType" AS ENUM('GLOBAL', 'USER', 'PROJECT');--> statement-breakpoint
CREATE TABLE "Document" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text,
	"project_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"file_handler_id" integer,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "DocumentToTask" (
	"document_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	CONSTRAINT "DocumentToTask_document_id_task_id_pk" PRIMARY KEY("document_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "DocumentVersion" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TranslatableElement" (
	"id" serial PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"meta" jsonb,
	"document_id" uuid,
	"embedding_id" integer NOT NULL,
	"document_version_id" integer,
	"sort_index" integer NOT NULL,
	"creator_id" uuid,
	"project_id" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "File" (
	"id" serial PRIMARY KEY NOT NULL,
	"origin_name" text NOT NULL,
	"stored_path" text NOT NULL,
	"document_id" uuid,
	"user_id" uuid,
	"storage_provider_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Glossary" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "GlossaryToProject" (
	"glossary_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "GlossaryToProject_glossary_id_project_id_pk" PRIMARY KEY("glossary_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "Term" (
	"id" serial PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"language_id" text NOT NULL,
	"creator_id" uuid NOT NULL,
	"glossary_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TermRelation" (
	"id" serial PRIMARY KEY NOT NULL,
	"term_id" integer NOT NULL,
	"translation_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Memory" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MemoryItem" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"translation" text NOT NULL,
	"source_embedding_id" integer NOT NULL,
	"creator_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"source_element_id" integer,
	"translation_id" integer,
	"source_language_id" text NOT NULL,
	"translation_language_id" text NOT NULL,
	"translation_embedding_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MemoryToProject" (
	"memory_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "MemoryToProject_memory_id_project_id_pk" PRIMARY KEY("memory_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "Language" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Setting" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Task" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"type" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Plugin" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"overview" text,
	"is_external" boolean DEFAULT false NOT NULL,
	"entry" text NOT NULL,
	"icon_url" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PluginConfig" (
	"id" serial PRIMARY KEY NOT NULL,
	"plugin_id" text NOT NULL,
	"schema" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PluginConfigInstance" (
	"id" serial PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"creator_id" uuid,
	"config_id" integer NOT NULL,
	"plugin_installation_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PluginInstallation" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope_id" text NOT NULL,
	"plugin_id" text NOT NULL,
	"scope_meta" jsonb,
	"scope_type" "ScopeType" NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PluginService" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"plugin_installation_id" integer NOT NULL,
	"service_type" "PluginServiceType" NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PluginTag" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PluginToPluginTag" (
	"plugin_id" text NOT NULL,
	"plugin_tag_id" integer NOT NULL,
	CONSTRAINT "PluginToPluginTag_plugin_id_plugin_tag_id_pk" PRIMARY KEY("plugin_id","plugin_tag_id")
);
--> statement-breakpoint
CREATE TABLE "Project" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_language_id" text NOT NULL,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ProjectTargetLanguage" (
	"language_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "ProjectTargetLanguage_language_id_project_id_pk" PRIMARY KEY("language_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "Translation" (
	"id" serial PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"translator_id" uuid NOT NULL,
	"translatable_element_id" integer NOT NULL,
	"language_id" text NOT NULL,
	"meta" jsonb,
	"embedding_id" integer NOT NULL,
	"vectorizer_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TranslationApprovement" (
	"id" serial PRIMARY KEY NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"translation_id" integer NOT NULL,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TranslationVote" (
	"id" serial PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"voter_id" uuid NOT NULL,
	"translation_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Account" (
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provided_account_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "Account_provider_provided_account_id_pk" PRIMARY KEY("provider","provided_account_id")
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Vector" (
	"id" serial PRIMARY KEY NOT NULL,
	"vector" vector(1024) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_project_id_Project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_file_handler_id_PluginService_id_fk" FOREIGN KEY ("file_handler_id") REFERENCES "public"."PluginService"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DocumentToTask" ADD CONSTRAINT "DocumentToTask_document_id_Document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."Document"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DocumentToTask" ADD CONSTRAINT "DocumentToTask_task_id_Task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."Task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_document_id_Document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."Document"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_document_id_Document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."Document"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_embedding_id_Vector_id_fk" FOREIGN KEY ("embedding_id") REFERENCES "public"."Vector"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_document_version_id_DocumentVersion_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."DocumentVersion"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_project_id_Project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "File" ADD CONSTRAINT "File_document_id_Document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."Document"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "File" ADD CONSTRAINT "File_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "File" ADD CONSTRAINT "File_storage_provider_id_PluginService_id_fk" FOREIGN KEY ("storage_provider_id") REFERENCES "public"."PluginService"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Glossary" ADD CONSTRAINT "Glossary_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "GlossaryToProject" ADD CONSTRAINT "GlossaryToProject_glossary_id_Glossary_id_fk" FOREIGN KEY ("glossary_id") REFERENCES "public"."Glossary"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "GlossaryToProject" ADD CONSTRAINT "GlossaryToProject_project_id_Project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Term" ADD CONSTRAINT "Term_language_id_Language_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."Language"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Term" ADD CONSTRAINT "Term_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Term" ADD CONSTRAINT "Term_glossary_id_Glossary_id_fk" FOREIGN KEY ("glossary_id") REFERENCES "public"."Glossary"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TermRelation" ADD CONSTRAINT "TermRelation_term_id_Term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."Term"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TermRelation" ADD CONSTRAINT "TermRelation_translation_id_Term_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."Term"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_source_embedding_id_Vector_id_fk" FOREIGN KEY ("source_embedding_id") REFERENCES "public"."Vector"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_memory_id_Memory_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."Memory"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_source_element_id_TranslatableElement_id_fk" FOREIGN KEY ("source_element_id") REFERENCES "public"."TranslatableElement"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_translation_id_Translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."Translation"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_source_language_id_Language_id_fk" FOREIGN KEY ("source_language_id") REFERENCES "public"."Language"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_translation_language_id_Language_id_fk" FOREIGN KEY ("translation_language_id") REFERENCES "public"."Language"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_translation_embedding_id_Vector_id_fk" FOREIGN KEY ("translation_embedding_id") REFERENCES "public"."Vector"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MemoryToProject" ADD CONSTRAINT "MemoryToProject_memory_id_Memory_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."Memory"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MemoryToProject" ADD CONSTRAINT "MemoryToProject_project_id_Project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PluginConfig" ADD CONSTRAINT "PluginConfig_plugin_id_Plugin_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."Plugin"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PluginConfigInstance" ADD CONSTRAINT "PluginConfigInstance_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PluginConfigInstance" ADD CONSTRAINT "PluginConfigInstance_config_id_PluginConfig_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."PluginConfig"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PluginConfigInstance" ADD CONSTRAINT "PluginConfigInstance_plugin_installation_id_PluginInstallation_id_fk" FOREIGN KEY ("plugin_installation_id") REFERENCES "public"."PluginInstallation"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PluginInstallation" ADD CONSTRAINT "PluginInstallation_plugin_id_Plugin_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."Plugin"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PluginService" ADD CONSTRAINT "PluginService_plugin_installation_id_PluginInstallation_id_fk" FOREIGN KEY ("plugin_installation_id") REFERENCES "public"."PluginInstallation"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PluginToPluginTag" ADD CONSTRAINT "PluginToPluginTag_plugin_id_Plugin_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."Plugin"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "PluginToPluginTag" ADD CONSTRAINT "PluginToPluginTag_plugin_tag_id_PluginTag_id_fk" FOREIGN KEY ("plugin_tag_id") REFERENCES "public"."PluginTag"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Project" ADD CONSTRAINT "Project_source_language_id_Language_id_fk" FOREIGN KEY ("source_language_id") REFERENCES "public"."Language"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Project" ADD CONSTRAINT "Project_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ProjectTargetLanguage" ADD CONSTRAINT "ProjectTargetLanguage_language_id_Language_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."Language"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ProjectTargetLanguage" ADD CONSTRAINT "ProjectTargetLanguage_project_id_Project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_translator_id_User_id_fk" FOREIGN KEY ("translator_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_translatable_element_id_TranslatableElement_id_fk" FOREIGN KEY ("translatable_element_id") REFERENCES "public"."TranslatableElement"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_language_id_Language_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."Language"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_embedding_id_Vector_id_fk" FOREIGN KEY ("embedding_id") REFERENCES "public"."Vector"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_vectorizer_id_PluginService_id_fk" FOREIGN KEY ("vectorizer_id") REFERENCES "public"."PluginService"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslationApprovement" ADD CONSTRAINT "TranslationApprovement_translation_id_Translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."Translation"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslationApprovement" ADD CONSTRAINT "TranslationApprovement_creator_id_User_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslationVote" ADD CONSTRAINT "TranslationVote_voter_id_User_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "TranslationVote" ADD CONSTRAINT "TranslationVote_translation_id_Translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."Translation"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Account" ADD CONSTRAINT "Account_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "Document_project_id_index" ON "Document" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "DocumentToTask_task_id_index" ON "DocumentToTask" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "File_document_id_index" ON "File" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "File_user_id_index" ON "File" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "GlossaryToProject_project_id_index" ON "GlossaryToProject" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "Term_language_id_index" ON "Term" USING btree ("language_id" text_ops);--> statement-breakpoint
CREATE INDEX "TermRelation_translation_id_index" ON "TermRelation" USING btree ("translation_id" int4_ops);--> statement-breakpoint
CREATE INDEX "MemoryToProject_project_id_index" ON "MemoryToProject" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "Setting_key_index" ON "Setting" USING btree ("key" text_ops);--> statement-breakpoint
CREATE INDEX "Task_meta_index" ON "Task" USING btree ("meta" jsonb_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "PluginConfig_plugin_id_index" ON "PluginConfig" USING btree ("plugin_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "PluginConfigInstance_plugin_installation_id_config_id_index" ON "PluginConfigInstance" USING btree ("plugin_installation_id" int4_ops,"config_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "PluginInstallation_scope_type_scope_id_plugin_id_index" ON "PluginInstallation" USING btree ("scope_type" enum_ops,"scope_id" text_ops,"plugin_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "PluginService_service_type_service_id_plugin_installation_id_index" ON "PluginService" USING btree ("service_type" enum_ops,"service_id" text_ops,"plugin_installation_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "PluginTag_name_index" ON "PluginTag" USING btree ("name" text_ops);--> statement-breakpoint
CREATE INDEX "PluginToPluginTag_plugin_tag_id_index" ON "PluginToPluginTag" USING btree ("plugin_tag_id" int4_ops);--> statement-breakpoint
CREATE INDEX "Project_creator_id_index" ON "Project" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "ProjectTargetLanguage_project_id_index" ON "ProjectTargetLanguage" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "Translation_translator_id_language_id_translatable_element_id_value_index" ON "Translation" USING btree ("translator_id","language_id" text_ops,"translatable_element_id" int4_ops,"value" text_ops);--> statement-breakpoint
CREATE INDEX "TranslationVote_translation_id_index" ON "TranslationVote" USING btree ("translation_id" int4_ops);--> statement-breakpoint
CREATE INDEX "TranslationVote_voter_id_index" ON "TranslationVote" USING btree ("voter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "TranslationVote_voter_id_translation_id_index" ON "TranslationVote" USING btree ("voter_id","translation_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Account_user_id_provider_index" ON "Account" USING btree ("user_id","provider" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "User_email_index" ON "User" USING btree ("email" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "User_name_index" ON "User" USING btree ("name" text_ops);