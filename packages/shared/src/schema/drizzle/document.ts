import * as z from "zod/v4";
import { DrizzleDateTimeSchema } from "./misc.ts";
import { safeZDotJson } from "@/schema/json.ts";

export const DocumentSchema = z.object({
  id: z.uuidv7(),
  name: z.string().nullable(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
  fileHandlerId: z.int().nullable(),
  creatorId: z.uuidv7(),
  projectId: z.uuidv7(),
});

export const TranslatableElementSchema = z.object({
  id: z.int(),
  sortIndex: z.int(),
  meta: safeZDotJson,
  documentVersionId: z.int().nullable(),
  creatorId: z.uuidv7().nullable(),
  documentId: z.uuidv7(),
});

export const DocumentVersionSchema = z.object({
  id: z.int(),
  isActive: z.boolean(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
  documentId: z.uuidv7(),
});

export const TranslatableStringSchema = z.object({
  id: z.int(),
  value: z.string(),
  embeddingId: z.int(),
  languageId: z.string(),
  projectId: z.uuidv7(),
});

export type Document = z.infer<typeof DocumentSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
export type TranslatableElement = z.infer<typeof TranslatableElementSchema>;
export type TranslatableString = z.infer<typeof TranslatableStringSchema>;
