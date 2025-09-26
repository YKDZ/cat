import * as z from "zod/v4";
import { PrismaDateTime } from "./misc.ts";
import { safeZDotJson } from "@/schema/json.ts";

export const DocumentSchema = z.object({
  id: z.uuidv7(),
  name: z.string().nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  fileHandlerId: z.int().nullable(),

  creatorId: z.uuidv7(),

  projectId: z.uuidv7(),
});

export const TranslatableElementSchema = z.object({
  id: z.int(),
  value: z.string(),
  sortIndex: z.int(),
  meta: safeZDotJson,

  embeddingId: z.int(),

  documentVersionId: z.int().nullable(),

  creatorId: z.uuidv7().nullable(),

  projectId: z.uuidv7().nullable(),
});

export const DocumentVersionSchema = z.object({
  id: z.int(),
  isActive: z.boolean(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  documentId: z.uuidv7(),
});

export type Document = z.infer<typeof DocumentSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
export type TranslatableElement = z.infer<typeof TranslatableElementSchema>;
