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
  "AUTH_PROVIDER",
  "MFA_PROVIDER",
  "STORAGE_PROVIDER",
  "TERM_EXTRACTOR",
  "TERM_ALIGNER",
  "FILE_IMPORTER",
  "FILE_EXPORTER",
  "TRANSLATION_ADVISOR",
  "TEXT_VECTORIZER",
  "VECTOR_STORAGE",
  "QA_CHECKER",
  "TOKENIZER",
  "LLM_PROVIDER",
  "AGENT_TOOL_PROVIDER",
  "AGENT_CONTEXT_PROVIDER",
  "NLP_WORD_SEGMENTER",
] as const;
export const PluginServiceTypeSchema = z.enum(PluginServiceTypeValues);

export const ScopeTypeValues = ["GLOBAL", "PROJECT", "USER"] as const;
export const ScopeTypeSchema = z.enum(ScopeTypeValues);

export const ResourceTypeValues = [
  "PROJECT",
  "DOCUMENT",
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
] as const;
export const TranslatableElementContextTypeSchema = z.enum(
  TranslatableElementContextTypeValues,
);

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

export const AgentDefinitionTypeValues = ["GENERAL", "GHOST_TEXT", "WORKFLOW"] as const;
export const AgentDefinitionTypeSchema = z.enum(AgentDefinitionTypeValues);

// ============ Permission System Enums ============

export const ObjectTypeValues = [
  "system",
  "project",
  "document",
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
