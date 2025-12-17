import * as z from "zod";

export const TaskStatusValues = ["COMPLETED", "PENDING", "FAILED"] as const;
export const TaskStatusSchema = z.enum(TaskStatusValues);

export const PluginServiceTypeValues = [
  "AUTH_PROVIDER",
  "STORAGE_PROVIDER",
  "TERM_SERVICE",
  "TRANSLATABLE_FILE_HANDLER",
  "TRANSLATION_ADVISOR",
  "TEXT_VECTORIZER",
  "VECTOR_STORAGE",
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

export const TranslatableElementCommentReactionTypeValues = [
  "+1",
  "-1",
  "LAUGH",
  "HOORAY",
  "CONFUSED",
  "HEART",
  "ROCKET",
  "EYES",
] as const;
export const TranslatableElementCommentReactionTypeSchema = z.enum(
  TranslatableElementCommentReactionTypeValues,
);

export type PluginServiceType = (typeof PluginServiceTypeValues)[number];
export type ScopeType = (typeof ScopeTypeValues)[number];
export type TaskStatus = (typeof TaskStatusValues)[number];
export type TranslatableElementContextType =
  (typeof TranslatableElementContextTypeValues)[number];
export type TranslatableElementCommentReactionType =
  (typeof TranslatableElementCommentReactionTypeValues)[number];
export type ResourceType = (typeof ResourceTypeValues)[number];
