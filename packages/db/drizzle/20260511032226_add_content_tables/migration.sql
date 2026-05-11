CREATE TYPE "ContentBoundaryType" AS ENUM('PROJECT', 'SOURCE_ROOT', 'DIRECTORY', 'FILE', 'MODULE', 'MOD', 'NAMESPACE', 'NONE');--> statement-breakpoint
CREATE TYPE "ContentEvidenceKind" AS ENUM('TEXT', 'JSON', 'FILE', 'MARKDOWN', 'URL', 'IMAGE', 'SOURCE_LOCATION', 'COMMENT', 'SCREENSHOT', 'GENERATED_ANALYSIS', 'EXTERNAL_REFERENCE');--> statement-breakpoint
CREATE TYPE "ContentIdentityStatus" AS ENUM('ACTIVE', 'DELETED', 'QUARANTINED', 'CONFLICT');--> statement-breakpoint
CREATE TYPE "ContentNodeExportRole" AS ENUM('NONE', 'PROJECT_ROOT', 'DIRECTORY', 'FILE', 'SECTION');--> statement-breakpoint
CREATE TYPE "ContentNodeKind" AS ENUM('PROJECT_ROOT', 'DIRECTORY', 'FILE', 'MARKDOWN_SECTION', 'SOURCE_COMPONENT', 'UI_ROUTE', 'MODULE', 'MOD', 'VERSION', 'NAMESPACE', 'CHAPTER', 'PACKAGE', 'SCREENSHOT_TARGET', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "ContentNodeLifecycleStatus" AS ENUM('ACTIVE', 'DRAFT', 'DELETED', 'QUARANTINED');--> statement-breakpoint
CREATE TYPE "ContentRelationDirectionality" AS ENUM('DIRECTED', 'UNDIRECTED');--> statement-breakpoint
CREATE TYPE "ContentRelationLifecycleStatus" AS ENUM('ACTIVE', 'DRAFT', 'DEPRECATED', 'DELETED');--> statement-breakpoint
CREATE TYPE "ContentRelationSemanticFamily" AS ENUM('CONTAINMENT', 'ORDERING', 'SOURCE_REFERENCE', 'SCOPE', 'DEPENDENCY', 'VERSIONING', 'EVIDENCE', 'DISCUSSION', 'DUPLICATE', 'SEMANTIC', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "ContextConsumerPurpose" AS ENUM('EDITOR', 'RECALL', 'QA', 'AI', 'AGENT');--> statement-breakpoint
CREATE TYPE "EvidenceTrustLevel" AS ENUM('UNTRUSTED', 'COLLECTED', 'VERIFIED', 'REVIEW_APPROVED');--> statement-breakpoint
CREATE TYPE "RelationEndpointKind" AS ENUM('NODE', 'ELEMENT');--> statement-breakpoint
CREATE TYPE "ScopeBindingAssetKind" AS ENUM('GLOSSARY', 'TERM_CONCEPT', 'TERM', 'MEMORY', 'MEMORY_ITEM', 'QA_PROFILE', 'CONTEXT_PROFILE');--> statement-breakpoint
CREATE TYPE "ScopeBindingMode" AS ENUM('ELIGIBLE_ONLY', 'BOOST');--> statement-breakpoint
CREATE TYPE "SemanticDiffKind" AS ENUM('CREATE', 'DELETE', 'SOURCE_TEXT_UPDATE', 'MOVE', 'REPARENT', 'RELATION_ADD', 'RELATION_REMOVE', 'EVIDENCE_UPDATE', 'METADATA_ONLY', 'IDENTITY_CONFLICT');--> statement-breakpoint
CREATE TYPE "VectorInvalidationReason" AS ENUM('NEW_SOURCE_TEXT', 'SOURCE_TEXT_CHANGED', 'NOT_REQUIRED', 'IDENTITY_CONFLICT');--> statement-breakpoint
CREATE TABLE "ContentNode" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"project_id" uuid NOT NULL,
	"creator_id" uuid,
	"kind" "ContentNodeKind" NOT NULL,
	"display_label" text NOT NULL,
	"importer_id" text,
	"source_root_ref" text,
	"stable_source_node_ref" text,
	"source_uri" text,
	"source_path" text,
	"source_type" text,
	"language_id" text,
	"export_role" "ContentNodeExportRole" DEFAULT 'NONE'::"ContentNodeExportRole" NOT NULL,
	"boundary_type" "ContentBoundaryType" DEFAULT 'NONE'::"ContentBoundaryType" NOT NULL,
	"file_handler_id" integer,
	"file_id" integer,
	"lifecycle_status" "ContentNodeLifecycleStatus" DEFAULT 'ACTIVE'::"ContentNodeLifecycleStatus" NOT NULL,
	"provenance" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ContentNodeToTask" (
	"content_node_id" uuid,
	"task_id" uuid,
	CONSTRAINT "ContentNodeToTask_pkey" PRIMARY KEY("content_node_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "ContentRelation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"project_id" uuid NOT NULL,
	"relation_type_id" integer NOT NULL,
	"source_endpoint_kind" "RelationEndpointKind" NOT NULL,
	"source_node_id" uuid,
	"source_element_id" integer,
	"target_endpoint_kind" "RelationEndpointKind" NOT NULL,
	"target_node_id" uuid,
	"target_element_id" integer,
	"is_primary" boolean DEFAULT false NOT NULL,
	"local_order" integer,
	"confidence_basis_points" integer DEFAULT 10000 NOT NULL,
	"lifecycle_status" "ContentRelationLifecycleStatus" DEFAULT 'ACTIVE'::"ContentRelationLifecycleStatus" NOT NULL,
	"weight_hint" jsonb,
	"provenance" jsonb,
	"validation_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contentRelation_source_endpoint_check" CHECK ((
        ("source_endpoint_kind" = 'NODE' AND "source_node_id" IS NOT NULL AND "source_element_id" IS NULL)
        OR ("source_endpoint_kind" = 'ELEMENT' AND "source_element_id" IS NOT NULL AND "source_node_id" IS NULL)
      )),
	CONSTRAINT "contentRelation_target_endpoint_check" CHECK ((
        ("target_endpoint_kind" = 'NODE' AND "target_node_id" IS NOT NULL AND "target_element_id" IS NULL)
        OR ("target_endpoint_kind" = 'ELEMENT' AND "target_element_id" IS NOT NULL AND "target_node_id" IS NULL)
      )),
	CONSTRAINT "contentRelation_confidence_check" CHECK ("confidence_basis_points" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "ContentRelationType" (
	"id" serial PRIMARY KEY,
	"namespace" text NOT NULL,
	"name" text NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"owner_plugin_id" text,
	"semantic_family" "ContentRelationSemanticFamily" NOT NULL,
	"allowed_endpoint_pairs" jsonb NOT NULL,
	"directionality" "ContentRelationDirectionality" DEFAULT 'DIRECTED'::"ContentRelationDirectionality" NOT NULL,
	"participates_in_containment" boolean DEFAULT false NOT NULL,
	"participates_in_export" boolean DEFAULT false NOT NULL,
	"supports_ordering" boolean DEFAULT false NOT NULL,
	"weighting_eligible" boolean DEFAULT false NOT NULL,
	"default_trust_level" "EvidenceTrustLevel" DEFAULT 'COLLECTED'::"EvidenceTrustLevel" NOT NULL,
	"deprecation" jsonb,
	"migration" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ContentRelationType_namespace_name_version_unique" UNIQUE("namespace","name","version")
);
--> statement-breakpoint
CREATE TABLE "ContextEvidence" (
	"id" serial PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"attached_endpoint_kind" text NOT NULL,
	"content_node_id" uuid,
	"content_relation_id" uuid,
	"translatable_element_id" integer,
	"kind" "ContentEvidenceKind" NOT NULL,
	"trust_level" "EvidenceTrustLevel" DEFAULT 'COLLECTED'::"EvidenceTrustLevel" NOT NULL,
	"freshness_at" timestamp with time zone,
	"json_data" jsonb,
	"file_id" integer,
	"storage_provider_id" integer,
	"text_data" text,
	"display_label" text,
	"provenance" jsonb,
	"graph_explanation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contextEvidence_endpoint_check" CHECK ((
        ("attached_endpoint_kind" = 'NODE' AND "content_node_id" IS NOT NULL AND "content_relation_id" IS NULL AND "translatable_element_id" IS NULL)
        OR ("attached_endpoint_kind" = 'RELATION' AND "content_relation_id" IS NOT NULL AND "content_node_id" IS NULL AND "translatable_element_id" IS NULL)
        OR ("attached_endpoint_kind" = 'ELEMENT' AND "translatable_element_id" IS NOT NULL AND "content_node_id" IS NULL AND "content_relation_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "ContextProfile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ContextProfile_project_id_name_unique" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "ScopeBinding" (
	"id" serial PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"asset_kind" "ScopeBindingAssetKind" NOT NULL,
	"asset_id" text NOT NULL,
	"mode" "ScopeBindingMode" NOT NULL,
	"content_node_id" uuid,
	"content_relation_id" uuid,
	"weight_boost" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scopeBinding_scope_check" CHECK ((
        ("content_node_id" IS NOT NULL AND "content_relation_id" IS NULL)
        OR ("content_node_id" IS NULL AND "content_relation_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "SemanticDiffEntry" (
	"id" serial PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"changeset_id" integer,
	"diff_kind" "SemanticDiffKind" NOT NULL,
	"element_id" integer,
	"content_node_id" uuid,
	"content_relation_id" uuid,
	"vector_invalidation_reason" "VectorInvalidationReason" NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "TranslatableElement" DROP CONSTRAINT "TranslatableElement_document_id_Document_id_fkey";--> statement-breakpoint
ALTER TABLE "DocumentClosure" DROP CONSTRAINT "DocumentClosure_ancestor_Document_id_fkey";--> statement-breakpoint
ALTER TABLE "DocumentClosure" DROP CONSTRAINT "DocumentClosure_descendant_Document_id_fkey";--> statement-breakpoint
ALTER TABLE "DocumentToTask" DROP CONSTRAINT "DocumentToTask_document_id_Document_id_fkey";--> statement-breakpoint
DROP TABLE "Document";--> statement-breakpoint
DROP TABLE "DocumentClosure";--> statement-breakpoint
DROP TABLE "DocumentToTask";--> statement-breakpoint
DROP TABLE "TranslatableElementContext";--> statement-breakpoint
DROP INDEX "TranslatableElement_document_id_sort_index_index";--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD COLUMN "project_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD COLUMN "importer_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD COLUMN "source_root_ref" text NOT NULL;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD COLUMN "source_node_ref" text NOT NULL;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD COLUMN "stable_source_ref" text NOT NULL;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD COLUMN "identity_status" "ContentIdentityStatus" DEFAULT 'ACTIVE'::"ContentIdentityStatus" NOT NULL;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD COLUMN "identity_confidence" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "ChangesetEntry" ALTER COLUMN "entity_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "EntityType";--> statement-breakpoint
CREATE TYPE "EntityType" AS ENUM('translation', 'auto_translation', 'element', 'content_node', 'content_relation', 'content_relation_type', 'context_evidence', 'context_profile', 'scope_binding', 'semantic_diff', 'comment', 'comment_reaction', 'term', 'term_concept', 'memory_item', 'project_settings', 'project_member', 'project_attributes', 'project', 'issue');--> statement-breakpoint
ALTER TABLE "ChangesetEntry" ALTER COLUMN "entity_type" SET DATA TYPE "EntityType" USING "entity_type"::"EntityType";--> statement-breakpoint
ALTER TABLE "AuthAuditLog" ALTER COLUMN "object_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "PermissionTuple" ALTER COLUMN "object_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "ObjectType";--> statement-breakpoint
CREATE TYPE "ObjectType" AS ENUM('system', 'project', 'content_node', 'content_relation', 'context_evidence', 'context_profile', 'element', 'glossary', 'memory', 'term', 'translation', 'comment', 'plugin', 'setting', 'task', 'agent_definition', 'user');--> statement-breakpoint
ALTER TABLE "AuthAuditLog" ALTER COLUMN "object_type" SET DATA TYPE "ObjectType" USING "object_type"::"ObjectType";--> statement-breakpoint
ALTER TABLE "PermissionTuple" ALTER COLUMN "object_type" SET DATA TYPE "ObjectType" USING "object_type"::"ObjectType";--> statement-breakpoint
DROP TYPE "ResourceType";--> statement-breakpoint
CREATE TYPE "ResourceType" AS ENUM('PROJECT', 'CONTENT_NODE', 'CONTENT_RELATION', 'CONTEXT_EVIDENCE', 'CONTEXT_PROFILE', 'ELEMENT', 'COMMENT', 'TERM', 'PLUGIN', 'GLOSSARY', 'MEMORY', 'SETTING', 'TASK', 'TRANSLATION', 'USER');--> statement-breakpoint
ALTER TABLE "TranslatableElement" DROP COLUMN "document_id";--> statement-breakpoint
ALTER TABLE "TranslatableElement" DROP COLUMN "sort_index";--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_project_id_importer_id_source_root_ref_source_node_ref_stable_source_ref_unique" UNIQUE("project_id","importer_id","source_root_ref","source_node_ref","stable_source_ref");--> statement-breakpoint
CREATE INDEX "ContentNode_project_id_index" ON "ContentNode" ("project_id");--> statement-breakpoint
CREATE INDEX "ContentNode_source_path_index" ON "ContentNode" ("source_path");--> statement-breakpoint
CREATE UNIQUE INDEX "ContentNode_project_id_importer_id_source_root_ref_stable_source_node_ref_index" ON "ContentNode" ("project_id","importer_id","source_root_ref","stable_source_node_ref") WHERE "stable_source_node_ref" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ContentNodeToTask_task_id_index" ON "ContentNodeToTask" ("task_id");--> statement-breakpoint
CREATE INDEX "ContentRelation_project_id_index" ON "ContentRelation" ("project_id");--> statement-breakpoint
CREATE INDEX "ContentRelation_relation_type_id_index" ON "ContentRelation" ("relation_type_id");--> statement-breakpoint
CREATE INDEX "ContentRelation_source_node_id_index" ON "ContentRelation" ("source_node_id");--> statement-breakpoint
CREATE INDEX "ContentRelation_target_node_id_index" ON "ContentRelation" ("target_node_id");--> statement-breakpoint
CREATE INDEX "ContentRelation_source_element_id_index" ON "ContentRelation" ("source_element_id");--> statement-breakpoint
CREATE INDEX "ContentRelation_target_element_id_index" ON "ContentRelation" ("target_element_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ContentRelation_project_id_target_node_id_index" ON "ContentRelation" ("project_id","target_node_id") WHERE "is_primary" = true AND "target_endpoint_kind" = 'NODE' AND "lifecycle_status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "ContentRelation_project_id_target_element_id_index" ON "ContentRelation" ("project_id","target_element_id") WHERE "is_primary" = true AND "target_endpoint_kind" = 'ELEMENT' AND "lifecycle_status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "ContextEvidence_project_id_index" ON "ContextEvidence" ("project_id");--> statement-breakpoint
CREATE INDEX "ContextEvidence_content_node_id_index" ON "ContextEvidence" ("content_node_id");--> statement-breakpoint
CREATE INDEX "ContextEvidence_content_relation_id_index" ON "ContextEvidence" ("content_relation_id");--> statement-breakpoint
CREATE INDEX "ContextEvidence_translatable_element_id_index" ON "ContextEvidence" ("translatable_element_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ContextProfile_project_id_index" ON "ContextProfile" ("project_id") WHERE "is_default" = true;--> statement-breakpoint
CREATE INDEX "ScopeBinding_project_id_asset_kind_asset_id_index" ON "ScopeBinding" ("project_id","asset_kind","asset_id");--> statement-breakpoint
CREATE INDEX "SemanticDiffEntry_project_id_diff_kind_index" ON "SemanticDiffEntry" ("project_id","diff_kind");--> statement-breakpoint
CREATE INDEX "SemanticDiffEntry_changeset_id_index" ON "SemanticDiffEntry" ("changeset_id");--> statement-breakpoint
CREATE INDEX "SemanticDiffEntry_element_id_index" ON "SemanticDiffEntry" ("element_id");--> statement-breakpoint
CREATE INDEX "TranslatableElement_project_id_index" ON "TranslatableElement" ("project_id");--> statement-breakpoint
CREATE INDEX "TranslatableElement_vectorized_string_id_index" ON "TranslatableElement" ("vectorized_string_id");--> statement-breakpoint
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_creator_id_User_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_language_id_Language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "Language"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_file_handler_id_PluginService_id_fkey" FOREIGN KEY ("file_handler_id") REFERENCES "PluginService"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_file_id_File_id_fkey" FOREIGN KEY ("file_id") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContentNodeToTask" ADD CONSTRAINT "ContentNodeToTask_content_node_id_ContentNode_id_fkey" FOREIGN KEY ("content_node_id") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContentNodeToTask" ADD CONSTRAINT "ContentNodeToTask_task_id_Task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContentRelation" ADD CONSTRAINT "ContentRelation_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContentRelation" ADD CONSTRAINT "ContentRelation_relation_type_id_ContentRelationType_id_fkey" FOREIGN KEY ("relation_type_id") REFERENCES "ContentRelationType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContentRelation" ADD CONSTRAINT "ContentRelation_source_node_id_ContentNode_id_fkey" FOREIGN KEY ("source_node_id") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContentRelation" ADD CONSTRAINT "ContentRelation_source_element_id_TranslatableElement_id_fkey" FOREIGN KEY ("source_element_id") REFERENCES "TranslatableElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContentRelation" ADD CONSTRAINT "ContentRelation_target_node_id_ContentNode_id_fkey" FOREIGN KEY ("target_node_id") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContentRelation" ADD CONSTRAINT "ContentRelation_target_element_id_TranslatableElement_id_fkey" FOREIGN KEY ("target_element_id") REFERENCES "TranslatableElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContentRelationType" ADD CONSTRAINT "ContentRelationType_owner_plugin_id_Plugin_id_fkey" FOREIGN KEY ("owner_plugin_id") REFERENCES "Plugin"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContextEvidence" ADD CONSTRAINT "ContextEvidence_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContextEvidence" ADD CONSTRAINT "ContextEvidence_content_node_id_ContentNode_id_fkey" FOREIGN KEY ("content_node_id") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContextEvidence" ADD CONSTRAINT "ContextEvidence_content_relation_id_ContentRelation_id_fkey" FOREIGN KEY ("content_relation_id") REFERENCES "ContentRelation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContextEvidence" ADD CONSTRAINT "ContextEvidence_XoIdOJz9nkr7_fkey" FOREIGN KEY ("translatable_element_id") REFERENCES "TranslatableElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContextEvidence" ADD CONSTRAINT "ContextEvidence_file_id_File_id_fkey" FOREIGN KEY ("file_id") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContextEvidence" ADD CONSTRAINT "ContextEvidence_storage_provider_id_PluginService_id_fkey" FOREIGN KEY ("storage_provider_id") REFERENCES "PluginService"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContextProfile" ADD CONSTRAINT "ContextProfile_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ScopeBinding" ADD CONSTRAINT "ScopeBinding_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ScopeBinding" ADD CONSTRAINT "ScopeBinding_content_node_id_ContentNode_id_fkey" FOREIGN KEY ("content_node_id") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ScopeBinding" ADD CONSTRAINT "ScopeBinding_content_relation_id_ContentRelation_id_fkey" FOREIGN KEY ("content_relation_id") REFERENCES "ContentRelation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SemanticDiffEntry" ADD CONSTRAINT "SemanticDiffEntry_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "SemanticDiffEntry" ADD CONSTRAINT "SemanticDiffEntry_changeset_id_Changeset_id_fkey" FOREIGN KEY ("changeset_id") REFERENCES "Changeset"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SemanticDiffEntry" ADD CONSTRAINT "SemanticDiffEntry_element_id_TranslatableElement_id_fkey" FOREIGN KEY ("element_id") REFERENCES "TranslatableElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SemanticDiffEntry" ADD CONSTRAINT "SemanticDiffEntry_content_node_id_ContentNode_id_fkey" FOREIGN KEY ("content_node_id") REFERENCES "ContentNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SemanticDiffEntry" ADD CONSTRAINT "SemanticDiffEntry_content_relation_id_ContentRelation_id_fkey" FOREIGN KEY ("content_relation_id") REFERENCES "ContentRelation"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "TranslatableElement_project_id_Project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TranslatableElement" ADD CONSTRAINT "translatableElement_identityConfidence_check" CHECK ("identity_confidence" BETWEEN 0 AND 10000);