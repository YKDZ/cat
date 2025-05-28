import { z } from "zod/v4";
import { ElementTranslationStatusSchema } from "./misc";

export const PrimsaDateTime = z.date().or(z.iso.date());

export const PluginTagSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
});

export const PluginConfigSchema = z.object({
  id: z.number().int(),
  content: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  pluginId: z.string(),
});

export const PluginPermissionSchema = z.object({
  id: z.number().int(),
  permission: z.string(),
  description: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  pluginId: z.string(),
});

export const PluginVersionSchema = z.object({
  id: z.number().int(),
  version: z.string(),
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
  Config: PluginConfigSchema.optional(),
  Permissions: z.array(PluginPermissionSchema).optional(),
  Versions: z.array(PluginVersionSchema).optional(),
  Tags: z.array(PluginTagSchema).optional(),
});

export const TaskSchema = z.object({
  id: z.cuid2(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  status: z.enum(["pending", "processing", "completed", "failed"]),
  result: z.record(z.string(), z.unknown()).nullable(),
  type: z.string(),
});

export const VectorSchema = z.object({
  id: z.number().int(),
  vector: z.array(z.number()),
});

export const FileTypeSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  mimeType: z.string(),
  icon: z.string(),
});

export const StorageTypeSchema = z.object({
  id: z.number().int(),
  name: z.string(),
});

export const FileSchema = z.object({
  id: z.number().int(),
  originName: z.string(),
  storedPath: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  typeId: z.number().int(),
  Type: FileTypeSchema.optional(),
  storageTypeId: z.number().int(),
  StorageType: StorageTypeSchema.optional(),
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
  id: z.number().int(),
  value: z.number().int(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  voterId: z.cuid2(),
  translationId: z.number().int(),
});

export const UserSchema = z.object({
  id: z.cuid2(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean().default(false),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  writableLanguages: z.array(LanguageSchema).optional(),
  readableLanguages: z.array(LanguageSchema).optional(),
  Permissions: z.array(PermissionSchema).optional(),
  TranslationVotes: z.array(TranslationVoteSchema).optional(),
});

export const AccountSchema = z.object({
  type: z.string(),
  provider: z.string(),
  providedAccountId: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  userId: z.cuid2(),
  User: UserSchema.optional(),
});

export const TranslatableElementSchema = z.object({
  id: z.number().int(),
  value: z.string(),
  meta: z.json(),
  embeddingId: z.number().int(),
  Embedding: VectorSchema.optional(),
  // 不是数据库中的一个列
  // 仅用于前端临时储存数据
  status: ElementTranslationStatusSchema.optional().default("NO"),
});

export const TranslationSchema = z.object({
  id: z.number().int(),
  value: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  isApproved: z.boolean().default(false),
  lastApprovedAt: PrimsaDateTime.nullable(),
  translatorId: z.cuid2(),
  Translator: UserSchema.optional(),
  translatableElementId: z.number().int(),
  TranslatableElement: TranslatableElementSchema.optional(),
  languageId: z.string(),
  Language: LanguageSchema.optional(),
  TranslationVotes: z.array(TranslationVoteSchema).optional(),
});

export const DocumentSchema = z.object({
  id: z.cuid2(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  creatorId: z.cuid2(),
  Creator: UserSchema.optional(),
  TranslatableElements: z.array(TranslatableElementSchema).optional(),
  fileId: z.number().int().nullable(),
  File: FileSchema.optional(),
  projectId: z.string(),
});

export const MemoryItemSchema = z.object({
  id: z.number().int(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  source: z.string(),
  sourceLanguageId: z.string(),
  SourceLanguage: LanguageSchema.optional(),
  translation: z.string(),
  translationLanguageId: z.string(),
  TranslationLanguage: LanguageSchema.optional(),
  sourceEmbeddingId: z.number().int(),
  SourceEmbedding: z.array(z.number()).optional(),
  memoryId: z.number(),
  creatorId: z.cuid2(),
  Creator: UserSchema.optional(),
});

export const MemorySchema = z.object({
  id: z.cuid2(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  creatorId: z.cuid2(),
  Creator: UserSchema.optional(),
  MemoryItems: z.array(MemoryItemSchema).optional(),
});

export const ProjectSchema = z.object({
  id: z.cuid2(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  Memories: z.array(MemorySchema).optional(),
  sourceLanguageId: z.string(),
  SourceLanguage: LanguageSchema.optional(),
  creatorId: z.cuid2(),
  Creator: UserSchema.optional(),
  TargetLanguages: z.array(LanguageSchema).optional(),
  Documents: z.array(DocumentSchema).optional(),
});

export const PrismaErrorSchema = z.object({
  code: z.string(),
  meta: z.string(),
  message: z.string(),
  clientVersion: z.string(),
});

export const TermSchema = z.object({
  id: z.number().int(),
  value: z.string(),
  context: z.string().optional().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  glossaryId: z.cuid2(),
  languageId: z.string(),
  Language: LanguageSchema.optional(),
  creatorId: z.cuid2(),
  Creator: UserSchema.optional(),
});

export const TermRelationSchema = z.object({
  termId: z.number().int(),
  Term: TermSchema.optional(),
  translationId: z.number().int(),
  Translation: TermSchema.optional(),
});

export const GlossarySchema = z.object({
  id: z.cuid2(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  creatorId: z.cuid2(),
  Creator: UserSchema.optional(),
  GlossaryItems: z.array(TermSchema).optional(),
});

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
