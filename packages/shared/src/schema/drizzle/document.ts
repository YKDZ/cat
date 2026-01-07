import * as z from "zod/v4";
import { DrizzleDateTimeSchema } from "../misc.ts";
import { safeZDotJson } from "@/schema/json.ts";
import { TranslatableElementContextTypeSchema } from "@/schema/drizzle/enum.ts";

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
  sortIndex: z.int().nullable(),
  meta: safeZDotJson,
  creatorId: z.uuidv4().nullable(),
  documentId: z.uuidv4(),
  translatableStringId: z.int(),
  approvedTranslationId: z.int().nullable(),
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

export type Document = z.infer<typeof DocumentSchema>;
export type TranslatableElement = z.infer<typeof TranslatableElementSchema>;
export type TranslatableString = z.infer<typeof TranslatableStringSchema>;
export type TranslatableElementContext = z.infer<
  typeof TranslatableElementContextSchema
>;
