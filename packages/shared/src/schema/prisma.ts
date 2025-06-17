import { z } from "zod/v4";
import { ElementTranslationStatusSchema } from "./misc";
import type { JSONSchema } from "zod/v4/core";

export const PrimsaDateTime = z.date().or(z.iso.date());

export const SettingSchema = z.object({
  id: z.int(),
  key: z.string(),
  value: z.json(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
});

export const PluginTagSchema = z.object({
  id: z.int(),
  name: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
});

export const PluginConfigSchema = z.object({
  id: z.int(),
  key: z.string(),
  value: z.json(),
  schema: z.custom<JSONSchema.JSONSchema>(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  pluginId: z.string(),
});

export const PluginPermissionSchema = z.object({
  id: z.int(),
  permission: z.string(),
  description: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  pluginId: z.string(),
});

export const PluginVersionSchema = z.object({
  id: z.int(),
  version: z.string(),
  pluginId: z.string(),
});

export const PluginComponentSchema = z.object({
  id: z.string(),
  entry: z.string(),
  mountOn: z.string(),
  pluginId: z.string(),
});

export const PluginSchema = z.object({
  id: z.string(),
  origin: z.json(),
  name: z.string(),
  overview: z.string().nullable(),
  enabled: z.boolean(),
  iconURL: z.url().nullable(),
  isExternal: z.boolean(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  get Configs() {
    return z.array(PluginConfigSchema).optional();
  },
  get Permissions() {
    return z.array(PluginPermissionSchema).optional();
  },
  get Versions() {
    return z.array(PluginVersionSchema).optional();
  },
  get Tags() {
    return z.array(PluginTagSchema).optional();
  },
});

export const TaskSchema = z.object({
  id: z.cuid2(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  status: z.enum(["pending", "processing", "completed", "failed"]),
  meta: z.json(),
  type: z.string(),
});

export const VectorSchema = z.object({
  id: z.int(),
  vector: z.array(z.number()),
});

export const FileTypeSchema = z.object({
  id: z.int(),
  name: z.string(),
  mimeType: z.string(),
  icon: z.string(),
});

export const StorageTypeSchema = z.object({
  id: z.int(),
  name: z.string(),
});

export const FileSchema = z.object({
  id: z.int(),
  originName: z.string(),
  storedPath: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  typeId: z.int(),
  get Type() {
    return FileTypeSchema.optional();
  },
  storageTypeId: z.int(),
  get StorageType() {
    return StorageTypeSchema.optional();
  },
});

export const LanguageSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const PermissionSchema = z.object({
  permission: z.string(),
  projectId: z.cuid2(),
  userId: z.cuid2(),
});

export const TranslationVoteSchema = z.object({
  id: z.int(),
  value: z.int(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  voterId: z.cuid2(),
  translationId: z.int(),
});

export const TranslationApprovmentSchema = z.object({
  id: z.int(),
  isActive: z.boolean(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  translationId: z.int(),
  userId: z.cuid2().nullable(),
});

export const UserSchema = z.object({
  id: z.cuid2(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  get WritableLanguages() {
    return z.array(LanguageSchema).optional();
  },
  get ReadableLanguages() {
    return z.array(LanguageSchema).optional();
  },
  get Permissions() {
    return z.array(PermissionSchema).optional();
  },
  get TranslationVotes() {
    return z.array(TranslationVoteSchema).optional();
  },
});

export const AccountSchema = z.object({
  type: z.string(),
  provider: z.string(),
  providedAccountId: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  userId: z.cuid2(),
  get User() {
    return UserSchema.optional();
  },
});

export const TranslatableElementSchema = z.object({
  id: z.int(),
  value: z.string(),
  meta: z.json(),
  embeddingId: z.int(),
  version: z.int(),
  isActive: z.boolean(),
  previousVersionId: z.int().nullable(),
  get Embedding() {
    return VectorSchema.optional();
  },
  // 不是数据库中的一个列
  // 仅用于前端临时储存数据
  status: ElementTranslationStatusSchema.optional().default("NO"),
});

export const TranslationSchema = z.object({
  id: z.int(),
  value: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  translatorId: z.cuid2(),
  get Translator() {
    return UserSchema.optional();
  },
  translatableElementId: z.int(),
  get TranslatableElement() {
    return TranslatableElementSchema.optional();
  },
  languageId: z.string(),
  get Language() {
    return LanguageSchema.optional();
  },
  get Votes() {
    return z.array(TranslationVoteSchema).optional();
  },
  get Approvments() {
    return z.array(TranslationApprovmentSchema).optional();
  },
});

export const DocumentSchema = z.object({
  id: z.cuid2(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  creatorId: z.cuid2(),
  get Creator() {
    return UserSchema.optional();
  },
  get TranslatableElements() {
    return z.array(TranslatableElementSchema).optional();
  },
  fileId: z.int().nullable(),
  get File() {
    return FileSchema.optional();
  },
  projectId: z.string(),
});

export const MemoryItemSchema = z.object({
  id: z.int(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  source: z.string(),
  sourceLanguageId: z.string(),
  get SourceLanguage() {
    return LanguageSchema.optional();
  },
  translation: z.string(),
  translationLanguageId: z.string(),
  get TranslationLanguage() {
    return LanguageSchema.optional();
  },
  sourceEmbeddingId: z.int(),
  get SourceEmbedding() {
    return z.array(z.number()).optional();
  },
  memoryId: z.number(),
  creatorId: z.cuid2(),
  get Creator() {
    return UserSchema.optional();
  },
});

export const MemorySchema = z.object({
  id: z.cuid2(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  creatorId: z.cuid2(),
  get Creator() {
    return UserSchema.optional();
  },
  get MemoryItems() {
    return z.array(MemoryItemSchema).optional();
  },
});

export const ProjectSchema = z.object({
  id: z.cuid2(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  get Memories() {
    return z.array(MemorySchema).optional();
  },
  sourceLanguageId: z.string(),
  get SourceLanguage() {
    return LanguageSchema.optional();
  },
  creatorId: z.cuid2(),
  get Creator() {
    return UserSchema.optional();
  },
  get TargetLanguages() {
    return z.array(LanguageSchema).optional();
  },
  get Documents() {
    return z.array(DocumentSchema).optional();
  },
});

export const PrismaErrorSchema = z.object({
  code: z.string(),
  meta: z.string(),
  message: z.string(),
  clientVersion: z.string(),
});

export const TermSchema = z.object({
  id: z.int(),
  value: z.string(),
  context: z.string().optional().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  glossaryId: z.cuid2(),
  languageId: z.string(),
  get Language() {
    return LanguageSchema.optional();
  },
  creatorId: z.cuid2(),
  get Creator() {
    return UserSchema.optional();
  },
});

export const TermRelationSchema = z.object({
  termId: z.int(),
  get Term() {
    return TermSchema.optional();
  },
  translationId: z.int(),
  get Translation() {
    return TermSchema.optional();
  },
});

export const GlossarySchema = z.object({
  id: z.cuid2(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  creatorId: z.cuid2(),
  get Creator() {
    return UserSchema.optional();
  },
  get GlossaryItems() {
    return z.array(TermSchema).optional();
  },
});

export type Setting = z.infer<typeof SettingSchema>;
export type Vector = z.infer<typeof VectorSchema>;
export type Document = z.infer<typeof DocumentSchema>;
export type FileType = z.infer<typeof FileTypeSchema>;
export type Translation = z.infer<typeof TranslationSchema>;
export type TranslatableElement = z.infer<typeof TranslatableElementSchema>;
export type Language = z.infer<typeof LanguageSchema>;
export type User = z.infer<typeof UserSchema>;
export type Account = z.infer<typeof AccountSchema>;
export type Memory = z.infer<typeof MemorySchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type PrismaError = z.infer<typeof PrismaErrorSchema>;
export type File = z.infer<typeof FileSchema>;
export type TranslationVote = z.infer<typeof TranslationVoteSchema>;
export type MemoryItem = z.infer<typeof MemoryItemSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Glossary = z.infer<typeof GlossarySchema>;
export type Term = z.infer<typeof TermSchema>;
export type TermRelation = z.infer<typeof TermRelationSchema>;
export type StorageType = z.infer<typeof StorageTypeSchema>;
export type Permission = z.infer<typeof PermissionSchema>;
export type Plugin = z.infer<typeof PluginSchema>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;
export type PluginTag = z.infer<typeof PluginTagSchema>;
export type PluginVersion = z.infer<typeof PluginVersionSchema>;
export type PluginPermission = z.infer<typeof PluginPermissionSchema>;
export type PluginComponent = z.infer<typeof PluginComponentSchema>;
