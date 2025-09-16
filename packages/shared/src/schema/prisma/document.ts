import z from "zod";
import { PrismaDateTime } from "./misc.ts";
import { FileSchema } from "./file.ts";
import { UserSchema } from "./user.ts";
import { VectorSchema } from "./vector.ts";
import { ProjectSchema } from "./project.ts";

export const DocumentSchema = z.object({
  id: z.ulid(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  get File() {
    return FileSchema.nullable().optional();
  },

  creatorId: z.ulid(),
  get Creator() {
    return UserSchema.optional();
  },

  projectId: z.string(),
  get Project() {
    return ProjectSchema.optional();
  },

  get TranslatableElements() {
    return z.array(TranslatableElementSchema).optional();
  },
});

// 使用 Omit 和 z.infer 来避免循环引用
export const TranslatableElementSchema = z.object({
  id: z.int(),
  value: z.string(),
  sortIndex: z.int(),
  meta: z.json(),
  embeddingId: z.int(),
  version: z.int(),
  isActive: z.boolean(),

  previousVersionId: z.int().nullable(),
  get Embedding() {
    return VectorSchema.optional();
  },

  documentVersionId: z.int(),
  // 避免直接引用 DocumentVersionSchema 来防止循环引用
  get DocumentVersion() {
    return z.unknown().optional();
  },
});

export const DocumentVersionSchema = z.object({
  id: z.int(),
  isActive: z.boolean(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  documentId: z.ulid(),
  // 避免直接引用 DocumentSchema 来防止循环引用
  get Document() {
    return z.unknown().optional();
  },
});

export type Document = z.infer<typeof DocumentSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
export type TranslatableElement = z.infer<typeof TranslatableElementSchema>;
