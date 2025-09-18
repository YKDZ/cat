import z from "zod";
import { PrismaDateTime } from "./misc.ts";
import { FileSchema } from "./file.ts";
import { UserSchema } from "./user.ts";
import { VectorSchema } from "./vector.ts";
import { ProjectSchema } from "./project.ts";
import { PluginServiceSchema } from "@/schema/prisma/plugin.ts";

export const DocumentSchema = z.object({
  id: z.ulid(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  get File() {
    return FileSchema.nullable().optional();
  },

  fileHandlerId: z.int().nullable(),
  get FileHandler() {
    return PluginServiceSchema.nullable().optional();
  },

  creatorId: z.ulid(),
  get Creator() {
    return UserSchema.optional();
  },

  projectId: z.ulid(),
  get Project() {
    return ProjectSchema.optional();
  },

  get TranslatableElements() {
    return z.array(TranslatableElementSchema).optional();
  },
});

export const TranslatableElementSchema = z.object({
  id: z.int(),
  value: z.string(),
  sortIndex: z.int(),
  meta: z.json(),

  embeddingId: z.int(),
  get Embedding() {
    return VectorSchema.optional();
  },

  documentVersionId: z.int().nullable(),
  get DocumentVersion() {
    return DocumentVersionSchema.nullable().optional();
  },

  creatorId: z.ulid().nullable(),
  get Creator() {
    return UserSchema.optional().nullable();
  },

  projectId: z.ulid().nullable(),
  get Project() {
    return ProjectSchema.optional().nullable();
  },
});

export const DocumentVersionSchema = z.object({
  id: z.int(),
  isActive: z.boolean(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  documentId: z.ulid(),
  get Document() {
    return DocumentSchema.optional();
  },
});

export type Document = z.infer<typeof DocumentSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
export type TranslatableElement = z.infer<typeof TranslatableElementSchema>;
