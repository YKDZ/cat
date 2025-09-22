import * as z from "zod/v4";
import { PrismaDateTime } from "./misc.ts";
import { FileSchema } from "./file.ts";
import { safeZDotJson } from "@/schema/json.ts";

export const DocumentSchema = z.object({
  id: z.ulid(),
  name: z.string().nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  get File() {
    return FileSchema.nullable().optional();
  },

  fileHandlerId: z.int().nullable(),

  creatorId: z.ulid(),

  projectId: z.ulid(),
});

export const TranslatableElementSchema = z.object({
  id: z.int(),
  value: z.string(),
  sortIndex: z.int(),
  meta: safeZDotJson,

  embeddingId: z.int(),

  documentVersionId: z.int().nullable(),

  creatorId: z.ulid().nullable(),

  projectId: z.ulid().nullable(),
});

export const DocumentVersionSchema = z.object({
  id: z.int(),
  isActive: z.boolean(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  documentId: z.ulid(),
});

export type Document = z.infer<typeof DocumentSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
export type TranslatableElement = z.infer<typeof TranslatableElementSchema>;
