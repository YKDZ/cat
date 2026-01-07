import * as z from "zod";

export const TaskStatusValues = ["COMPLETED", "PENDING", "FAILED"] as const;
export const TaskStatusSchema = z.enum(TaskStatusValues);

export const PluginServiceTypeValues = [
  "AUTH_PROVIDER",
  "MFA_PROVIDER",
  "STORAGE_PROVIDER",
  "TERM_EXTRACTOR",
  "TERM_RECOGNIZER",
  "TERM_ALIGNER",
  "FILE_IMPORTER",
  "FILE_EXPORTER",
  "TRANSLATION_ADVISOR",
  "TEXT_VECTORIZER",
  "VECTOR_STORAGE",
  "QA_CHECKER",
  "TOKENIZER",
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

export type PluginServiceType = (typeof PluginServiceTypeValues)[number];
export type ScopeType = (typeof ScopeTypeValues)[number];
export type TaskStatus = (typeof TaskStatusValues)[number];
export type TranslatableElementContextType =
  (typeof TranslatableElementContextTypeValues)[number];
export type CommentReactionType = (typeof CommentReactionTypeValues)[number];
export type ResourceType = (typeof ResourceTypeValues)[number];
export type CommentTargetType = (typeof CommentTargetTypeValues)[number];
