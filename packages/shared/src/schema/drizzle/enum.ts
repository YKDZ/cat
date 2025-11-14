import z from "zod";

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

export type PluginServiceType = (typeof PluginServiceTypeValues)[number];
export type ScopeType = (typeof ScopeTypeValues)[number];
export type TaskStatus = (typeof TaskStatusValues)[number];
export type TranslatableElementContextType =
  (typeof TranslatableElementContextTypeValues)[number];
