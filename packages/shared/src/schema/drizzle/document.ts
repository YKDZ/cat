import * as z from "zod/v4";
import { DrizzleDateTimeSchema } from "../misc.ts";
import { safeZDotJson } from "@/schema/json.ts";

export const DocumentSchema = z.object({
  id: z.uuidv7(),
  name: z.string().nullable(),
  fileHandlerId: z.int().nullable(),
  creatorId: z.uuidv7(),
  projectId: z.uuidv7(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const TranslatableElementSchema = z.object({
  id: z.int(),
  sortIndex: z.int(),
  meta: safeZDotJson,
  documentVersionId: z.int().nullable(),
  creatorId: z.uuidv7().nullable(),
  documentId: z.uuidv7(),
  translatableStringId: z.int(),
});

export const DocumentVersionSchema = z.object({
  id: z.int(),
  isActive: z.boolean(),
  documentId: z.uuidv7(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const TranslatableStringSchema = z.object({
  id: z.int(),
  value: z.string(),
  chunkSetId: z.int(),
  languageId: z.string(),
});

export type Document = z.infer<typeof DocumentSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
export type TranslatableElement = z.infer<typeof TranslatableElementSchema>;
export type TranslatableString = z.infer<typeof TranslatableStringSchema>;
