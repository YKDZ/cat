import * as z from "zod";

export const TokenTypeValues = [
  "text",
  "number",
  "variable",
  "whitespace",
  "term",
  "link",
  "mask",
  "space",
  "newline",
  "unknown",
] as const;

export const TokenTypeSchema = z.enum(TokenTypeValues);
export type TokenType = (typeof TokenTypeValues)[number];

export const TaskStatusValues = ["COMPLETED", "PENDING", "FAILED"] as const;
export const TaskStatusSchema = z.enum(TaskStatusValues);

export const PluginServiceTypeValues = [
  "AUTH_FACTOR",
  "STORAGE_PROVIDER",
  "FILE_IMPORTER",
  "FILE_EXPORTER",
  "TRANSLATION_ADVISOR",
  "TEXT_VECTORIZER",
  "VECTOR_STORAGE",
  "QA_CHECKER",
  "TOKENIZER",
  "LLM_PROVIDER",
  "RERANK_PROVIDER",
  "AGENT_TOOL_PROVIDER",
  "AGENT_CONTEXT_PROVIDER",
  "NLP_WORD_SEGMENTER",
  "EMAIL_PROVIDER",
] as const;
export const PluginServiceTypeSchema = z.enum(PluginServiceTypeValues);

export const ScopeTypeValues = ["GLOBAL", "PROJECT", "USER"] as const;
export const ScopeTypeSchema = z.enum(ScopeTypeValues);

export const ResourceTypeValues = [
  "PROJECT",
  "CONTENT_NODE",
  "CONTENT_RELATION",
  "CONTEXT_EVIDENCE",
  "CONTEXT_PROFILE",
  "ELEMENT",
  "COMMENT",
  "TERM",
  "PLUGIN",
  "GLOSSARY",
  "MEMORY",
  "SETTING",
  "TASK",
  "TRANSLATION",
  "USER",
] as const;
export const ResourceTypeSchema = z.enum(ResourceTypeValues);

export const TranslatableElementContextTypeValues = [
  "TEXT",
  "JSON",
  "FILE",
  "MARKDOWN",
  "URL",
  "IMAGE",
] as const;
export const TranslatableElementContextTypeSchema = z.enum(
  TranslatableElementContextTypeValues,
);

export const ContentNodeKindValues = [
  "PROJECT_ROOT",
  "DIRECTORY",
  "FILE",
  "MARKDOWN_SECTION",
  "SOURCE_COMPONENT",
  "UI_ROUTE",
  "MODULE",
  "MOD",
  "VERSION",
  "NAMESPACE",
  "CHAPTER",
  "PACKAGE",
  "SCREENSHOT_TARGET",
  "CUSTOM",
] as const;
export const ContentNodeKindSchema = z.enum(ContentNodeKindValues);
export type ContentNodeKind = (typeof ContentNodeKindValues)[number];

export const ContentNodeLifecycleStatusValues = [
  "ACTIVE",
  "DRAFT",
  "DELETED",
  "QUARANTINED",
] as const;
export const ContentNodeLifecycleStatusSchema = z.enum(
  ContentNodeLifecycleStatusValues,
);
export type ContentNodeLifecycleStatus =
  (typeof ContentNodeLifecycleStatusValues)[number];

export const ContentNodeExportRoleValues = [
  "NONE",
  "PROJECT_ROOT",
  "DIRECTORY",
  "FILE",
  "SECTION",
] as const;
export const ContentNodeExportRoleSchema = z.enum(ContentNodeExportRoleValues);
export type ContentNodeExportRole =
  (typeof ContentNodeExportRoleValues)[number];

export const ContentBoundaryTypeValues = [
  "PROJECT",
  "SOURCE_ROOT",
  "DIRECTORY",
  "FILE",
  "MODULE",
  "MOD",
  "NAMESPACE",
  "NONE",
] as const;
export const ContentBoundaryTypeSchema = z.enum(ContentBoundaryTypeValues);
export type ContentBoundaryType = (typeof ContentBoundaryTypeValues)[number];

export const RelationEndpointKindValues = ["NODE", "ELEMENT"] as const;
export const RelationEndpointKindSchema = z.enum(RelationEndpointKindValues);
export type RelationEndpointKind = (typeof RelationEndpointKindValues)[number];

export const ContentRelationSemanticFamilyValues = [
  "CONTAINMENT",
  "ORDERING",
  "SOURCE_REFERENCE",
  "SCOPE",
  "DEPENDENCY",
  "VERSIONING",
  "EVIDENCE",
  "DISCUSSION",
  "DUPLICATE",
  "SEMANTIC",
  "CUSTOM",
] as const;
export const ContentRelationSemanticFamilySchema = z.enum(
  ContentRelationSemanticFamilyValues,
);
export type ContentRelationSemanticFamily =
  (typeof ContentRelationSemanticFamilyValues)[number];

export const ContentRelationDirectionalityValues = [
  "DIRECTED",
  "UNDIRECTED",
] as const;
export const ContentRelationDirectionalitySchema = z.enum(
  ContentRelationDirectionalityValues,
);
export type ContentRelationDirectionality =
  (typeof ContentRelationDirectionalityValues)[number];

export const ContentRelationLifecycleStatusValues = [
  "ACTIVE",
  "DRAFT",
  "DEPRECATED",
  "DELETED",
] as const;
export const ContentRelationLifecycleStatusSchema = z.enum(
  ContentRelationLifecycleStatusValues,
);
export type ContentRelationLifecycleStatus =
  (typeof ContentRelationLifecycleStatusValues)[number];

export const EvidenceTrustLevelValues = [
  "UNTRUSTED",
  "COLLECTED",
  "VERIFIED",
  "REVIEW_APPROVED",
] as const;
export const EvidenceTrustLevelSchema = z.enum(EvidenceTrustLevelValues);
export type EvidenceTrustLevel = (typeof EvidenceTrustLevelValues)[number];

export const ContentEvidenceKindValues = [
  "TEXT",
  "JSON",
  "FILE",
  "MARKDOWN",
  "URL",
  "IMAGE",
  "SOURCE_LOCATION",
  "COMMENT",
  "SCREENSHOT",
  "GENERATED_ANALYSIS",
  "EXTERNAL_REFERENCE",
] as const;
export const ContentEvidenceKindSchema = z.enum(ContentEvidenceKindValues);
export type ContentEvidenceKind = (typeof ContentEvidenceKindValues)[number];

export const ContextConsumerPurposeValues = [
  "EDITOR",
  "RECALL",
  "QA",
  "AI",
  "AGENT",
] as const;
export const ContextConsumerPurposeSchema = z.enum(
  ContextConsumerPurposeValues,
);
export type ContextConsumerPurpose =
  (typeof ContextConsumerPurposeValues)[number];

export const ScopeBindingAssetKindValues = [
  "GLOSSARY",
  "TERM_CONCEPT",
  "TERM",
  "MEMORY",
  "MEMORY_ITEM",
  "QA_PROFILE",
  "CONTEXT_PROFILE",
] as const;
export const ScopeBindingAssetKindSchema = z.enum(ScopeBindingAssetKindValues);
export type ScopeBindingAssetKind =
  (typeof ScopeBindingAssetKindValues)[number];

export const ScopeBindingModeValues = ["ELIGIBLE_ONLY", "BOOST"] as const;
export const ScopeBindingModeSchema = z.enum(ScopeBindingModeValues);
export type ScopeBindingMode = (typeof ScopeBindingModeValues)[number];

export const SemanticDiffKindValues = [
  "CREATE",
  "DELETE",
  "SOURCE_TEXT_UPDATE",
  "MOVE",
  "REPARENT",
  "RELATION_ADD",
  "RELATION_REMOVE",
  "EVIDENCE_UPDATE",
  "METADATA_ONLY",
  "IDENTITY_CONFLICT",
] as const;
export const SemanticDiffKindSchema = z.enum(SemanticDiffKindValues);
export type SemanticDiffKind = (typeof SemanticDiffKindValues)[number];

export const VectorInvalidationReasonValues = [
  "NEW_SOURCE_TEXT",
  "SOURCE_TEXT_CHANGED",
  "NOT_REQUIRED",
  "IDENTITY_CONFLICT",
] as const;
export const VectorInvalidationReasonSchema = z.enum(
  VectorInvalidationReasonValues,
);
export type VectorInvalidationReason =
  (typeof VectorInvalidationReasonValues)[number];

export const ContentIdentityStatusValues = [
  "ACTIVE",
  "DELETED",
  "QUARANTINED",
  "CONFLICT",
] as const;
export const ContentIdentityStatusSchema = z.enum(ContentIdentityStatusValues);
export type ContentIdentityStatus =
  (typeof ContentIdentityStatusValues)[number];

export const CommentReactionTypeValues = [
  "+1",
  "-1",
  "LAUGH",
  "HOORAY",
  "CONFUSED",
  "HEART",
  "ROCKET",
  "EYES",
] as const;
export const CommentReactionTypeSchema = z.enum(CommentReactionTypeValues);

export const CommentTargetTypeValues = ["TRANSLATION", "ELEMENT"] as const;
export const CommentTargetTypeSchema = z.enum(CommentTargetTypeValues);

export const TermTypeValues = [
  "NOT_SPECIFIED",
  "FULL_FORM",
  "ACRONYM",
  "ABBREVIATION",
  "SHORT_FORM",
  "VARIANT",
  "PHRASE",
] as const;
export const TermTypeSchema = z.enum(TermTypeValues);

export const TermStatusValues = [
  "NOT_SPECIFIED",
  "PREFERRED",
  "ADMITTED",
  "NOT_RECOMMENDED",
  "OBSOLETE",
] as const;
export const TermStatusSchema = z.enum(TermStatusValues);

export type PluginServiceType = (typeof PluginServiceTypeValues)[number];
export type ScopeType = (typeof ScopeTypeValues)[number];
export type TaskStatus = (typeof TaskStatusValues)[number];
export type TranslatableElementContextType =
  (typeof TranslatableElementContextTypeValues)[number];
export type CommentReactionType = (typeof CommentReactionTypeValues)[number];
export type ResourceType = (typeof ResourceTypeValues)[number];
export type CommentTargetType = (typeof CommentTargetTypeValues)[number];
export type TermType = (typeof TermTypeValues)[number];
export type TermStatus = (typeof TermStatusValues)[number];

export const AgentSessionStatusValues = [
  "ACTIVE",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export const AgentSessionStatusSchema = z.enum(AgentSessionStatusValues);

export type AgentSessionStatus = (typeof AgentSessionStatusValues)[number];

export const AgentToolTargetValues = ["SERVER", "CLIENT"] as const;
export const AgentToolTargetSchema = z.enum(AgentToolTargetValues);

export const AgentToolConfirmationStatusValues = [
  "AUTO_ALLOWED",
  "USER_APPROVED",
  "USER_DENIED",
] as const;
export const AgentToolConfirmationStatusSchema = z.enum(
  AgentToolConfirmationStatusValues,
);

export const AgentSessionTrustPolicyValues = [
  "CONFIRM_ALL",
  "TRUST_SESSION",
] as const;
export const AgentSessionTrustPolicySchema = z.enum(
  AgentSessionTrustPolicyValues,
);

export const AgentDefinitionTypeValues = [
  "GENERAL",
  "GHOST_TEXT",
  "WORKFLOW",
] as const;
export const AgentDefinitionTypeSchema = z.enum(AgentDefinitionTypeValues);

// ============ Permission System Enums ============

export const ObjectTypeValues = [
  "system",
  "project",
  "content_node",
  "content_relation",
  "context_evidence",
  "context_profile",
  "element",
  "glossary",
  "memory",
  "term",
  "translation",
  "comment",
  "plugin",
  "setting",
  "task",
  "agent_definition",
  "user",
] as const;
export const ObjectTypeSchema = z.enum(ObjectTypeValues);
export type ObjectType = (typeof ObjectTypeValues)[number];

export const SubjectTypeValues = ["user", "role", "agent"] as const;
export const SubjectTypeSchema = z.enum(SubjectTypeValues);
export type SubjectType = (typeof SubjectTypeValues)[number];

export const RelationValues = [
  "superadmin",
  "admin",
  "owner",
  "editor",
  "viewer",
  "member",
  "direct_editor",
  "isolation_forced",
] as const;
export const RelationSchema = z.enum(RelationValues);
export type Relation = (typeof RelationValues)[number];

export const PermissionActionValues = ["check", "grant", "revoke"] as const;
export const PermissionActionSchema = z.enum(PermissionActionValues);
export type PermissionAction = (typeof PermissionActionValues)[number];

export type AgentToolTarget = (typeof AgentToolTargetValues)[number];
export type AgentToolConfirmationStatus =
  (typeof AgentToolConfirmationStatusValues)[number];
export type AgentSessionTrustPolicy =
  (typeof AgentSessionTrustPolicyValues)[number];
export type AgentDefinitionType = (typeof AgentDefinitionTypeValues)[number];

// ─── Message System ───

export const MessageChannelValues = ["IN_APP", "EMAIL"] as const;
export const MessageChannelSchema = z.enum(MessageChannelValues);
export type MessageChannel = (typeof MessageChannelValues)[number];

export const MessageCategoryValues = [
  "SYSTEM",
  "COMMENT_REPLY",
  "TRANSLATION",
  "PROJECT",
  "QA",
] as const;
export const MessageCategorySchema = z.enum(MessageCategoryValues);
export type MessageCategory = (typeof MessageCategoryValues)[number];

export const NotificationStatusValues = ["UNREAD", "READ", "ARCHIVED"] as const;
export const NotificationStatusSchema = z.enum(NotificationStatusValues);
export type NotificationStatus = (typeof NotificationStatusValues)[number];

// ─── Issue System ───

export const IssueStatusValues = ["OPEN", "CLOSED"] as const;
export const IssueStatusSchema = z.enum(IssueStatusValues);
export type IssueStatus = (typeof IssueStatusValues)[number];

export const PullRequestStatusValues = [
  "DRAFT",
  "OPEN",
  "REVIEW",
  "CHANGES_REQUESTED",
  "MERGED",
  "CLOSED",
] as const;
export const PullRequestStatusSchema = z.enum(PullRequestStatusValues);
export type PullRequestStatus = (typeof PullRequestStatusValues)[number];

export const PullRequestTypeValues = ["MANUAL", "AUTO_TRANSLATE"] as const;
export const PullRequestTypeSchema = z.enum(PullRequestTypeValues);
export type PullRequestType = (typeof PullRequestTypeValues)[number];

export const EntityBranchStatusValues = [
  "ACTIVE",
  "MERGED",
  "ABANDONED",
] as const;
export const EntityBranchStatusSchema = z.enum(EntityBranchStatusValues);
export type EntityBranchStatus = (typeof EntityBranchStatusValues)[number];

export const IssueCommentTargetTypeValues = ["issue", "pr"] as const;
export const IssueCommentTargetTypeSchema = z.enum(
  IssueCommentTargetTypeValues,
);
export type IssueCommentTargetType =
  (typeof IssueCommentTargetTypeValues)[number];

export const CrossReferenceSourceTypeValues = [
  "issue",
  "pr",
  "issue_comment",
] as const;
export const CrossReferenceSourceTypeSchema = z.enum(
  CrossReferenceSourceTypeValues,
);
export type CrossReferenceSourceType =
  (typeof CrossReferenceSourceTypeValues)[number];

export const CrossReferenceTargetTypeValues = ["issue", "pr"] as const;
export const CrossReferenceTargetTypeSchema = z.enum(
  CrossReferenceTargetTypeValues,
);
export type CrossReferenceTargetType =
  (typeof CrossReferenceTargetTypeValues)[number];

// ─── ChangeSet Status ──────────────────────────────────────

export const ChangesetStatusValues = [
  "PENDING",
  "APPROVED",
  "PARTIALLY_APPROVED",
  "REJECTED",
  "APPLIED",
  "CONFLICT",
] as const;
export const ChangesetStatusSchema = z.enum(ChangesetStatusValues);
export type ChangesetStatus = (typeof ChangesetStatusValues)[number];

// ─── Entity Types ──────────────────────────────────────────

export const EntityTypeValues = [
  "translation",
  "auto_translation",
  "element",
  "content_node",
  "content_relation",
  "content_relation_type",
  "context_evidence",
  "context_profile",
  "scope_binding",
  "semantic_diff",
  "comment",
  "comment_reaction",
  "term",
  "term_concept",
  "memory_item",
  "project_settings",
  "project_member",
  "project_attributes",
  "project",
  "issue",
] as const;
export const EntityTypeSchema = z.enum(EntityTypeValues);
export type EntityType = (typeof EntityTypeValues)[number];

// ─── Change Action ─────────────────────────────────────────

export const ChangeActionValues = ["CREATE", "UPDATE", "DELETE"] as const;
export const ChangeActionSchema = z.enum(ChangeActionValues);
export type ChangeAction = (typeof ChangeActionValues)[number];

// ─── Risk Level ────────────────────────────────────────────

export const RiskLevelValues = ["LOW", "MEDIUM", "HIGH"] as const;
export const RiskLevelSchema = z.enum(RiskLevelValues);
export type RiskLevel = (typeof RiskLevelValues)[number];

// ─── Review Status ─────────────────────────────────────────

export const ReviewStatusValues = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CONFLICT",
] as const;
export const ReviewStatusSchema = z.enum(ReviewStatusValues);
export type ReviewStatus = (typeof ReviewStatusValues)[number];

// ─── Async Status ──────────────────────────────────────────

export const AsyncStatusValues = ["READY", "PENDING", "FAILED"] as const;
export const AsyncStatusSchema = z.enum(AsyncStatusValues).nullable();
export type AsyncStatus = (typeof AsyncStatusValues)[number];

export const ChangesetEntryAsyncStatusValues = [
  "ALL_READY",
  "HAS_PENDING",
  "HAS_FAILED",
] as const;
export const ChangesetEntryAsyncStatusSchema = z
  .enum(ChangesetEntryAsyncStatusValues)
  .nullable();
export type ChangesetEntryAsyncStatus =
  (typeof ChangesetEntryAsyncStatusValues)[number];

// ─── Recall Variant Type ───────────────────────────────────────

export const RecallVariantTypeValues = [
  "SURFACE",
  "CASE_FOLDED",
  "LEMMA",
  "TOKEN_TEMPLATE",
  "FRAGMENT",
] as const;
export const RecallVariantTypeSchema = z.enum(RecallVariantTypeValues);
export type RecallVariantType = (typeof RecallVariantTypeValues)[number];

// ─── Recall Query Side ─────────────────────────────────────────

export const RecallQuerySideValues = ["SOURCE", "TRANSLATION"] as const;
export const RecallQuerySideSchema = z.enum(RecallQuerySideValues);
export type RecallQuerySide = (typeof RecallQuerySideValues)[number];
