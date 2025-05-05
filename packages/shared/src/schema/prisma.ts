import { z } from "zod";
import { ElementTranslationStatusSchema } from "./misc";

export const PrimsaDateTime = z.date().or(z.string().date());

export const FileSchema = z.object({
  id: z.number().int(),
  originName: z.string(),
  createdAt: PrimsaDateTime,
});

export const LanguageSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const ProjectPermissionSchema = z.object({
  permission: z.string(),
  projectId: z.string().cuid2(),
  userId: z.string().cuid2(),
});

export const TranslationVoteSchema = z.object({
  id: z.number().int(),
  value: z.number().int(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  voterId: z.string().cuid2(),
  translationId: z.number().int(),
});

export const UserSchema = z.object({
  id: z.string().cuid2(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean().default(false),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  writableLanguages: z.array(LanguageSchema).optional(),
  readableLanguages: z.array(LanguageSchema).optional(),
  ProjectPermissions: z.array(ProjectPermissionSchema).optional(),
  TranslationVotes: z.array(TranslationVoteSchema).optional(),
});

export const AccountSchema = z.object({
  type: z.string(),
  provider: z.string(),
  providedAccountId: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  userId: z.string().cuid2(),
  User: UserSchema.optional(),
});

export const DocumentTypeSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  icon: z.string(),
});

export const TranslatableElementSchema = z.object({
  id: z.number().int(),
  value: z.string(),
  embedding: z.array(z.number()).optional(),
  meta: z.string().or(z.unknown()),
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
  translatorId: z.string().cuid2(),
  Translator: UserSchema.optional(),
  translatableElementId: z.number().int(),
  TranslatableElement: TranslatableElementSchema.optional(),
  languageId: z.string(),
  Language: LanguageSchema.optional(),
  TranslationVotes: z.array(TranslationVoteSchema).optional(),
});

export const DocumentSchema = z.object({
  id: z.string().cuid2(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  typeId: z.number().int(),
  Type: DocumentTypeSchema,
  creatorId: z.string().cuid2(),
  Creator: UserSchema.optional(),
  TranslatableElements: z.array(TranslatableElementSchema).optional(),
  fileId: z.number().int(),
  File: FileSchema.optional(),
  projectId: z.string(),
});

export const MemoryItemSchema = z.object({
  id: z.number().int(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  translationId: z.number().int(),
  Translation: TranslationSchema.optional(),
  sourceElementId: z.number().int(),
  SoruceElement: TranslatableElementSchema.optional(),
});

export const MemorySchema = z.object({
  id: z.number().int(),
  name: z.string().optional(),
  description: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  creatorId: z.string().cuid2(),
  Creator: UserSchema.optional(),
  MemoryItems: z.array(MemoryItemSchema).optional(),
});

export const ProjectSchema = z.object({
  id: z.string().cuid2(),
  name: z.string().optional(),
  description: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  Memories: z.array(MemorySchema).optional(),
  sourceLanguageId: z.string(),
  SourceLanguage: LanguageSchema.optional(),
  TargetLanguages: z.array(LanguageSchema).optional(),
  Creator: UserSchema.optional(),
  Documents: z.array(DocumentSchema).optional(),
});

export const PrismaErrorSchema = z.object({
  code: z.string(),
  meta: z.string(),
  message: z.string(),
  clientVersion: z.string(),
});

export type Document = z.infer<typeof DocumentSchema>;
export type DocumentType = z.infer<typeof DocumentTypeSchema>;
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
