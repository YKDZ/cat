import * as z from "zod/v4";
import { DrizzleDateTimeSchema } from "../misc.ts";
import { safeZDotJson } from "@/schema/json.ts";
import {
  TranslatableElementCommentReactionTypeSchema,
  TranslatableElementContextTypeSchema,
} from "@/schema/drizzle/enum.ts";

export const DocumentSchema = z.object({
  id: z.uuidv4(),
  name: z.string().nullable(),
  fileId: z.int().nullable(),
  fileHandlerId: z.int().nullable(),
  creatorId: z.uuidv4(),
  projectId: z.uuidv4(),
  isDirectory: z.boolean(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const TranslatableElementSchema = z.object({
  id: z.int(),
  sortIndex: z.int(),
  meta: safeZDotJson,
  documentVersionId: z.int().nullable(),
  creatorId: z.uuidv4().nullable(),
  documentId: z.uuidv4(),
  translatableStringId: z.int(),
});

export const DocumentVersionSchema = z.object({
  id: z.int(),
  isActive: z.boolean(),
  documentId: z.uuidv4(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const TranslatableStringSchema = z.object({
  id: z.int(),
  value: z.string(),
  chunkSetId: z.int(),
  languageId: z.string(),
});

export const TranslatableElementContextSchema = z.object({
  id: z.int(),
  type: TranslatableElementContextTypeSchema,
  jsonData: safeZDotJson,
  fileId: z.int().nullable(),
  storageProviderId: z.int().nullable(),
  textData: z.string().nullable(),
  translatableElementId: z.int(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const TranslatableElementCommentSchema = z.object({
  id: z.int(),
  translatableElementId: z.int(),
  userId: z.uuidv4(),
  content: z.string(),
  parentCommentId: z.int().nullable(),
  rootCommentId: z.int().nullable(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const TranslatableElementCommentReactionSchema = z.object({
  id: z.int(),
  translatableElementCommentId: z.int(),
  userId: z.uuidv4(),
  type: TranslatableElementCommentReactionTypeSchema,
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export type Document = z.infer<typeof DocumentSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
export type TranslatableElement = z.infer<typeof TranslatableElementSchema>;
export type TranslatableString = z.infer<typeof TranslatableStringSchema>;
export type TranslatableElementContext = z.infer<
  typeof TranslatableElementContextSchema
>;
export type TranslatableElementComment = z.infer<
  typeof TranslatableElementCommentSchema
>;
export type TranslatableElementCommentReaction = z.infer<
  typeof TranslatableElementCommentReactionSchema
>;
